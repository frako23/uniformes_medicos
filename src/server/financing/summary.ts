import { daysBetween } from "../../utils/dates";
import { formatPhone } from "../../utils/phone";
import { fromCents, toCents, usdToVes } from "../../utils/money";
import { buildInstallmentReminder, whatsappUrl } from "../../utils/whatsapp";

export type FinancingStatus = "al_dia" | "con_vencidas" | "pagado" | "anulado";
export type InstallmentStateName = "vencida" | "vence_hoy" | "por_vencer" | "pagada";

interface InstallmentLike {
  status: "pendiente" | "pagada";
  dueDate: string;
}

export { fromCents, toCents };

export function deriveFinancingStatus(
  financing: { annulled: boolean; installments: InstallmentLike[] },
  today: string,
): FinancingStatus {
  if (financing.annulled) return "anulado";
  const pending = financing.installments.filter((item) => item.status === "pendiente");
  if (pending.length === 0) return "pagado";
  return pending.some((item) => item.dueDate < today) ? "con_vencidas" : "al_dia";
}

export function installmentState(
  installment: InstallmentLike,
  today: string,
): { state: InstallmentStateName; daysOverdue: number } {
  if (installment.status === "pagada") return { state: "pagada", daysOverdue: 0 };
  if (installment.dueDate < today) return { state: "vencida", daysOverdue: daysBetween(installment.dueDate, today) };
  if (installment.dueDate === today) return { state: "vence_hoy", daysOverdue: 0 };
  return { state: "por_vencer", daysOverdue: 0 };
}

export interface LabelableInstallment {
  id: string;
  isInitial: boolean;
  dueDate: string;
  createdAt: string | Date;
}

const time = (value: string | Date) => (value instanceof Date ? value.getTime() : Date.parse(value));

/** Orden `is_initial DESC, due_date, created_at, id`; la inicial es “Inicial” y las demás “n de m”. */
export function installmentLabels<T extends LabelableInstallment>(items: T[]): Array<T & { label: string }> {
  const sorted = [...items].sort((left, right) => {
    if (left.isInitial !== right.isInitial) return left.isInitial ? -1 : 1;
    if (left.dueDate !== right.dueDate) return left.dueDate < right.dueDate ? -1 : 1;
    const byCreated = time(left.createdAt) - time(right.createdAt);
    if (byCreated !== 0) return byCreated;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
  const regular = sorted.filter((item) => !item.isInitial).length;
  let position = 0;
  return sorted.map((item) => {
    if (item.isInitial) return { ...item, label: "Inicial" };
    position += 1;
    return { ...item, label: `${position} de ${regular}` };
  });
}

export function totals(items: Array<{ status: "pendiente" | "pagada"; amountUsd: string }>) {
  let total = 0;
  let paid = 0;
  for (const item of items) {
    const cents = toCents(item.amountUsd);
    total += cents;
    if (item.status === "pagada") paid += cents;
  }
  return { total: fromCents(total), paid: fromCents(paid), balance: fromCents(total - paid) };
}

export interface PaymentInfo {
  paidOn: string | null;
  currency: "USD" | "VES" | null;
  rate: { value: string; rateDate: string | null; source: "oficial" | "manual" } | null;
  amountVes: string | null;
  reference: string | null;
  origin: "panel" | "carga_masiva";
}

interface PaidInstallmentRow {
  status: "pendiente" | "pagada";
  paidOn: string | null;
  paymentCurrency: "USD" | "VES" | null;
  euroRate: string | null;
  euroRateDate: string | null;
  euroRateSource: "oficial" | "manual" | null;
  amountVes: string | null;
  paymentReference: string | null;
  paymentOrigin: "panel" | "carga_masiva" | null;
}

/** Datos del pago de una cuota; `null` si sigue pendiente. */
export function toPaymentInfo(row: PaidInstallmentRow): PaymentInfo | null {
  if (row.status !== "pagada") return null;
  return {
    paidOn: row.paidOn,
    currency: row.paymentCurrency,
    rate: row.euroRate && row.euroRateSource ? { value: row.euroRate, rateDate: row.euroRateDate, source: row.euroRateSource } : null,
    amountVes: row.amountVes,
    reference: row.paymentReference,
    origin: row.paymentOrigin ?? "panel",
  };
}

/* Lista de cuotas pendientes y pagadas ------------------------------------ */

export interface EuroRateInfo {
  value: string;
  rateDate: string;
  source: "oficial";
}

export interface InstallmentListItemInput {
  id: string;
  financingRef: number;
  clientRef: number;
  clientName: string;
  phoneE164: string;
  description: string;
  dueDate: string;
  amountUsd: string;
  status: "pendiente" | "pagada";
  financingAnnulled: boolean;
  label: string;
  paidOn: string | null;
  paymentCurrency: "USD" | "VES" | null;
  euroRate: string | null;
  euroRateDate: string | null;
  euroRateSource: "oficial" | "manual" | null;
  amountVes: string | null;
  paymentReference: string | null;
  paymentOrigin: "panel" | "carga_masiva" | null;
}

export function toInstallmentListItem(row: InstallmentListItemInput, today: string, rate: EuroRateInfo | null) {
  return {
    id: row.id,
    financingRef: row.financingRef,
    client: {
      ref: row.clientRef,
      name: row.clientName,
      phone: formatPhone(row.phoneE164),
      whatsappUrl: whatsappUrl(row.phoneE164),
    },
    description: row.description,
    label: row.label,
    dueDate: row.dueDate,
    amountUsd: row.amountUsd,
    amountVesEquivalent: rate ? usdToVes(row.amountUsd, rate.value) : null,
    ...installmentState(row, today),
    payment: toPaymentInfo(row),
    financingAnnulled: row.financingAnnulled,
    reminderUrl:
      row.status === "pendiente"
        ? buildInstallmentReminder({
            phoneE164: row.phoneE164,
            clientName: row.clientName,
            description: row.description,
            label: row.label,
            dueDate: row.dueDate,
            state: installmentState(row, today).state,
            amountUsd: row.amountUsd,
            rate,
          }).url
        : null,
  };
}
