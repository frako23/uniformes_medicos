import { desc, sql } from "drizzle-orm";
import { euroRates } from "../../db/schema";
import { isValidIsoDate, todayInCaracas } from "../../utils/dates";
import { chunk } from "../bulk/transaction";
import { db } from "../db";

export const EURO_SOURCE_URL = "https://ve.dolarapi.com/v1/historicos/euros/oficial";
const TIMEOUT_MS = 3000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const RETRY_AFTER_MS = 30 * 60_000;

export interface SourceRate {
  rateDate: string;
  /** Tasa redondeada a 2 decimales (half-up). */
  value: string;
  /** `promedio` tal como lo publica la fuente. */
  sourceValue: string;
}

/** Redondeo half-up a 2 decimales sobre la representación decimal en texto. */
export function roundHalfUp2(input: string): string {
  const [whole, fraction = ""] = input.split(".");
  const padded = (fraction + "000").slice(0, 3);
  let cents = BigInt(whole) * 100n + BigInt(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) cents += 1n;
  const text = cents.toString().padStart(3, "0");
  return `${text.slice(0, -2)}.${text.slice(-2)}`;
}

/** Texto decimal de un número sin notación científica. */
function decimalText(value: number): string {
  const text = String(value);
  return /e/i.test(text) ? value.toFixed(8) : text;
}

/** Elementos válidos del histórico; descarta uno a uno los que no cumplen el contrato. */
export function parseSourceItems(payload: unknown): SourceRate[] {
  if (!Array.isArray(payload)) return [];
  const result: SourceRate[] = [];
  for (const item of payload) {
    if (!item || typeof item !== "object") continue;
    const { fecha, promedio, moneda, fuente } = item as Record<string, unknown>;
    if (moneda !== "EUR" || fuente !== "oficial") continue;
    if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !isValidIsoDate(fecha)) continue;
    if (typeof promedio !== "number" || !Number.isFinite(promedio) || promedio <= 0 || promedio >= 1e12) continue;
    const text = decimalText(promedio);
    const value = roundHalfUp2(text);
    if (value === "0.00") continue;
    result.push({ rateDate: fecha, value, sourceValue: promedio.toFixed(8) });
  }
  return result;
}

/** La tasa de la entrada con la mayor fecha ≤ `date`. */
export function pickApplicableRate<T extends { rateDate: string }>(rates: T[], date: string): T | null {
  let best: T | null = null;
  for (const rate of rates) {
    if (rate.rateDate <= date && (!best || rate.rateDate > best.rateDate)) best = rate;
  }
  return best;
}

export function shouldSync(input: {
  latestRateDate: string | null;
  today: string;
  lastAttemptAt: number | null;
  now: number;
}): boolean {
  if (input.latestRateDate !== null && input.latestRateDate >= input.today) return false;
  return input.lastAttemptAt === null || input.now - input.lastAttemptAt > RETRY_AFTER_MS;
}

interface SyncState {
  lastAttemptAt: number | null;
  lastFailed: boolean;
}
const state: SyncState = { lastAttemptAt: null, lastFailed: false };

/** Solo para las pruebas. */
export function resetEuroRateSyncState() {
  state.lastAttemptAt = null;
  state.lastFailed = false;
}

async function readLimited(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new Error("body too large");
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("body too large");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function latestRateDate(): Promise<string | null> {
  const [row] = await db().select({ rateDate: euroRates.rateDate }).from(euroRates).orderBy(desc(euroRates.rateDate)).limit(1);
  return row?.rateDate ?? null;
}

export interface SyncOptions {
  fetchImpl?: typeof fetch;
  now?: Date;
}

/** Descarga el histórico solo si hace falta (contracts/euro-rate-source.md). Nunca lanza. */
export async function ensureEuroRates(
  today: string,
  options: SyncOptions = {},
): Promise<{ status: "skipped" | "ok" | "failed"; inserted: number; durationMs: number }> {
  const now = (options.now ?? new Date()).getTime();
  const started = Date.now();
  try {
    const latest = await latestRateDate();
    if (!shouldSync({ latestRateDate: latest, today, lastAttemptAt: state.lastAttemptAt, now })) {
      return { status: "skipped", inserted: 0, durationMs: 0 };
    }
    state.lastAttemptAt = now;
    const response = await (options.fetchImpl ?? fetch)(EURO_SOURCE_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const items = parseSourceItems(JSON.parse(await readLimited(response)));
    let inserted = 0;
    const fetchedAt = new Date(now);
    for (const batch of chunk(items, 1_000)) {
      const rows = await db()
        .insert(euroRates)
        .values(batch.map((item) => ({ ...item, fetchedAt })))
        .onConflictDoNothing({ target: euroRates.rateDate })
        .returning({ rateDate: euroRates.rateDate });
      inserted += rows.length;
    }
    state.lastFailed = items.length === 0;
    const result = { status: items.length === 0 ? ("failed" as const) : ("ok" as const), inserted, durationMs: Date.now() - started };
    console.info("euro-rates.sync", result);
    return result;
  } catch {
    state.lastFailed = true;
    const result = { status: "failed" as const, inserted: 0, durationMs: Date.now() - started };
    console.info("euro-rates.sync", result);
    return result;
  }
}

export interface EuroRateResolution {
  status: "ok" | "unavailable";
  rate: { value: string; rateDate: string; source: "oficial" } | null;
  stale: boolean;
}

/** Tasa oficial aplicable a `date` (sincroniza antes si hace falta). */
export async function resolveEuroRate(date: string, options: SyncOptions = {}): Promise<EuroRateResolution> {
  const now = options.now ?? new Date();
  const today = todayInCaracas(now);
  await ensureEuroRates(today, options);
  const [row] = await db()
    .select({ rateDate: euroRates.rateDate, value: euroRates.value })
    .from(euroRates)
    .where(sql`${euroRates.rateDate} <= ${date}`)
    .orderBy(desc(euroRates.rateDate))
    .limit(1);
  if (!row) return { status: "unavailable", rate: null, stale: state.lastFailed };
  const latest = await latestRateDate();
  return {
    status: "ok",
    rate: { value: row.value, rateDate: row.rateDate, source: "oficial" },
    stale: state.lastFailed && (latest ?? "") < today,
  };
}
