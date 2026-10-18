import {
  cellToText,
  isBlank,
  parseDecimalCell,
  parseIntegerCell,
  parseRefCell,
  type CellValue,
} from "../bulk/cells";
import { productInputSchema, variantInputSchema } from "../validation/catalog";
import { createIssue, type IssueCode, type RawIssue } from "./issues";
import { AMBIGUOUS_SIZES_MARKER, normalizeHeader, type FixedColumnKey, type WorkbookColumn } from "./workbook-format";

export type { CellValue };
export type Gender = "Dama" | "Caballero" | "Unisex";

export const MAX_TEXT_LENGTH = 160;
export const MAX_PRICE = 99_999_999.99;
export const MAX_QUANTITY = 2_147_483_647;

export interface ParsedValues {
  type?: string;
  manufacturer?: string;
  brand?: string;
  gender?: Gender;
  price?: string;
  sku?: string | null;
  color?: string;
  isPublished?: boolean;
  isActive?: boolean;
}

export interface ParsedSize {
  label: string;
  quantity: number | null;
}

export interface ParsedProductRow {
  excelRow: number;
  /** `null` indica un producto nuevo. */
  legacyId: number | null;
  values: ParsedValues;
  sizes: Record<string, ParsedSize>;
  issues: RawIssue[];
}

type Parsed<T> = { ok: true; value: T } | { ok: false; code: IssueCode; n?: number };

function stripAccents(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function parseId(cell: CellValue): Parsed<number | null> {
  return parseRefCell(cell);
}

const TEXT_SCHEMAS = {
  type: productInputSchema.shape.legacyTypeLabel,
  manufacturer: productInputSchema.shape.manufacturer,
  brand: productInputSchema.shape.brand,
  color: productInputSchema.shape.color,
} as const;

function parseRequiredText(cell: CellValue, key: keyof typeof TEXT_SCHEMAS): Parsed<string> {
  if (isBlank(cell)) return { ok: false, code: "REQUIRED" };
  const text = cellToText(cell);
  if (!text.ok) return text;
  if (text.value.length > MAX_TEXT_LENGTH) return { ok: false, code: "TOO_LONG", n: MAX_TEXT_LENGTH };
  const result = TEXT_SCHEMAS[key].safeParse(text.value);
  if (!result.success) return { ok: false, code: "REQUIRED" };
  return { ok: true, value: result.data };
}

function parseSku(cell: CellValue): Parsed<string | null> {
  if (isBlank(cell)) return { ok: true, value: null };
  const text = cellToText(cell);
  if (!text.ok) return text;
  if (text.value.length > MAX_TEXT_LENGTH) return { ok: false, code: "TOO_LONG", n: MAX_TEXT_LENGTH };
  const result = productInputSchema.shape.sku.safeParse(text.value);
  if (!result.success) return { ok: false, code: "TOO_LONG", n: MAX_TEXT_LENGTH };
  return { ok: true, value: result.data || null };
}

const GENDERS: Record<string, Gender> = { dama: "Dama", caballero: "Caballero", unisex: "Unisex" };

function parseGender(cell: CellValue): Parsed<Gender> {
  if (isBlank(cell)) return { ok: false, code: "REQUIRED" };
  if (cell instanceof Date) return { ok: false, code: "INVALID_TYPE" };
  const gender = GENDERS[stripAccents(String(cell).trim()).toLowerCase()];
  return gender ? { ok: true, value: gender } : { ok: false, code: "INVALID_GENDER" };
}

function parsePrice(cell: CellValue): Parsed<string> {
  if (isBlank(cell)) return { ok: false, code: "REQUIRED" };
  const result = parseDecimalCell(cell, {
    allowZero: true,
    maxIntegerDigits: 8,
    codes: { invalid: "INVALID_PRICE", decimals: "PRICE_DECIMALS", tooHigh: "PRICE_TOO_HIGH" },
  });
  if (!result.ok) return result;
  return { ok: true, value: result.value as string };
}

function parseYesNo(cell: CellValue, defaultValue: boolean | null): Parsed<boolean> {
  if (isBlank(cell)) {
    return defaultValue === null ? { ok: false, code: "REQUIRED" } : { ok: true, value: defaultValue };
  }
  if (typeof cell === "boolean") return { ok: true, value: cell };
  if (cell instanceof Date || typeof cell === "number") return { ok: false, code: "INVALID_YES_NO" };
  const text = stripAccents(String(cell).trim()).toLowerCase();
  if (text === "si") return { ok: true, value: true };
  if (text === "no") return { ok: true, value: false };
  return { ok: false, code: "INVALID_YES_NO" };
}

function parseQuantity(cell: CellValue): Parsed<number | null> {
  const parsed = parseIntegerCell(cell, { min: 0, max: MAX_QUANTITY, code: "INVALID_QUANTITY" });
  if (!parsed.ok || parsed.value === null) return parsed;
  const result = variantInputSchema.shape.quantity.safeParse(parsed.value);
  if (!result.success) return { ok: false, code: "INVALID_QUANTITY" };
  return { ok: true, value: result.data };
}

const MARKER_KEY = normalizeHeader(AMBIGUOUS_SIZES_MARKER);

/**
 * Interpreta una fila de datos con las mismas reglas del formulario individual.
 * `excelRow` es el número de fila visible en Excel.
 */
export function parseInventoryRow(cells: CellValue[], columns: WorkbookColumn[], excelRow: number): ParsedProductRow {
  const issues: RawIssue[] = [];
  const values: ParsedValues = {};
  const sizes: Record<string, ParsedSize> = {};
  const cellFor = (key: FixedColumnKey): { cell: CellValue; header: string } => {
    const column = columns.find((candidate) => candidate.key === key);
    return { cell: column ? cells[column.index] : undefined, header: column?.header ?? key };
  };

  const report = (header: string, result: { code: IssueCode; n?: number }) => {
    issues.push(createIssue(result.code, { column: header, row: excelRow, n: result.n }));
  };

  const idCell = cellFor("id");
  const id = parseId(idCell.cell);
  let legacyId: number | null = null;
  if (id.ok) legacyId = id.value;
  else report(idCell.header, id);
  // Con un ID inválido la fila no se trata como alta, para no multiplicar errores.
  const isNew = id.ok && id.value === null;

  for (const key of ["type", "manufacturer", "brand", "color"] as const) {
    const { cell, header } = cellFor(key);
    const parsed = parseRequiredText(cell, key);
    if (parsed.ok) values[key] = parsed.value;
    else report(header, parsed);
  }

  const gender = cellFor("gender");
  const parsedGender = parseGender(gender.cell);
  if (parsedGender.ok) values.gender = parsedGender.value;
  else report(gender.header, parsedGender);

  const price = cellFor("price");
  const parsedPrice = parsePrice(price.cell);
  if (parsedPrice.ok) values.price = parsedPrice.value;
  else report(price.header, parsedPrice);

  const sku = cellFor("sku");
  const parsedSku = parseSku(sku.cell);
  if (parsedSku.ok) values.sku = parsedSku.value;
  else report(sku.header, parsedSku);

  const published = cellFor("isPublished");
  const parsedPublished = parseYesNo(published.cell, isNew ? false : null);
  if (parsedPublished.ok) values.isPublished = parsedPublished.value;
  else report(published.header, parsedPublished);

  const active = cellFor("isActive");
  const parsedActive = parseYesNo(active.cell, isNew ? true : null);
  if (parsedActive.ok) values.isActive = parsedActive.value;
  else report(active.header, parsedActive);

  for (const column of columns) {
    if (column.key !== "size" || !column.sizeKey || !column.sizeLabel) continue;
    const cell = cells[column.index];
    if (typeof cell === "string" && normalizeHeader(cell) === MARKER_KEY) {
      issues.push(createIssue("AMBIGUOUS_SIZES", { column: column.header, row: excelRow, list: [column.sizeLabel] }));
      continue;
    }
    const parsed = parseQuantity(cell);
    if (parsed.ok) sizes[column.sizeKey] = { label: column.sizeLabel, quantity: parsed.value };
    else report(column.header, parsed);
  }

  return { excelRow, legacyId, values, sizes, issues };
}
