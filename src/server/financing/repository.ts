import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { clients, financings, installments, type Client, type Financing, type Installment } from "../../db/schema";
import { addDays, monthRange } from "../../utils/dates";
import type { DbOrTransaction, Transaction } from "../db";
import type { InstallmentsQuery } from "../validation/financing";

export interface NewInstallment {
  isInitial: boolean;
  dueDate: string;
  amountUsd: string;
}

export interface FinancingRecord {
  financing: Financing;
  client: Client;
  installments: Installment[];
}

export async function insertFinancingWithInstallments(
  transaction: Transaction,
  input: {
    clientId: string;
    description: string;
    purchaseDate: string;
    frequency: "semanal" | "quincenal" | "mensual";
    installments: NewInstallment[];
  },
): Promise<{ financing: Financing; installments: Installment[] }> {
  const [financing] = await transaction
    .insert(financings)
    .values({
      clientId: input.clientId,
      description: input.description,
      purchaseDate: input.purchaseDate,
      frequency: input.frequency,
      origin: "panel",
    })
    .returning();
  const rows = await transaction
    .insert(installments)
    .values(input.installments.map((item) => ({ ...item, financingId: financing.id })))
    .returning();
  return { financing, installments: rows };
}

export async function getFinancingByRef(source: DbOrTransaction, ref: number): Promise<FinancingRecord | undefined> {
  const [row] = await source
    .select({ financing: financings, client: clients })
    .from(financings)
    .innerJoin(clients, eq(clients.id, financings.clientId))
    .where(eq(financings.ref, ref))
    .limit(1);
  if (!row) return undefined;
  const items = await source
    .select()
    .from(installments)
    .where(eq(installments.financingId, row.financing.id))
    .orderBy(asc(installments.dueDate), asc(installments.createdAt));
  return { ...row, installments: items };
}

/** Bloquea los financiamientos (`FOR UPDATE`) en un orden estable y devuelve sus filas. */
export async function lockFinancings(transaction: Transaction, ids: string[]): Promise<Financing[]> {
  if (!ids.length) return [];
  return transaction
    .select()
    .from(financings)
    .where(inArray(financings.id, ids))
    .orderBy(asc(financings.id))
    .for("update");
}

export async function lockFinancingByRef(transaction: Transaction, ref: number): Promise<Financing | undefined> {
  const [row] = await transaction.select().from(financings).where(eq(financings.ref, ref)).for("update");
  return row;
}

export async function listInstallments(source: DbOrTransaction, financingId: string): Promise<Installment[]> {
  return source.select().from(installments).where(eq(installments.financingId, financingId));
}

export interface PendingInstallmentEdit {
  id?: string;
  dueDate: string;
  amountUsd: string;
}

/**
 * Deja las cuotas pendientes como la lista indicada: actualiza las que traen `id`, inserta las nuevas y elimina las
 * pendientes que ya no aparecen. No toca las cuotas pagadas.
 */
export async function replacePendingInstallments(
  transaction: Transaction,
  financingId: string,
  list: PendingInstallmentEdit[],
  now: Date,
): Promise<void> {
  const keepIds = list.flatMap((item) => (item.id ? [item.id] : []));
  const pending = and(eq(installments.financingId, financingId), eq(installments.status, "pendiente"));
  await transaction
    .delete(installments)
    .where(keepIds.length ? and(pending, sql`${installments.id} NOT IN (${sql.join(keepIds.map((id) => sql`${id}::uuid`), sql`, `)})`) : pending);
  for (const item of list) {
    if (item.id) {
      await transaction
        .update(installments)
        .set({ dueDate: item.dueDate, amountUsd: item.amountUsd, updatedAt: now })
        .where(and(eq(installments.id, item.id), eq(installments.status, "pendiente")));
    } else {
      await transaction.insert(installments).values({ financingId, dueDate: item.dueDate, amountUsd: item.amountUsd, isInitial: false });
    }
  }
}

export async function setDescription(transaction: Transaction, id: string, description: string): Promise<void> {
  await transaction.update(financings).set({ description }).where(eq(financings.id, id));
}

export async function setAnnulment(
  transaction: Transaction,
  id: string,
  value: { reason: string | null } | null,
  now: Date,
): Promise<void> {
  await transaction
    .update(financings)
    .set(
      value
        ? { annulledAt: now, annulmentReason: value.reason, updatedAt: now }
        : { annulledAt: null, annulmentReason: null, updatedAt: now },
    )
    .where(eq(financings.id, id));
}

export async function deleteFinancing(transaction: Transaction, id: string): Promise<void> {
  await transaction.delete(financings).where(eq(financings.id, id));
}

export async function touchFinancing(transaction: Transaction, id: string, now: Date): Promise<void> {
  await transaction.update(financings).set({ updatedAt: now }).where(eq(financings.id, id));
}

/* Lista y resumen de cuotas ----------------------------------------------- */

export interface InstallmentListRow {
  id: string;
  financingRef: number;
  financingId: string;
  clientRef: number;
  clientName: string;
  phoneE164: string;
  description: string;
  isInitial: boolean;
  createdAt: Date;
  dueDate: string;
  amountUsd: string;
  status: "pendiente" | "pagada";
  financingAnnulled: boolean;
  paidOn: string | null;
  paymentCurrency: "USD" | "VES" | null;
  euroRate: string | null;
  euroRateDate: string | null;
  euroRateSource: "oficial" | "manual" | null;
  amountVes: string | null;
  paymentReference: string | null;
  paymentOrigin: "panel" | "carga_masiva" | null;
}

export async function listInstallmentRows(source: DbOrTransaction, query: InstallmentsQuery, today: string) {
  const conditions = [sql`TRUE`];
  const paid = query.status === "paid";
  conditions.push(paid ? sql`i.status = 'pagada'` : sql`i.status = 'pendiente'`);
  if (query.status === "overdue") conditions.push(sql`i.due_date < ${today}`);
  if (query.status === "upcoming") conditions.push(sql`i.due_date >= ${today} AND i.due_date <= ${addDays(today, 15)}`);
  if (query.client) conditions.push(sql`c.ref = ${query.client}`);
  const dateColumn = paid ? sql`i.paid_on` : sql`i.due_date`;
  if (query.from) conditions.push(sql`${dateColumn} >= ${query.from}`);
  if (query.to) conditions.push(sql`${dateColumn} <= ${query.to}`);
  const where = sql.join(conditions, sql` AND `);
  const order = paid
    ? sql`i.paid_on DESC NULLS LAST, f.ref DESC, i.created_at`
    : sql`i.due_date, f.ref, i.created_at, i.id`;
  const offset = (query.page - 1) * query.pageSize;
  const base = sql`FROM installments i JOIN financings f ON f.id = i.financing_id JOIN clients c ON c.id = f.client_id`;
  const [rows, count] = await Promise.all([
    source.execute(sql`
      SELECT i.id, f.ref AS financing_ref, f.id AS financing_id, c.ref AS client_ref, c.name AS client_name,
        c.phone_e164, f.description, i.is_initial, i.created_at, i.due_date::text AS due_date,
        i.amount_usd::text AS amount_usd, i.status, f.annulled_at IS NOT NULL AS annulled,
        i.paid_on::text AS paid_on, i.payment_currency, i.euro_rate::text AS euro_rate,
        i.euro_rate_date::text AS euro_rate_date, i.euro_rate_source, i.amount_ves::text AS amount_ves,
        i.payment_reference, i.payment_origin
      ${base} WHERE ${where} ORDER BY ${order} LIMIT ${query.pageSize} OFFSET ${offset}
    `),
    source.execute(sql`SELECT count(*)::int AS total ${base} WHERE ${where}`),
  ]);
  type Raw = Record<string, unknown>;
  const data = (rows as unknown as Raw[]).map(
    (row): InstallmentListRow => ({
      id: row.id as string,
      financingRef: row.financing_ref as number,
      financingId: row.financing_id as string,
      clientRef: row.client_ref as number,
      clientName: row.client_name as string,
      phoneE164: row.phone_e164 as string,
      description: row.description as string,
      isInitial: row.is_initial as boolean,
      createdAt: row.created_at as Date,
      dueDate: row.due_date as string,
      amountUsd: row.amount_usd as string,
      status: row.status as "pendiente" | "pagada",
      financingAnnulled: row.annulled as boolean,
      paidOn: row.paid_on as string | null,
      paymentCurrency: row.payment_currency as "USD" | "VES" | null,
      euroRate: row.euro_rate as string | null,
      euroRateDate: row.euro_rate_date as string | null,
      euroRateSource: row.euro_rate_source as "oficial" | "manual" | null,
      amountVes: row.amount_ves as string | null,
      paymentReference: row.payment_reference as string | null,
      paymentOrigin: row.payment_origin as "panel" | "carga_masiva" | null,
    }),
  );
  return { data, total: (count as unknown as Array<{ total: number }>)[0].total };
}

/** Todas las cuotas de los financiamientos dados, para numerar las etiquetas (“2 de 4”). */
export async function listInstallmentsOfFinancings(source: DbOrTransaction, financingIds: string[]): Promise<Installment[]> {
  if (!financingIds.length) return [];
  return source.select().from(installments).where(inArray(installments.financingId, financingIds));
}

export async function receivableSummary(source: DbOrTransaction, today: string) {
  const month = monthRange(today.slice(0, 7));
  const rows = (await source.execute(sql`
    SELECT
      COALESCE(sum(i.amount_usd) FILTER (WHERE i.status = 'pendiente' AND f.annulled_at IS NULL), 0)::text AS receivable,
      COALESCE(sum(i.amount_usd) FILTER (WHERE i.status = 'pendiente' AND f.annulled_at IS NULL AND i.due_date < ${today}), 0)::text AS overdue,
      COALESCE(sum(i.amount_usd) FILTER (WHERE i.status = 'pendiente' AND f.annulled_at IS NULL AND i.due_date >= ${today} AND i.due_date <= ${addDays(today, 15)}), 0)::text AS next15,
      COALESCE(sum(i.amount_usd) FILTER (WHERE i.status = 'pagada' AND i.paid_on >= ${month.start} AND i.paid_on <= ${month.end}), 0)::text AS collected,
      (SELECT count(*) FROM financings)::int AS financings
    FROM installments i JOIN financings f ON f.id = i.financing_id
  `)) as unknown as Array<{ receivable: string; overdue: string; next15: string; collected: string; financings: number }>;
  const row = rows[0];
  const money = (value: string) => Number(value).toFixed(2);
  return {
    receivableUsd: money(row.receivable),
    overdueUsd: money(row.overdue),
    next15DaysUsd: money(row.next15),
    collectedThisMonthUsd: money(row.collected),
    totalFinancings: row.financings,
  };
}
