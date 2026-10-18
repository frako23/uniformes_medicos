import { inArray, sql } from "drizzle-orm";
import { clients, financings, installments } from "../../../db/schema";
import { toCents } from "../../../utils/money";
import { chunk, withBulkLock } from "../../bulk/transaction";
import type { DbOrTransaction, Transaction } from "../../db";
import { fromCents } from "../summary";
import { createFinancingSnapshot, type FinancingDraft, type FinancingSnapshot } from "./changes";
import { FINANCINGS_LOCK_KEY } from "./format";

export async function loadFinancingSnapshot(source: DbOrTransaction): Promise<FinancingSnapshot> {
  const [clientRows, financingRows] = await Promise.all([
    source.select({ id: clients.id, ref: clients.ref, name: clients.name, phoneE164: clients.phoneE164 }).from(clients),
    source.execute(sql`
      SELECT f.ref, f.client_id, f.purchase_date::text AS purchase_date,
        COALESCE(sum(i.amount_usd), 0)::text AS total
      FROM financings f LEFT JOIN installments i ON i.financing_id = f.id
      GROUP BY f.id
    `),
  ]);
  return createFinancingSnapshot(
    clientRows,
    (financingRows as unknown as Array<{ ref: number; client_id: string; purchase_date: string; total: string }>).map((row) => ({
      ref: row.ref,
      clientId: row.client_id,
      purchaseDate: row.purchase_date,
      totalCents: toCents(Number(row.total).toFixed(2)),
    })),
  );
}

/** Transacción con el bloqueo de la carga masiva y los clientes referenciados protegidos con `FOR KEY SHARE`. */
export async function withFinancingsBulkLock<T>(
  options: { phones: string[]; lockTimeoutMs?: number },
  callback: (transaction: Transaction, snapshot: FinancingSnapshot) => Promise<T>,
): Promise<T> {
  return withBulkLock({ lockKey: FINANCINGS_LOCK_KEY, lockTimeoutMs: options.lockTimeoutMs }, async (transaction) => {
    if (options.phones.length) {
      await transaction.select({ id: clients.id }).from(clients).where(inArray(clients.phoneE164, options.phones)).for("key share");
    }
    return callback(transaction, await loadFinancingSnapshot(transaction));
  });
}

/** Inserta los financiamientos y sus cuotas por lotes; las cuotas pagadas llevan origen `carga_masiva`. */
export async function insertFinancingDrafts(
  transaction: Transaction,
  drafts: FinancingDraft[],
  now: Date,
): Promise<Array<{ ref: number; label: string }>> {
  const created: Array<{ ref: number; label: string }> = [];
  for (const batch of chunk(drafts)) {
    const rows = await transaction
      .insert(financings)
      .values(
        batch.map((draft) => ({
          clientId: draft.clientId,
          description: draft.description,
          purchaseDate: draft.purchaseDate,
          frequency: draft.frequency,
          origin: "carga_masiva" as const,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .returning({ id: financings.id, ref: financings.ref });
    const values = batch.flatMap((draft, index) =>
      draft.installments.map((item) => ({
        financingId: rows[index].id,
        isInitial: item.isInitial,
        dueDate: item.dueDate,
        amountUsd: fromCents(item.amountCents),
        status: item.paid ? ("pagada" as const) : ("pendiente" as const),
        paymentOrigin: item.paid ? ("carga_masiva" as const) : null,
        createdAt: now,
        updatedAt: now,
      })),
    );
    for (const part of chunk(values)) await transaction.insert(installments).values(part);
    batch.forEach((draft, index) => created.push({ ref: rows[index].ref, label: draft.label }));
  }
  return created;
}
