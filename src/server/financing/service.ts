import { todayInCaracas } from "../../utils/dates";
import { validateSchedule } from "../../utils/financing-schedule";
import { formatPhone } from "../../utils/phone";
import { whatsappUrl } from "../../utils/whatsapp";
import { pgErrorCode } from "../bulk/transaction";
import { getClientByRef } from "../clients/repository";
import { db, withTransaction } from "../db";
import { HttpError } from "../http/errors";
import {
  annulSchema,
  installmentsQuerySchema,
  deleteSchema,
  financingCreateSchema,
  financingUpdateSchema,
  restoreSchema,
} from "../validation/financing";
import { parseOrThrow } from "../validation/parse";
import { resolveEuroRate } from "./euro-rates";
import {
  deleteFinancing as deleteFinancingRow,
  listInstallmentRows,
  listInstallmentsOfFinancings,
  receivableSummary,
  getFinancingByRef,
  insertFinancingWithInstallments,
  listInstallments,
  lockFinancingByRef,
  replacePendingInstallments,
  setAnnulment,
  setDescription,
  touchFinancing,
  type FinancingRecord,
} from "./repository";
import {
  deriveFinancingStatus,
  installmentLabels,
  installmentState,
  toCents,
  toInstallmentListItem,
  toPaymentInfo,
  totals,
  type FinancingStatus,
  type InstallmentStateName,
  type PaymentInfo,
} from "./summary";

export interface FinancingInstallmentDetail {
  id: string;
  label: string;
  isInitial: boolean;
  dueDate: string;
  amountUsd: string;
  state: InstallmentStateName;
  daysOverdue: number;
  payment: PaymentInfo | null;
}

export interface FinancingDetail {
  ref: number;
  client: { ref: number; name: string; phone: string; phoneE164: string; whatsappUrl: string };
  description: string;
  purchaseDate: string;
  frequency: "semanal" | "quincenal" | "mensual";
  origin: "panel" | "carga_masiva";
  totalUsd: string;
  paidUsd: string;
  balanceUsd: string;
  status: FinancingStatus;
  annulledAt: string | null;
  annulmentReason: string | null;
  updatedAt: string;
  installments: FinancingInstallmentDetail[];
}

export const CHANGED_MESSAGE = "El financiamiento cambió; recarga la página.";
const NOT_FOUND = () => new HttpError(404, "NOT_FOUND", "Financiamiento no encontrado.");
const changed = () => new HttpError(409, "CONFLICT", CHANGED_MESSAGE, { expectedUpdatedAt: CHANGED_MESSAGE });

export function toDetail(record: FinancingRecord, today: string): FinancingDetail {
  const { financing, client } = record;
  const items = record.installments.map((row) => ({
    row,
    id: row.id,
    isInitial: row.isInitial,
    dueDate: row.dueDate,
    createdAt: row.createdAt,
  }));
  const labeled = installmentLabels(items);
  const sums = totals(record.installments.map((row) => ({ status: row.status, amountUsd: row.amountUsd })));
  return {
    ref: financing.ref,
    client: {
      ref: client.ref,
      name: client.name,
      phone: formatPhone(client.phoneE164),
      phoneE164: client.phoneE164,
      whatsappUrl: whatsappUrl(client.phoneE164),
    },
    description: financing.description,
    purchaseDate: financing.purchaseDate,
    frequency: financing.frequency,
    origin: financing.origin,
    totalUsd: sums.total,
    paidUsd: sums.paid,
    balanceUsd: sums.balance,
    status: deriveFinancingStatus(
      {
        annulled: financing.annulledAt !== null,
        installments: record.installments.map((row) => ({ status: row.status, dueDate: row.dueDate })),
      },
      today,
    ),
    annulledAt: financing.annulledAt?.toISOString() ?? null,
    annulmentReason: financing.annulmentReason,
    updatedAt: financing.updatedAt.toISOString(),
    installments: labeled.map(({ row, label }) => ({
      id: row.id,
      label,
      isInitial: row.isInitial,
      dueDate: row.dueDate,
      amountUsd: row.amountUsd,
      ...installmentState(row, today),
      payment: toPaymentInfo(row),
    })),
  };
}

export async function getFinancingDetail(ref: number, now: Date = new Date()): Promise<FinancingDetail> {
  const record = await getFinancingByRef(db(), ref);
  if (!record) throw NOT_FOUND();
  return toDetail(record, todayInCaracas(now));
}

/** Errores de calendario como `fields["installments.3.dueDate"]`. */
function scheduleFields(
  prefix: string,
  errors: ReturnType<typeof validateSchedule>,
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const error of errors) {
    const key = error.index < 0 ? error.field : `${prefix}.${error.index}.${error.field === "amount" ? "amountUsd" : error.field}`;
    fields[key] ??= error.message;
  }
  return fields;
}

export async function createFinancing(rawInput: unknown, now: Date = new Date()): Promise<FinancingDetail> {
  const input = parseOrThrow(financingCreateSchema, rawInput);
  const today = todayInCaracas(now);
  const client = await getClientByRef(db(), input.clientRef);
  if (!client) throw new HttpError(404, "NOT_FOUND", "Cliente no encontrado.");

  const fields = scheduleFields(
    "installments",
    validateSchedule({
      purchaseDate: input.purchaseDate,
      today,
      installments: input.installments.map((item) => ({ dueDate: item.dueDate, amountCents: toCents(item.amountUsd) })),
    }),
  );
  if (Object.keys(fields).length) throw new HttpError(422, "VALIDATION_ERROR", "Revisa los campos indicados.", fields);

  const ref = await withTransaction(async (transaction) => {
    const created = await insertFinancingWithInstallments(transaction, {
      clientId: client.id,
      description: input.description,
      purchaseDate: input.purchaseDate,
      frequency: input.frequency,
      installments: input.installments,
    });
    return created.financing.ref;
  });
  return getFinancingDetail(ref, now);
}

export async function updateFinancing(ref: number, rawInput: unknown, now: Date = new Date()): Promise<FinancingDetail> {
  const input = parseOrThrow(financingUpdateSchema, rawInput);
  await withTransaction(async (transaction) => {
    const locked = await lockFinancingByRef(transaction, ref);
    if (!locked) throw NOT_FOUND();
    if (locked.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) throw changed();
    if (locked.annulledAt) {
      const message = "El financiamiento está anulado y no puede editarse.";
      throw new HttpError(409, "CONFLICT", message, { financing: message });
    }

    const existing = await listInstallments(transaction, locked.id);
    const byId = new Map(existing.map((row) => [row.id, row]));
    for (const item of input.pendingInstallments) {
      if (!item.id) continue;
      const row = byId.get(item.id);
      if (!row || row.status !== "pendiente") {
        const message = "Algunas cuotas ya estaban pagadas o no pertenecen a este financiamiento. Recarga la página.";
        throw new HttpError(409, "CONFLICT", message, { installments: message });
      }
    }
    const paidCount = existing.filter((row) => row.status === "pagada").length;
    if (paidCount + input.pendingInstallments.length === 0) {
      throw new HttpError(422, "VALIDATION_ERROR", "Revisa los campos indicados.", {
        pendingInstallments: "El financiamiento debe conservar al menos una cuota.",
      });
    }
    const fields = scheduleFields(
      "pendingInstallments",
      validateSchedule({
        purchaseDate: locked.purchaseDate,
        today: "9999-12-31",
        installments: input.pendingInstallments.map((item) => ({ dueDate: item.dueDate, amountCents: toCents(item.amountUsd) })),
      }),
    );
    if (Object.keys(fields).length) throw new HttpError(422, "VALIDATION_ERROR", "Revisa los campos indicados.", fields);

    await replacePendingInstallments(transaction, locked.id, input.pendingInstallments, now);
    await setDescription(transaction, locked.id, input.description);
    await touchFinancing(transaction, locked.id, now);
  });
  return getFinancingDetail(ref, now);
}

export async function annulFinancing(ref: number, rawInput: unknown, now: Date = new Date()): Promise<FinancingDetail> {
  const input = parseOrThrow(annulSchema, rawInput);
  await withTransaction(async (transaction) => {
    const locked = await lockFinancingByRef(transaction, ref);
    if (!locked) throw NOT_FOUND();
    if (locked.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) throw changed();
    if (locked.annulledAt) {
      const message = "El financiamiento ya estaba anulado.";
      throw new HttpError(409, "CONFLICT", message, { financing: message });
    }
    await setAnnulment(transaction, locked.id, { reason: input.reason }, now);
  });
  return getFinancingDetail(ref, now);
}

export async function restoreFinancing(ref: number, rawInput: unknown, now: Date = new Date()): Promise<FinancingDetail> {
  const input = parseOrThrow(restoreSchema, rawInput);
  await withTransaction(async (transaction) => {
    const locked = await lockFinancingByRef(transaction, ref);
    if (!locked) throw NOT_FOUND();
    if (locked.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) throw changed();
    if (!locked.annulledAt) {
      const message = "El financiamiento no estaba anulado.";
      throw new HttpError(409, "CONFLICT", message, { financing: message });
    }
    await setAnnulment(transaction, locked.id, null, now);
  });
  return getFinancingDetail(ref, now);
}

export async function deleteFinancing(ref: number, rawInput: unknown): Promise<void> {
  const input = parseOrThrow(deleteSchema, rawInput);
  const hasPayments = () => {
    const message = "Este financiamiento tiene pagos registrados y no puede eliminarse. Puedes anularlo.";
    return new HttpError(409, "CONFLICT", message, { installments: message });
  };
  try {
    await withTransaction(async (transaction) => {
      const locked = await lockFinancingByRef(transaction, ref);
      if (!locked) throw NOT_FOUND();
      if (locked.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) throw changed();
      const items = await listInstallments(transaction, locked.id);
      if (items.some((row) => row.status === "pagada")) throw hasPayments();
      await deleteFinancingRow(transaction, locked.id);
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error("financing.delete failed", { code: pgErrorCode(error) ?? "unknown" });
    throw new HttpError(500, "DATABASE_ERROR", "No se pudo eliminar el financiamiento. Inténtalo de nuevo.");
  }
}


export async function getInstallmentList(rawQuery: Record<string, unknown>, options: { now?: Date; fetchImpl?: typeof fetch } = {}) {
  const now = options.now ?? new Date();
  const today = todayInCaracas(now);
  const query = installmentsQuerySchema.parse(rawQuery);
  const resolved = await resolveEuroRate(today, { now, fetchImpl: options.fetchImpl });
  const [summary, page] = await Promise.all([receivableSummary(db(), today), listInstallmentRows(db(), query, today)]);
  const siblings = await listInstallmentsOfFinancings(db(), [...new Set(page.data.map((row) => row.financingId))]);
  const labels = new Map<string, string>();
  for (const financingId of new Set(siblings.map((row) => row.financingId))) {
    for (const item of installmentLabels(siblings.filter((row) => row.financingId === financingId))) labels.set(item.id, item.label);
  }
  return {
    summary: { ...summary, today },
    rate: resolved.rate,
    rateStale: resolved.stale,
    data: page.data.map((row) => toInstallmentListItem({ ...row, label: labels.get(row.id) ?? "" }, today, resolved.rate)),
    page: query.page,
    pageSize: query.pageSize,
    total: page.total,
    totalPages: Math.max(1, Math.ceil(page.total / query.pageSize)),
    query,
  };
}
