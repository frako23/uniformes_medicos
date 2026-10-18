import { normalizeKey } from "../../utils/text-keys";
import { readXlsxSheets, type CellValue, type SheetData } from "./file-guards";
import { BulkFileError, createCommonIssue, type CommonIssueCode, type RawIssue } from "./issues";
import {
  KIND_INVENTORY_LABEL,
  KIND_TEMPLATE_LABEL,
  META_FILE_KIND,
  META_FORMAT_VERSION,
  META_GENERATED_AT,
  SHEET_INSTRUCTIONS,
} from "../inventory/workbook-format";

export const META_SECTION = "Sección";
export const KIND_CURRENT_DATA_LABEL = "Datos actuales";

export type SectionWorkbookKind = "plantilla" | "datos" | "desconocido";

export interface SectionColumnDef<K extends string> {
  key: K;
  /** Encabezado principal, el que escriben las plantillas. */
  header: string;
  aliases?: string[];
  required?: boolean;
}

export interface SheetColumn<K extends string> {
  key: K;
  /** Encabezado original, tal como aparece en el archivo. */
  header: string;
  index: number;
}

export interface RawRow {
  /** Número de fila visible en Excel. */
  excelRow: number;
  cells: CellValue[];
}

export interface BulkWorkbook<K extends string> {
  sha256: string;
  section: string;
  declaredSection: string | null;
  kind: SectionWorkbookKind;
  generatedAt: Date | null;
  formatVersion: number | null;
  sheetName: string;
  columns: SheetColumn<K>[];
  ignoredColumns: string[];
}

export interface ReadSectionResult<K extends string> {
  workbook: BulkWorkbook<K>;
  columns: SheetColumn<K>[];
  rows: RawRow[];
  issues: RawIssue<CommonIssueCode>[];
}

export function isRowEmpty(row: CellValue[]) {
  return row.every((cell) => cell === null || cell === undefined || (typeof cell === "string" && cell.trim() === ""));
}

const cellText = (cell: CellValue) => (cell instanceof Date ? cell.toISOString() : String(cell).trim());

/** Pares etiqueta/valor de las columnas A y B de Instrucciones, por etiqueta normalizada. */
export function readMetadataPairs(rows: CellValue[][] | undefined): Map<string, string> {
  const found = new Map<string, string>();
  for (const row of rows ?? []) {
    const [label, value] = row;
    if (typeof label !== "string" || value === null || value === undefined) continue;
    found.set(normalizeKey(label), cellText(value));
  }
  return found;
}

function readSectionMetadata(rows: CellValue[][] | undefined) {
  const found = readMetadataPairs(rows);
  const rawKind = normalizeKey(found.get(normalizeKey(META_FILE_KIND)) ?? "");
  const kind: SectionWorkbookKind =
    rawKind === normalizeKey(KIND_TEMPLATE_LABEL)
      ? "plantilla"
      : rawKind === normalizeKey(KIND_CURRENT_DATA_LABEL) || rawKind === normalizeKey(KIND_INVENTORY_LABEL)
        ? "datos"
        : "desconocido";
  const generated = found.get(normalizeKey(META_GENERATED_AT));
  const parsed = generated ? new Date(generated) : null;
  const generatedAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  const version = Number(found.get(normalizeKey(META_FORMAT_VERSION)));
  return {
    declaredSection: found.get(normalizeKey(META_SECTION)) ?? null,
    kind,
    generatedAt,
    formatVersion: Number.isInteger(version) && version > 0 ? version : null,
  };
}

/**
 * Lee la hoja de datos de una sección: la que se llama como ella o, si no existe, la primera.
 * Lanza `BulkFileError` cuando el archivo no puede leerse como `.xlsx`.
 */
export async function readSectionSheet<K extends string>(input: {
  fileName: string;
  bytes: Uint8Array;
  /** Nombre visible de la sección y de su hoja, por ejemplo “Clientes”. */
  sectionLabel: string;
  columns: SectionColumnDef<K>[];
  /** Columna `Identificador`, para decidir si falta la fecha de generación. */
  idKey?: K;
  maxRows: number;
}): Promise<ReadSectionResult<K>> {
  const { sheets, sha256 } = await readXlsxSheets({
    fileName: input.fileName,
    bytes: input.bytes,
    fail: (code) => new BulkFileError(code),
  });
  const sectionKey = normalizeKey(input.sectionLabel);
  const metadata = readSectionMetadata(
    sheets.find((candidate) => normalizeKey(candidate.sheet) === normalizeKey(SHEET_INSTRUCTIONS))?.data,
  );
  const issues: RawIssue<CommonIssueCode>[] = [];

  const dataSheet: SheetData | undefined =
    sheets.find((candidate) => normalizeKey(candidate.sheet) === sectionKey) ??
    sheets.find((candidate) => !["instrucciones", "listas"].includes(normalizeKey(candidate.sheet))) ??
    sheets[0];

  const workbook: BulkWorkbook<K> = {
    sha256,
    section: input.sectionLabel,
    ...metadata,
    sheetName: dataSheet?.sheet ?? input.sectionLabel,
    columns: [],
    ignoredColumns: [],
  };
  const finish = (rows: RawRow[] = []): ReadSectionResult<K> => ({ workbook, columns: workbook.columns, rows, issues });

  if (metadata.declaredSection && normalizeKey(metadata.declaredSection) !== sectionKey) {
    issues.push(createCommonIssue("WRONG_SECTION", { declared: metadata.declaredSection, section: input.sectionLabel }));
    return finish();
  }

  const headerIndex = dataSheet ? dataSheet.data.findIndex((row) => !isRowEmpty(row)) : -1;
  if (!dataSheet || headerIndex === -1) {
    issues.push(createCommonIssue("NO_ROWS"));
    return finish();
  }

  const byName = new Map<string, SectionColumnDef<K>>();
  for (const column of input.columns) {
    for (const name of [column.header, ...(column.aliases ?? [])]) byName.set(normalizeKey(name), column);
  }
  const seen = new Set<K>();
  let structuralErrors = false;
  dataSheet.data[headerIndex].forEach((rawHeader, index) => {
    if (rawHeader === null || rawHeader === undefined || (typeof rawHeader === "string" && rawHeader.trim() === "")) return;
    const header = cellText(rawHeader);
    const definition = byName.get(normalizeKey(header));
    if (!definition) {
      workbook.ignoredColumns.push(header);
      return;
    }
    if (seen.has(definition.key)) {
      issues.push(createCommonIssue("DUPLICATE_COLUMN", { column: header }));
      structuralErrors = true;
      return;
    }
    seen.add(definition.key);
    workbook.columns.push({ key: definition.key, header, index });
  });

  const missing = input.columns.filter((column) => column.required && !seen.has(column.key));
  if (missing.length) {
    issues.push(createCommonIssue("MISSING_COLUMNS", { list: missing.map((column) => column.header) }));
    structuralErrors = true;
  }
  if (workbook.ignoredColumns.length) issues.push(createCommonIssue("IGNORED_COLUMNS", { list: workbook.ignoredColumns }));

  const rows: RawRow[] = [];
  dataSheet.data.forEach((cells, index) => {
    if (index <= headerIndex || isRowEmpty(cells)) return;
    rows.push({ excelRow: index + 1, cells });
  });
  if (!structuralErrors && rows.length === 0) {
    issues.push(createCommonIssue("NO_ROWS"));
    structuralErrors = true;
  }
  if (!structuralErrors && rows.length > input.maxRows) {
    issues.push(createCommonIssue("TOO_MANY_ROWS", { n: rows.length, limit: input.maxRows }));
    structuralErrors = true;
  }

  if (!structuralErrors && !metadata.generatedAt && input.idKey) {
    const idColumn = workbook.columns.find((column) => column.key === input.idKey);
    if (idColumn && rows.some((row) => !isIdBlank(row.cells[idColumn.index]))) {
      issues.push(createCommonIssue("MISSING_METADATA"));
    }
  }

  return finish(structuralErrors ? [] : rows);
}

function isIdBlank(cell: CellValue) {
  return cell === null || cell === undefined || (typeof cell === "string" && cell.trim() === "");
}
