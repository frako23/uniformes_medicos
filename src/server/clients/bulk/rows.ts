import {
  isBlank,
  parseOptionCell,
  parseOptionalText,
  parsePhoneCell,
  parseRefCell,
  parseRequiredText,
  type CellValue,
  type Parsed,
} from "../../bulk/cells";
import type { SheetColumn } from "../../bulk/sheet";
import { CLIENT_LIMITS } from "../../validation/clients";
import {
  SEX_OPTIONS,
  createClientIssue,
  type ClientColumnKey,
  type ClientIssueCode,
  type ClientRawIssue,
} from "./format";

export interface CellState<T> {
  value: T;
  /** La celda estaba vacía en el archivo. */
  empty: boolean;
}

export type ClientValueKey = Exclude<ClientColumnKey, "id">;

export interface ParsedClientRow {
  excelRow: number;
  /** `null` si la fila no trae Identificador. */
  ref: number | null;
  /** Columnas presentes en el archivo; las ausentes nunca cambian. */
  present: Set<ClientColumnKey>;
  values: Partial<Record<ClientValueKey, CellState<string | null>>>;
  issues: ClientRawIssue[];
}

const OPTIONAL_TEXT: Array<{ key: Exclude<ClientValueKey, "name" | "phone" | "sex">; max: number }> = [
  { key: "size", max: CLIENT_LIMITS.size },
  { key: "city", max: CLIENT_LIMITS.city },
  { key: "hospital", max: CLIENT_LIMITS.hospital },
  { key: "clinic", max: CLIENT_LIMITS.clinic },
  { key: "specialty", max: CLIENT_LIMITS.specialty },
  { key: "notes", max: CLIENT_LIMITS.notes },
];

/** Interpreta una fila de datos con las reglas del formulario individual. */
export function parseClientRow(
  cells: CellValue[],
  columns: SheetColumn<ClientColumnKey>[],
  excelRow: number,
): ParsedClientRow {
  const issues: ClientRawIssue[] = [];
  const present = new Set<ClientColumnKey>(columns.map((column) => column.key));
  const values: ParsedClientRow["values"] = {};
  const cellOf = (key: ClientColumnKey) => {
    const column = columns.find((candidate) => candidate.key === key);
    return column ? { cell: cells[column.index], header: column.header } : null;
  };
  const report = (header: string, result: { code: string; n?: number }) => {
    issues.push(createClientIssue(result.code as ClientIssueCode, { column: header, row: excelRow, n: result.n }));
  };
  const store = (key: ClientValueKey, cell: CellValue, result: Parsed<string | null>, header: string) => {
    if (result.ok) values[key] = { value: result.value, empty: isBlank(cell) };
    else report(header, result);
  };

  const name = cellOf("name");
  if (name) store("name", name.cell, parseRequiredText(name.cell, CLIENT_LIMITS.name), name.header);

  const phone = cellOf("phone");
  if (phone) store("phone", phone.cell, parsePhoneCell(phone.cell), phone.header);

  const sex = cellOf("sex");
  if (sex) store("sex", sex.cell, parseOptionCell(sex.cell, SEX_OPTIONS, "INVALID_SEX"), sex.header);

  for (const { key, max } of OPTIONAL_TEXT) {
    const entry = cellOf(key);
    if (entry) store(key, entry.cell, parseOptionalText(entry.cell, max), entry.header);
  }

  let ref: number | null = null;
  const id = cellOf("id");
  if (id) {
    const parsed = parseRefCell(id.cell);
    if (parsed.ok) ref = parsed.value;
    else report(id.header, parsed);
  }

  return { excelRow, ref, present, values, issues };
}
