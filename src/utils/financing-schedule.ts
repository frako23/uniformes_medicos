import { addDays, isValidIsoDate, lastDayOfMonth } from "./dates";

export type Frequency = "semanal" | "quincenal" | "mensual";

export const MAX_INSTALLMENTS = 48;

export interface ScheduleItem {
  isInitial: boolean;
  dueDate: string;
  amountCents: number;
}

const pad = (value: number) => String(value).padStart(2, "0");

function split(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

function iso(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Mes siguiente (con cambio de año) a `year`-`month`. */
function followingMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** El siguiente día 15 o último día de mes, estrictamente después de `date`. */
function nextFortnight(date: string) {
  const { year, month, day } = split(date);
  const last = lastDayOfMonth(year, month);
  if (day < 15) return iso(year, month, 15);
  if (day < last) return iso(year, month, last);
  const next = followingMonth(year, month);
  return iso(next.year, next.month, 15);
}

function monthlyOn(year: number, month: number, anchorDay: number) {
  return iso(year, month, Math.min(anchorDay, lastDayOfMonth(year, month)));
}

/** Fecha de la primera cuota que propone el formulario. */
export function defaultFirstDueDate(purchaseDate: string, frequency: Frequency): string {
  if (frequency === "semanal") return addDays(purchaseDate, 7);
  if (frequency === "quincenal") return nextFortnight(purchaseDate);
  const { year, month, day } = split(purchaseDate);
  const next = followingMonth(year, month);
  return monthlyOn(next.year, next.month, day);
}

/** Fecha de la cuota que sigue a `previous`. `anchorDay` solo importa en la frecuencia mensual. */
export function nextDueDate(previous: string, frequency: Frequency, anchorDay: number): string {
  if (frequency === "semanal") return addDays(previous, 7);
  if (frequency === "quincenal") return nextFortnight(previous);
  const { year, month } = split(previous);
  const next = followingMonth(year, month);
  return monthlyOn(next.year, next.month, anchorDay);
}

export interface GenerateScheduleInput {
  purchaseDate: string;
  totalCents: number;
  initialCents: number;
  count: number;
  frequency: Frequency;
  firstDueDate: string;
}

/**
 * Calendario de cuotas: la inicial (si la hay) vence en la compra y el resto se reparte en `count`
 * cuotas iguales; la última absorbe la diferencia de centavos.
 */
export function generateSchedule(input: GenerateScheduleInput): ScheduleItem[] {
  const { purchaseDate, totalCents, initialCents, count, frequency, firstDueDate } = input;
  const schedule: ScheduleItem[] = [];
  if (initialCents > 0) schedule.push({ isInitial: true, dueDate: purchaseDate, amountCents: initialCents });

  const rest = totalCents - initialCents;
  const regular = Math.floor(rest / count);
  // Si la primera cuota es la propuesta por defecto, el día ancla mensual es el de la compra.
  const anchorDay =
    firstDueDate === defaultFirstDueDate(purchaseDate, frequency) ? split(purchaseDate).day : split(firstDueDate).day;
  let dueDate = firstDueDate;
  for (let index = 0; index < count; index += 1) {
    const isLast = index === count - 1;
    schedule.push({ isInitial: false, dueDate, amountCents: isLast ? rest - regular * (count - 1) : regular });
    if (!isLast) dueDate = nextDueDate(dueDate, frequency, anchorDay);
  }
  return schedule;
}

export interface ScheduleError {
  /** Posición de la cuota; -1 para errores de la compra. */
  index: number;
  field: "dueDate" | "amount" | "purchaseDate";
  message: string;
}

export function validateSchedule(input: {
  purchaseDate: string;
  today: string;
  installments: Array<{ dueDate: string; amountCents: number; isInitial?: boolean }>;
}): ScheduleError[] {
  const errors: ScheduleError[] = [];
  if (!isValidIsoDate(input.purchaseDate)) {
    errors.push({ index: -1, field: "purchaseDate", message: "Escribe una fecha de compra válida." });
  } else if (input.purchaseDate > input.today) {
    errors.push({ index: -1, field: "purchaseDate", message: "La fecha de compra no puede ser posterior a hoy." });
  }
  input.installments.forEach((item, index) => {
    if (!isValidIsoDate(item.dueDate)) {
      errors.push({ index, field: "dueDate", message: "Escribe una fecha de vencimiento válida." });
    } else if (isValidIsoDate(input.purchaseDate) && item.dueDate < input.purchaseDate) {
      errors.push({ index, field: "dueDate", message: "La cuota no puede vencer antes de la fecha de compra." });
    }
    if (!Number.isInteger(item.amountCents) || item.amountCents <= 0) {
      errors.push({ index, field: "amount", message: "El monto debe ser mayor que 0." });
    }
  });
  return errors;
}
