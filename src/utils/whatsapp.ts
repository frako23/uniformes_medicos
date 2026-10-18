import { formatDate } from "./dates";
import { formatBolivares, formatMoney, usdToVes } from "./money";

/** Enlace de WhatsApp para un celular en E.164; el `+` no forma parte de la URL. */
export function whatsappUrl(e164: string, text?: string): string {
  const base = `https://wa.me/${e164.replace(/\D/g, "")}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}


export interface InstallmentReminderInput {
  phoneE164: string;
  clientName: string;
  description: string;
  /** “Inicial” o “2 de 4”. */
  label: string;
  dueDate: string;
  state: "vencida" | "vence_hoy" | "por_vencer" | "pagada";
  amountUsd: string;
  rate: { value: string; rateDate: string } | null;
}

/** Mensaje de recordatorio de una cuota y su enlace de WhatsApp; el sistema no envía nada por sí mismo. */
export function buildInstallmentReminder(input: InstallmentReminderInput): { text: string; url: string } {
  const when = input.state === "vencida" ? "vencida el" : "con vencimiento el";
  const bolivares = input.rate
    ? ` (${formatBolivares(usdToVes(input.amountUsd, input.rate.value))} a tasa euro BCV de ${formatBolivares(input.rate.value)} del ${formatDate(input.rate.rateDate)})`
    : "";
  const text =
    `Hola ${input.clientName}, te escribo de Uniformes Médicos 2015 para recordarte la cuota ${input.label} ` +
    `de “${input.description}”, ${when} ${formatDate(input.dueDate)}: ${formatMoney(input.amountUsd)}${bolivares}. ¡Gracias!`;
  return { text, url: whatsappUrl(input.phoneE164, text) };
}
