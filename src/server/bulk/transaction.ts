import { sql } from "drizzle-orm";
import { withTransaction, type Transaction } from "../db";
import { HttpError } from "../http/errors";

export const WRITE_BATCH_SIZE = 1_000;

export const BULK_LOCK_KEYS = {
  inventory: 7_301_003,
  clientes: 7_301_004,
  financiamientos: 7_301_005,
  congresos: 7_301_006,
} as const;

/** Ejecuta `callback` en una transacción con el bloqueo consultivo de la carga masiva tomado. */
export async function withBulkLock<T>(
  options: { lockKey: number; lockTimeoutMs?: number },
  callback: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  const lockTimeoutMs = Math.max(1, Math.floor(options.lockTimeoutMs ?? 10_000));
  return withTransaction(async (transaction) => {
    await transaction.execute(sql.raw(`SET LOCAL lock_timeout = '${lockTimeoutMs}ms'`));
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(${options.lockKey})`);
    return callback(transaction);
  });
}

/** Código SQLSTATE de un error de PostgreSQL, también cuando Drizzle lo envuelve. */
export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function chunk<T>(items: T[], size = WRITE_BATCH_SIZE): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
  return batches;
}

/** Traduce un error de la escritura masiva en el error HTTP que corresponde, sin trazas. */
export function translateApplyError(
  error: unknown,
  options: { changedMessage: string; conflictCodes?: string[] },
): HttpError {
  if (error instanceof HttpError) return error;
  const code = pgErrorCode(error);
  if (code === "55P03") {
    return new HttpError(409, "CONFLICT", "Otra carga se está aplicando. Inténtalo de nuevo en unos segundos.");
  }
  if (code && (options.conflictCodes ?? ["23505", "23503"]).includes(code)) {
    return new HttpError(409, "CONFLICT", options.changedMessage);
  }
  return new HttpError(500, "DATABASE_ERROR", "No se aplicó ningún cambio. Inténtalo de nuevo.");
}
