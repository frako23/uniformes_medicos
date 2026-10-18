import { sql } from "drizzle-orm";
import { clients, type Client } from "../../db/schema";
import { normalizeKey } from "../../utils/text-keys";
import { phoneSearchDigits } from "../../utils/phone";
import type { DbOrTransaction } from "../db";
import { deriveFinancingStatus, totals, type FinancingStatus } from "../financing/summary";
import type { ClientListQuery } from "../validation/clients";

export interface ClientListRow {
  ref: number;
  name: string;
  phoneE164: string;
  sex: "Mujer" | "Hombre" | null;
  size: string | null;
  city: string | null;
  hospital: string | null;
  clinic: string | null;
  specialty: string | null;
  balanceUsd: string;
  hasOverdue: boolean;
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => "\\" + char);

function filterConditions(query: ClientListQuery, today: string) {
  const conditions = [sql`TRUE`];
  if (query.search) {
    const key = escapeLike(normalizeKey(query.search));
    const digits = phoneSearchDigits(query.search);
    conditions.push(
      digits
        ? sql`(c.search_text LIKE ${`%${key}%`} OR c.phone_e164 LIKE ${`%${escapeLike(digits)}%`})`
        : sql`c.search_text LIKE ${`%${key}%`}`,
    );
  }
  if (query.specialty) conditions.push(sql`c.specialty = ${query.specialty}`);
  if (query.city) conditions.push(sql`c.city = ${query.city}`);
  if (query.hospital) conditions.push(sql`c.hospital = ${query.hospital}`);
  if (query.clinic) conditions.push(sql`c.clinic = ${query.clinic}`);
  if (query.size) conditions.push(sql`c.size = ${query.size}`);
  if (query.sex) conditions.push(sql`c.sex = ${query.sex}`);
  if (query.balance) {
    const overdue = query.balance === "overdue" ? sql` AND i.due_date < ${today}` : sql``;
    conditions.push(sql`EXISTS (
      SELECT 1 FROM financings f JOIN installments i ON i.financing_id = f.id
      WHERE f.client_id = c.id AND f.annulled_at IS NULL AND i.status = 'pendiente'${overdue}
    )`);
  }
  return sql.join(conditions, sql` AND `);
}

interface RawListRow {
  ref: number;
  name: string;
  phone_e164: string;
  sex: ClientListRow["sex"];
  size: string | null;
  city: string | null;
  hospital: string | null;
  clinic: string | null;
  specialty: string | null;
  balance_usd: string;
  has_overdue: boolean;
}

export async function listClients(source: DbOrTransaction, query: ClientListQuery, today: string) {
  const where = filterConditions(query, today);
  const offset = (query.page - 1) * query.pageSize;
  const [rows, counts] = await Promise.all([
    source.execute(sql`
      SELECT c.ref, c.name, c.phone_e164, c.sex, c.size, c.city, c.hospital, c.clinic, c.specialty,
        COALESCE((
          SELECT sum(i.amount_usd) FROM installments i JOIN financings f ON f.id = i.financing_id
          WHERE f.client_id = c.id AND f.annulled_at IS NULL AND i.status = 'pendiente'
        ), 0)::text AS balance_usd,
        EXISTS (
          SELECT 1 FROM installments i JOIN financings f ON f.id = i.financing_id
          WHERE f.client_id = c.id AND f.annulled_at IS NULL AND i.status = 'pendiente' AND i.due_date < ${today}
        ) AS has_overdue
      FROM clients c
      WHERE ${where}
      ORDER BY c.search_text, c.ref
      LIMIT ${query.pageSize} OFFSET ${offset}
    `),
    source.execute(sql`
      SELECT
        (SELECT count(*) FROM clients c WHERE ${where})::int AS total,
        (SELECT count(*) FROM clients)::int AS total_clients
    `),
  ]);
  const count = (counts as unknown as Array<{ total: number; total_clients: number }>)[0];
  const data: ClientListRow[] = (rows as unknown as RawListRow[]).map((row) => ({
    ref: row.ref,
    name: row.name,
    phoneE164: row.phone_e164,
    sex: row.sex,
    size: row.size,
    city: row.city,
    hospital: row.hospital,
    clinic: row.clinic,
    specialty: row.specialty,
    balanceUsd: Number(row.balance_usd).toFixed(2),
    hasOverdue: row.has_overdue,
  }));
  return { data, total: count.total, totalClients: count.total_clients };
}

export async function getClientByRef(source: DbOrTransaction, ref: number): Promise<Client | undefined> {
  const rows = await source.select().from(clients).where(sql`${clients.ref} = ${ref}`).limit(1);
  return rows[0];
}

export async function findClientByPhone(source: DbOrTransaction, phoneE164: string): Promise<Client | undefined> {
  const rows = await source.select().from(clients).where(sql`${clients.phoneE164} = ${phoneE164}`).limit(1);
  return rows[0];
}

export type ClientValues = Omit<typeof clients.$inferInsert, "id" | "ref" | "createdAt" | "updatedAt">;

export async function insertClient(source: DbOrTransaction, values: ClientValues): Promise<Client> {
  const [row] = await source.insert(clients).values(values).returning();
  return row;
}

/** Actualiza solo si `updated_at` coincide (a precisión de milisegundos, como viaja en JSON). */
export async function updateClientIfUnchanged(
  source: DbOrTransaction,
  ref: number,
  values: ClientValues,
  expectedUpdatedAt: string,
): Promise<Client | undefined> {
  const rows = await source
    .update(clients)
    .set({ ...values, updatedAt: sql`now()` })
    .where(sql`${clients.ref} = ${ref} AND date_trunc('milliseconds', ${clients.updatedAt}) = ${new Date(expectedUpdatedAt).toISOString()}::timestamptz`)
    .returning();
  return rows[0];
}

export async function deleteClientByRef(source: DbOrTransaction, ref: number): Promise<boolean> {
  const rows = await source.delete(clients).where(sql`${clients.ref} = ${ref}`).returning({ id: clients.id });
  return rows.length > 0;
}

export async function clientHasFinancings(source: DbOrTransaction, clientId: string): Promise<boolean> {
  const rows = (await source.execute(
    sql`SELECT EXISTS (SELECT 1 FROM financings WHERE client_id = ${clientId}) AS found`,
  )) as unknown as Array<{ found: boolean }>;
  return rows[0].found;
}

export interface ClientFinancingRow {
  ref: number;
  description: string;
  purchaseDate: string;
  totalUsd: string;
  paidUsd: string;
  balanceUsd: string;
  status: FinancingStatus;
}

interface FinancingItem {
  status: "pendiente" | "pagada";
  amountUsd: string;
  dueDate: string;
}

export async function listClientFinancings(
  source: DbOrTransaction,
  clientId: string,
  today: string,
): Promise<ClientFinancingRow[]> {
  const rows = (await source.execute(sql`
    SELECT f.ref, f.description, f.purchase_date::text AS purchase_date, f.annulled_at IS NOT NULL AS annulled,
      i.status, i.amount_usd::text AS amount_usd, i.due_date::text AS due_date
    FROM financings f LEFT JOIN installments i ON i.financing_id = f.id
    WHERE f.client_id = ${clientId}
    ORDER BY f.purchase_date DESC, f.ref DESC
  `)) as unknown as Array<{
    ref: number;
    description: string;
    purchase_date: string;
    annulled: boolean;
    status: "pendiente" | "pagada" | null;
    amount_usd: string | null;
    due_date: string | null;
  }>;
  const grouped = new Map<number, { ref: number; description: string; purchaseDate: string; annulled: boolean; items: FinancingItem[] }>();
  for (const row of rows) {
    const entry = grouped.get(row.ref) ?? {
      ref: row.ref,
      description: row.description,
      purchaseDate: row.purchase_date,
      annulled: row.annulled,
      items: [],
    };
    if (row.status && row.amount_usd && row.due_date) {
      entry.items.push({ status: row.status, amountUsd: row.amount_usd, dueDate: row.due_date });
    }
    grouped.set(row.ref, entry);
  }
  return [...grouped.values()].map((entry) => {
    const sums = totals(entry.items);
    return {
      ref: entry.ref,
      description: entry.description,
      purchaseDate: entry.purchaseDate,
      totalUsd: sums.total,
      paidUsd: sums.paid,
      balanceUsd: sums.balance,
      status: deriveFinancingStatus({ annulled: entry.annulled, installments: entry.items }, today),
    };
  });
}
