const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

const caracasFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Caracas",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Fecha de hoy (`AAAA-MM-DD`) en Caracas. */
export function todayInCaracas(now: Date = new Date()): string {
  const parts = Object.fromEntries(caracasFormat.formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toUtc(iso: string): number {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new Error(`Fecha inválida: ${iso}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function fromUtc(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * DAY_MS);
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Días completos de `from` a `to` (negativo si `to` es anterior). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

export function compareIsoDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function monthRange(month: string): { start: string; end: string } {
  const [year, number] = month.split("-").map(Number);
  const pad = (value: number) => String(value).padStart(2, "0");
  return { start: `${month}-01`, end: `${month}-${pad(lastDayOfMonth(year, number))}` };
}

function parts(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

export function formatDate(iso: string): string {
  const { year, month, day } = parts(iso);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

export function formatMonthYear(month: string): string {
  const { year, month: number } = parts(`${month}-01`);
  return `${MONTHS[number - 1]} de ${year}`;
}

export function formatLongDate(iso: string): string {
  const { year, month, day } = parts(iso);
  return `${day} de ${MONTHS[month - 1]} de ${year}`;
}

export function formatLongDateRange(start: string, end: string): string {
  if (start === end) return formatLongDate(start);
  const a = parts(start);
  const b = parts(end);
  if (a.year === b.year && a.month === b.month) return `del ${a.day} al ${b.day} de ${MONTHS[b.month - 1]} de ${b.year}`;
  if (a.year === b.year) return `del ${a.day} de ${MONTHS[a.month - 1]} al ${b.day} de ${MONTHS[b.month - 1]} de ${b.year}`;
  return `del ${formatLongDate(start)} al ${formatLongDate(end)}`;
}
