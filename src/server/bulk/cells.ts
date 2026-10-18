import { addDays, isValidIsoDate } from "../../utils/dates";
import { normalizePhone } from "../../utils/phone";
import { normalizeKey } from "../../utils/text-keys";
import type { CellValue } from "./file-guards";

export type { CellValue };

export type Parsed<T, C extends string = string> = { ok: true; value: T } | { ok: false; code: C; n?: number };

export const MAX_INT = 2_147_483_647;

export function isBlank(cell: CellValue) {
  return cell === null || cell === undefined || (typeof cell === "string" && cell.trim() === "");
}

/** Texto recortado de la celda; los números se convierten y las fechas y los booleanos no valen. */
export function cellToText(cell: CellValue): Parsed<string, "INVALID_TYPE"> {
  if (cell instanceof Date || typeof cell === "boolean") return { ok: false, code: "INVALID_TYPE" };
  return { ok: true, value: String(cell).trim() };
}

export function parseRequiredText(cell: CellValue, maxLength: number): Parsed<string, "REQUIRED" | "INVALID_TYPE" | "TOO_LONG"> {
  if (isBlank(cell)) return { ok: false, code: "REQUIRED" };
  const text = cellToText(cell);
  if (!text.ok) return text;
  if (text.value.length > maxLength) return { ok: false, code: "TOO_LONG", n: maxLength };
  return text;
}

export function parseOptionalText(cell: CellValue, maxLength: number): Parsed<string | null, "INVALID_TYPE" | "TOO_LONG"> {
  if (isBlank(cell)) return { ok: true, value: null };
  const text = cellToText(cell);
  if (!text.ok) return text;
  if (text.value.length > maxLength) return { ok: false, code: "TOO_LONG", n: maxLength };
  return text;
}

/** Entero opcional dentro de [min, max]; cualquier otra cosa devuelve `code`. */
export function parseIntegerCell<C extends string>(
  cell: CellValue,
  options: { min: number; max: number; code: C },
): Parsed<number | null, C> {
  if (isBlank(cell)) return { ok: true, value: null };
  let value: number;
  if (typeof cell === "number") value = cell;
  else if (typeof cell === "string" && /^\d+$/.test(cell.trim())) value = Number(cell.trim());
  else return { ok: false, code: options.code };
  if (!Number.isInteger(value) || value < options.min || value > options.max) return { ok: false, code: options.code };
  return { ok: true, value };
}

/** Identificador (`ref`) opcional: entero positivo. */
export function parseRefCell(cell: CellValue): Parsed<number | null, "INVALID_ID"> {
  return parseIntegerCell(cell, { min: 1, max: MAX_INT, code: "INVALID_ID" });
}

/** Opción cerrada: `options` va de la clave normalizada (sin tildes ni mayúsculas) al valor canónico. */
export function parseOptionCell<T extends string, C extends string>(
  cell: CellValue,
  options: Record<string, T>,
  code: C,
): Parsed<T | null, C> {
  if (isBlank(cell)) return { ok: true, value: null };
  if (cell instanceof Date || typeof cell === "boolean") return { ok: false, code };
  const value = options[normalizeKey(String(cell))];
  return value ? { ok: true, value } : { ok: false, code };
}

export interface DecimalOptions<C extends string> {
  allowZero: boolean;
  /** Dígitos enteros máximos; el máximo es 10^n − 0,01. */
  maxIntegerDigits: number;
  codes: { invalid: C; decimals: C; tooHigh: C };
}

/** Monto con hasta dos decimales. Devuelve el texto (`"25.50"`) y los centavos enteros. */
export function parseDecimalCell<C extends string>(
  cell: CellValue,
  options: DecimalOptions<C>,
): Parsed<string | null, C | "INVALID_TYPE"> & { cents?: number | null } {
  const { codes, maxIntegerDigits } = options;
  if (isBlank(cell)) return { ok: true, value: null, cents: null };
  if (cell instanceof Date) return { ok: false, code: "INVALID_TYPE" };
  if (typeof cell === "boolean") return { ok: false, code: codes.invalid };
  const max = 10 ** maxIntegerDigits - 0.01;

  if (typeof cell === "number") {
    if (!Number.isFinite(cell) || cell < 0 || (cell === 0 && !options.allowZero)) return { ok: false, code: codes.invalid };
    const cents = cell * 100;
    if (Math.abs(cents - Math.round(cents)) > 1e-6 * Math.max(1, Math.abs(cents))) {
      return { ok: false, code: codes.decimals };
    }
    if (cell > max + 0.005) return { ok: false, code: codes.tooHigh };
    return { ok: true, value: cell.toFixed(2), cents: Math.round(cents) };
  }

  const match = /^(\d+)(?:[.,](\d+))?$/.exec(String(cell).trim());
  if (!match) return { ok: false, code: codes.invalid };
  const [, integerPart, fraction = ""] = match;
  if (fraction.length > 2) return { ok: false, code: codes.decimals };
  const integer = integerPart.replace(/^0+(?=\d)/, "");
  if (integer.length > maxIntegerDigits) return { ok: false, code: codes.tooHigh };
  const cents = Number(integer) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents === 0 && !options.allowZero) return { ok: false, code: codes.invalid };
  return { ok: true, value: `${integer}.${fraction.padEnd(2, "0")}`, cents };
}

const EXCEL_EPOCH = "1899-12-30";
const MIN_SERIAL = 36_526; // 01/01/2000
const MAX_SERIAL = 73_050; // 31/12/2099

/** Fecha de día completo (`AAAA-MM-DD`): `Date` (UTC), `d/m/aaaa` con `/`, `-` o `.`, `aaaa-mm-dd` o número de serie de Excel. */
export function parseDateCell(cell: CellValue): Parsed<string | null, "INVALID_DATE"> {
  const invalid = { ok: false, code: "INVALID_DATE" } as const;
  if (isBlank(cell)) return { ok: true, value: null };
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return invalid;
    const iso = cell.toISOString().slice(0, 10);
    return isValidIsoDate(iso) ? { ok: true, value: iso } : invalid;
  }
  if (typeof cell === "boolean") return invalid;
  if (typeof cell === "number") {
    if (!Number.isInteger(cell) || cell < MIN_SERIAL || cell > MAX_SERIAL) return invalid;
    return { ok: true, value: addDays(EXCEL_EPOCH, cell) };
  }
  const text = String(cell).trim();
  const pad = (value: string, size = 2) => value.padStart(size, "0");
  let iso: string | null = null;
  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(text);
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dmy) iso = `${dmy[3]}-${pad(dmy[2])}-${pad(dmy[1])}`;
  else if (ymd) iso = text;
  return iso && isValidIsoDate(iso) ? { ok: true, value: iso } : invalid;
}

/** Celular obligatorio en E.164. */
export function parsePhoneCell(cell: CellValue): Parsed<string, "REQUIRED" | "INVALID_PHONE" | "INVALID_TYPE"> {
  if (isBlank(cell)) return { ok: false, code: "REQUIRED" };
  if (cell instanceof Date || typeof cell === "boolean") return { ok: false, code: "INVALID_TYPE" };
  const result = normalizePhone(typeof cell === "number" ? cell : String(cell));
  return result.ok ? { ok: true, value: result.e164 } : { ok: false, code: "INVALID_PHONE" };
}
