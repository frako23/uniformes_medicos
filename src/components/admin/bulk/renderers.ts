import { formatDate } from "../../../utils/dates";
import { generateSchedule, type Frequency } from "../../../utils/financing-schedule";
import { formatMoney, toCents } from "../../../utils/money";

export type BulkSectionName = "clientes" | "financiamientos" | "congresos";

export interface ScheduleSummaryData {
  purchaseDate: string;
  frequency: Frequency;
  totalUsd: string;
  initial: { amountUsd: string; dueDate: string; paid: boolean } | null;
  installments: {
    count: number;
    regularAmountUsd: string;
    lastAmountUsd: string;
    firstDue: string;
    lastDue: string;
    paidCount: number;
  };
}

export interface FieldChangeData {
  field: string;
  label: string;
  from: string | null;
  to: string | null;
}

export interface BulkChangeData {
  row: number;
  action: "create" | "update";
  ref: number | null;
  matchedBy: "identificador" | "celular" | null;
  label: string;
  fields: FieldChangeData[];
  schedule?: ScheduleSummaryData;
  warnings: string[];
}

export const WARNING_LABELS: Record<string, string> = {
  NEW_VALUE: "Valor nuevo",
  SAME_NAME: "Mismo nombre que otro cliente",
  MODIFIED_AFTER_DOWNLOAD: "Cambió después de la descarga",
  POSSIBLE_DUPLICATE: "Posible duplicado",
  CLIENT_NAME_MISMATCH: "El nombre no coincide con el cliente",
  LONG_EVENT: "Evento muy largo",
  ALREADY_ENDED: "Ya terminó",
};

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text?: string,
  attrs: Record<string, string> = {},
) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

/** “Fila 4” o “Filas 4, 9–12 y 15”, a partir de los rangos del servidor. */
export function formatRows(rows: string[]) {
  if (!rows.length) return "";
  const parts = rows.map((range) => range.replace("-", "–"));
  const label = rows.length === 1 && !rows[0].includes("-") ? "Fila" : "Filas";
  if (parts.length === 1) return `${label} ${parts[0]}`;
  return `${label} ${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

function fieldLine(change: BulkChangeData, field: FieldChangeData) {
  if (change.action === "create") return `${field.label}: ${field.to ?? "sin dato"}`;
  const from = field.from ?? "sin dato";
  return field.to === null ? `${field.label}: ${from} → se borrará` : `${field.label}: ${from} → ${field.to}`;
}

/** Renderizador genérico de un cambio: fila, identificación, campos y advertencias. */
export function renderGenericChange(change: BulkChangeData) {
  const card = el("li", "space-y-2 rounded-lg border border-slate-200 p-3 text-sm");
  const identity = change.action === "create" ? "Nuevo" : `#${change.ref}`;
  const parts = [`Fila ${change.row}`, identity, change.label];
  const head = el("p", "break-words font-semibold", parts.join(" · "));
  if (change.matchedBy === "celular") {
    head.append(" ", el("span", "rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-semibold", "reconocido por celular"));
  }
  card.append(head);
  if (change.fields.length) {
    const lines = el("ul", "space-y-1");
    for (const field of change.fields) lines.append(el("li", "break-words", fieldLine(change, field)));
    card.append(lines);
  }
  const badges = change.warnings.filter((code) => WARNING_LABELS[code]);
  if (badges.length) {
    const row = el("div", "flex flex-wrap gap-2");
    for (const code of badges) {
      row.append(el("span", "rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900", `⚠ ${WARNING_LABELS[code]}`));
    }
    card.append(row);
  }
  return card;
}

/** Clientes: el genérico más la etiqueta “reconocido por celular” cuando la fila se identificó por su celular. */
export function renderClientChange(change: BulkChangeData) {
  return renderGenericChange(change);
}

const FREQUENCY_PLURAL = { semanal: "semanales", quincenal: "quincenales", mensual: "mensuales" } as const;

/** “Inicial $20,00 (pagada) + 4 cuotas quincenales de $25,00, del 15/09/2026 al 31/10/2026; 2 ya pagadas”. */
export function describeSchedule(schedule: ScheduleSummaryData) {
  const regular = schedule.installments;
  const amount =
    regular.regularAmountUsd === regular.lastAmountUsd
      ? `de ${formatMoney(regular.regularAmountUsd)}`
      : `de ${formatMoney(regular.regularAmountUsd)} (la última de ${formatMoney(regular.lastAmountUsd)})`;
  const initial = schedule.initial
    ? `Inicial ${formatMoney(schedule.initial.amountUsd)}${schedule.initial.paid ? " (pagada)" : ""} + `
    : "";
  const range = `${regular.count} ${regular.count === 1 ? "cuota" : "cuotas"} ${FREQUENCY_PLURAL[schedule.frequency]} ${amount}, del ${formatDate(regular.firstDue)} al ${formatDate(regular.lastDue)}`;
  const paid = regular.paidCount ? `; ${regular.paidCount} ya ${regular.paidCount === 1 ? "pagada" : "pagadas"}` : "";
  return `${initial}${range}${paid}`;
}

/** Tarjeta de un financiamiento: cliente, descripción, resumen del calendario y “Ver fechas”. */
export function renderFinancingChange(change: BulkChangeData) {
  const card = renderGenericChange(change);
  const schedule = change.schedule;
  if (!schedule) return card;
  card.append(el("p", "font-medium", describeSchedule(schedule)));
  const toggle = el(
    "button",
    "min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50",
    "Ver fechas",
    { type: "button", "aria-expanded": "false" },
  );
  const list = el("ul", "hidden space-y-1 text-sm");
  toggle.addEventListener("click", () => {
    const opening = list.classList.contains("hidden");
    if (opening && !list.childElementCount) {
      const initialCents = schedule.initial ? toCents(schedule.initial.amountUsd) : 0;
      const items = generateSchedule({
        purchaseDate: schedule.purchaseDate,
        totalCents: toCents(schedule.totalUsd),
        initialCents,
        count: schedule.installments.count,
        frequency: schedule.frequency,
        firstDueDate: schedule.installments.firstDue,
      });
      const paidTotal = (schedule.initial?.paid ? 1 : 0) + schedule.installments.paidCount;
      items.forEach((item, index) => {
        const number = index + (initialCents > 0 ? 0 : 1);
        const name = item.isInitial ? "Inicial" : `Cuota ${number}`;
        const status = index < paidTotal ? "pagada" : "pendiente";
        list.append(el("li", "", `${name}: ${formatDate(item.dueDate)} · ${formatMoney(item.amountCents / 100)} · ${status}`));
      });
    }
    list.classList.toggle("hidden", !opening);
    toggle.setAttribute("aria-expanded", String(opening));
    toggle.textContent = opening ? "Ocultar fechas" : "Ver fechas";
  });
  card.append(toggle, list);
  return card;
}

/** Congresos: el genérico; la etiqueta ya trae `Nombre · 30/10/2026 – 01/11/2026`. */
export function renderCongressChange(change: BulkChangeData) {
  return renderGenericChange(change);
}

/** Despacha al renderizador de cada sección. */
export function renderChange(section: BulkSectionName, change: BulkChangeData) {
  if (section === "clientes") return renderClientChange(change);
  if (section === "financiamientos") return renderFinancingChange(change);
  if (section === "congresos") return renderCongressChange(change);
  return renderGenericChange(change);
}
