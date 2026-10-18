import writeXlsxFile from "write-excel-file/node";
import dataValidation from "@onparallel/write-excel-file-data-validation";
import {
  FORMAT_VERSION,
  KIND_TEMPLATE_LABEL,
  META_FILE_KIND,
  META_FORMAT_VERSION,
  META_GENERATED_AT,
} from "../inventory/workbook-format";
import { KIND_CURRENT_DATA_LABEL, META_SECTION } from "./sheet";

export type Cell = Record<string, unknown> | null;

export const HEADER_STYLE = { fontWeight: "bold", backgroundColor: "#e2e8f0" } as const;
export const ID_STYLE = { backgroundColor: "#e5e7eb", textColor: "#475569" } as const;

export const text = (value: string | null, extra: Record<string, unknown> = {}): Cell =>
  value === null || value === "" ? null : { value, type: String, ...extra };
/** Texto con formato `@`, para que Excel no lo convierta en número ni en fórmula. */
export const textColumn = (value: string | null): Cell => text(value, { format: "@" });
export const heading = (value: string): Cell => ({ value, type: String, fontWeight: "bold" });
export const headerCell = (value: string): Cell => ({ value, type: String, ...HEADER_STYLE });

/** Filas de “Datos del archivo” de Instrucciones. `section` solo se escribe en las secciones nuevas. */
export function metadataRows(input: {
  section?: string;
  kind: "plantilla" | "datos";
  /** Etiqueta del tipo de datos actuales cuando es distinta de “Datos actuales” (inventario). */
  dataKindLabel?: string;
  generatedAt: Date;
}): Cell[][] {
  const rows: Cell[][] = [[], [heading("Datos del archivo")]];
  if (input.section) rows.push([text(META_SECTION), text(input.section)]);
  rows.push(
    [
      text(META_FILE_KIND),
      text(input.kind === "plantilla" ? KIND_TEMPLATE_LABEL : (input.dataKindLabel ?? KIND_CURRENT_DATA_LABEL)),
    ],
    [text(META_GENERATED_AT), text(input.generatedAt.toISOString())],
    [text(META_FORMAT_VERSION), text(String(FORMAT_VERSION))],
  );
  return rows;
}

/* Validaciones de datos ------------------------------------------------- */

export interface RowSpan {
  firstRow: number;
  lastRow: number;
}

type Rule = Record<string, unknown>;

const range = (column: number, rows: RowSpan) => ({
  from: { row: rows.firstRow, column },
  to: { row: rows.lastRow, column },
});

export const inputMessage = (column: number, rows: RowSpan, title: string, input: string): Rule => ({
  cellRange: range(column, rows),
  validation: { type: "any", inputTitle: title, input },
});

export const listValidation = (column: number, rows: RowSpan, values: string[], error: string): Rule => ({
  cellRange: range(column, rows),
  validation: { type: "list", values, errorStyle: "stop", error },
});

/** Lista desplegable hacia “Listas” que admite valores nuevos (estilo `information`). */
export const suggestionValidation = (
  column: number,
  rows: RowSpan,
  options: { sheet: string; listColumn: string; length: number; name: string },
): Rule => ({
  cellRange: range(column, rows),
  validation: {
    type: "list",
    valuesRange: `${options.sheet}!$${options.listColumn}$2:$${options.listColumn}$${Math.max(2, options.length + 1)}`,
    errorStyle: "information",
    error: `“${options.name}” no está en la lista; se creará un valor nuevo.`,
    showErrorMessage: true,
  },
});

export const decimalValidation = (column: number, rows: RowSpan, error: string): Rule => ({
  cellRange: range(column, rows),
  validation: { type: "decimal", operator: ">=", value: 0, errorStyle: "stop", error },
});

export const integerValidation = (
  column: number,
  rows: RowSpan,
  options: { min: number; max?: number; error: string },
): Rule => ({
  cellRange: range(column, rows),
  validation:
    options.max === undefined
      ? { type: "integer", operator: ">=", value: options.min, errorStyle: "stop", error: options.error }
      : { type: "integer", operator: "...", value: options.min, value2: options.max, errorStyle: "stop", error: options.error },
});

/** Fecha desde el 01/01/2000, con ayuda “dd/mm/aaaa” y aviso (no bloquea). */
export const dateValidation = (column: number, rows: RowSpan): Rule => ({
  cellRange: range(column, rows),
  validation: {
    type: "date",
    operator: ">=",
    value: new Date(Date.UTC(2000, 0, 1)),
    errorStyle: "warning",
    error: "Escribe una fecha válida como dd/mm/aaaa.",
    inputTitle: "Fecha",
    input: "dd/mm/aaaa",
  },
});

export const textLengthValidation = (column: number, rows: RowSpan, max: number, name: string): Rule => ({
  cellRange: range(column, rows),
  validation: {
    type: "textLength",
    operator: "<=",
    value: max,
    errorStyle: "warning",
    error: `${name} admite como máximo ${max} caracteres.`,
  },
});

export interface SheetSpec {
  data: Cell[][];
  sheet: string;
  columns?: Array<{ width: number }>;
  stickyRowsCount?: number;
  dataValidation?: Rule[];
}

/** Escribe el libro en memoria con las validaciones de datos habilitadas. */
export async function writeWorkbook(sheets: SheetSpec[]): Promise<Buffer> {
  // Los tipos de `write-excel-file` no conocen la opción `dataValidation` del complemento.
  const write = writeXlsxFile as unknown as (sheets: unknown, options: unknown) => { toBuffer(): Promise<Buffer> };
  return write(sheets, { features: [dataValidation] }).toBuffer();
}
