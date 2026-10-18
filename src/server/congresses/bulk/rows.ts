import {
  isBlank,
  parseDateCell,
  parseOptionalText,
  parseRefCell,
  parseRequiredText,
  type CellValue,
  type Parsed,
} from "../../bulk/cells";
import type { SheetColumn } from "../../bulk/sheet";
import { CONGRESS_LIMITS } from "../../validation/congresses";
import {
  createCongressIssue,
  type CongressColumnKey,
  type CongressIssueCode,
  type CongressRawIssue,
} from "./format";

export interface CongressCell {
  value: string | null;
  /** La celda estaba vacía en el archivo. */
  empty: boolean;
}

export type CongressValueKey = Exclude<CongressColumnKey, "id">;

export interface ParsedCongressRow {
  excelRow: number;
  ref: number | null;
  present: Set<CongressColumnKey>;
  values: Partial<Record<CongressValueKey, CongressCell>>;
  issues: CongressRawIssue[];
}

export function parseCongressRow(
  cells: CellValue[],
  columns: SheetColumn<CongressColumnKey>[],
  excelRow: number,
): ParsedCongressRow {
  const issues: CongressRawIssue[] = [];
  const values: ParsedCongressRow["values"] = {};
  const present = new Set<CongressColumnKey>(columns.map((column) => column.key));
  const entry = (key: CongressColumnKey) => {
    const column = columns.find((candidate) => candidate.key === key);
    return column ? { cell: cells[column.index], header: column.header } : null;
  };
  const store = (key: CongressValueKey, found: { cell: CellValue; header: string }, result: Parsed<string | null>) => {
    if (result.ok) values[key] = { value: result.value, empty: isBlank(found.cell) };
    else issues.push(createCongressIssue(result.code as CongressIssueCode, { column: found.header, row: excelRow, n: result.n }));
  };

  for (const key of ["from", "to"] as const) {
    const found = entry(key);
    if (!found) continue;
    if (isBlank(found.cell)) issues.push(createCongressIssue("REQUIRED", { column: found.header, row: excelRow }));
    else store(key, found, parseDateCell(found.cell));
  }
  const name = entry("name");
  if (name) store("name", name, parseRequiredText(name.cell, CONGRESS_LIMITS.name));
  for (const [key, max] of [["specialty", CONGRESS_LIMITS.specialty], ["venue", CONGRESS_LIMITS.venue], ["notes", CONGRESS_LIMITS.notes]] as const) {
    const found = entry(key);
    if (found) store(key, found, parseOptionalText(found.cell, max));
  }

  let ref: number | null = null;
  const id = entry("id");
  if (id) {
    const parsed = parseRefCell(id.cell);
    if (parsed.ok) ref = parsed.value;
    else issues.push(createCongressIssue("INVALID_ID", { column: id.header, row: excelRow }));
  }

  const start = values.from?.value;
  const end = values.to?.value;
  if (start && end && end < start) {
    issues.push(createCongressIssue("END_BEFORE_START", { column: entry("to")?.header ?? "Hasta", row: excelRow }));
  }
  return { excelRow, ref, present, values, issues };
}
