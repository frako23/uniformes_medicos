import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import readExcelFile from "read-excel-file/node";
import { createIssue, InventoryFileError, type RawIssue } from "./issues";
import type { CellValue } from "./rows";
import {
  FIXED_COLUMNS,
  KIND_INVENTORY_LABEL,
  KIND_TEMPLATE_LABEL,
  MAX_FILE_BYTES,
  MAX_PRODUCT_ROWS,
  MAX_UNCOMPRESSED_BYTES,
  MAX_ZIP_ENTRIES,
  META_FILE_KIND,
  META_FORMAT_VERSION,
  META_GENERATED_AT,
  SHEET_INSTRUCTIONS,
  SHEET_INVENTORY,
  normalizeHeader,
  normalizeSizeKey,
  parseSizeHeader,
  type WorkbookColumn,
  type WorkbookKind,
} from "./workbook-format";

export interface InventoryWorkbookInfo {
  sha256: string;
  kind: WorkbookKind;
  generatedAt: Date | null;
  formatVersion: number | null;
  ignoredColumns: string[];
}

export interface RawRow {
  /** Número de fila visible en Excel. */
  excelRow: number;
  cells: CellValue[];
}

export interface ReadInventoryResult {
  workbook: InventoryWorkbookInfo;
  columns: WorkbookColumn[];
  rows: RawRow[];
  issues: RawIssue[];
}

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function startsWith(bytes: Uint8Array, signature: number[]) {
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}

function inspectContainer(bytes: Uint8Array) {
  let entries = 0;
  let uncompressed = 0;
  let hasWorkbook = false;
  let hasMacros = false;
  try {
    unzipSync(bytes, {
      filter(file) {
        entries += 1;
        uncompressed += file.originalSize;
        if (file.name === "xl/workbook.xml") hasWorkbook = true;
        if (file.name.toLowerCase() === "xl/vbaproject.bin") hasMacros = true;
        return false;
      },
    });
  } catch {
    throw new InventoryFileError("FILE_UNREADABLE");
  }
  if (entries > MAX_ZIP_ENTRIES || uncompressed > MAX_UNCOMPRESSED_BYTES) throw new InventoryFileError("FILE_UNREADABLE");
  if (hasMacros) throw new InventoryFileError("FILE_HAS_MACROS");
  if (!hasWorkbook) throw new InventoryFileError("FILE_NOT_XLSX");
}

function isRowEmpty(row: CellValue[]) {
  return row.every((cell) => cell === null || cell === undefined || (typeof cell === "string" && cell.trim() === ""));
}

function readMetadata(rows: CellValue[][] | undefined) {
  const found = new Map<string, string>();
  for (const row of rows ?? []) {
    const [label, value] = row;
    if (typeof label !== "string" || value === null || value === undefined) continue;
    found.set(normalizeHeader(label), value instanceof Date ? value.toISOString() : String(value).trim());
  }
  const rawKind = normalizeHeader(found.get(normalizeHeader(META_FILE_KIND)) ?? "");
  const kind: WorkbookKind =
    rawKind === normalizeHeader(KIND_TEMPLATE_LABEL)
      ? "plantilla"
      : rawKind === normalizeHeader(KIND_INVENTORY_LABEL)
        ? "inventario"
        : "desconocido";
  const generated = found.get(normalizeHeader(META_GENERATED_AT));
  const parsedDate = generated ? new Date(generated) : null;
  const generatedAt = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;
  const version = Number(found.get(normalizeHeader(META_FORMAT_VERSION)));
  return { kind, generatedAt, formatVersion: Number.isInteger(version) && version > 0 ? version : null };
}

/** Lee y estructura un libro subido. Lanza `InventoryFileError` cuando no puede leerse como `.xlsx`. */
export async function readInventoryWorkbook(input: { fileName: string; bytes: Uint8Array }): Promise<ReadInventoryResult> {
  const { fileName, bytes } = input;
  if (bytes.length === 0) throw new InventoryFileError("FILE_REQUIRED");
  if (bytes.length > MAX_FILE_BYTES) throw new InventoryFileError("FILE_TOO_LARGE");
  if (startsWith(bytes, OLE_SIGNATURE)) throw new InventoryFileError("FILE_PROTECTED_OR_XLS");
  if (!/\.xlsx$/i.test(fileName.trim())) throw new InventoryFileError("FILE_NOT_XLSX");
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new InventoryFileError("FILE_NOT_XLSX");
  inspectContainer(bytes);

  let sheets: Array<{ sheet: string; data: CellValue[][] }>;
  try {
    sheets = (await readExcelFile(Buffer.from(bytes) as never)) as unknown as typeof sheets;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "XLS_FILE_NOT_SUPPORTED") throw new InventoryFileError("FILE_PROTECTED_OR_XLS");
    if (code === "FILE_NOT_SUPPORTED") throw new InventoryFileError("FILE_NOT_XLSX");
    throw new InventoryFileError("FILE_UNREADABLE");
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const findSheet = (name: string) => sheets.find((candidate) => normalizeHeader(candidate.sheet) === normalizeHeader(name));
  const metadata = readMetadata(findSheet(SHEET_INSTRUCTIONS)?.data);
  const workbook: InventoryWorkbookInfo = { sha256, ...metadata, ignoredColumns: [] };
  const issues: RawIssue[] = [];
  if (!metadata.generatedAt) issues.push(createIssue("MISSING_METADATA"));

  const inventory = findSheet(SHEET_INVENTORY);
  if (!inventory) {
    issues.push(createIssue("SHEET_NOT_FOUND", { list: sheets.map((candidate) => candidate.sheet) }));
    return { workbook, columns: [], rows: [], issues };
  }

  const headerIndex = inventory.data.findIndex((row) => !isRowEmpty(row));
  if (headerIndex === -1) {
    issues.push(createIssue("MISSING_COLUMNS", { list: FIXED_COLUMNS.map((column) => column.header) }));
    return { workbook, columns: [], rows: [], issues };
  }

  const columns: WorkbookColumn[] = [];
  const seenFixed = new Set<string>();
  const seenSizes = new Set<string>();
  let structuralErrors = false;
  inventory.data[headerIndex].forEach((rawHeader, index) => {
    if (rawHeader === null || rawHeader === undefined || (typeof rawHeader === "string" && rawHeader.trim() === "")) return;
    const header = rawHeader instanceof Date ? rawHeader.toISOString() : String(rawHeader).trim();
    const normalized = normalizeHeader(header);
    const fixed = FIXED_COLUMNS.find((column) => normalizeHeader(column.header) === normalized);
    if (fixed) {
      if (seenFixed.has(fixed.key)) {
        issues.push(createIssue("DUPLICATE_COLUMN", { column: header }));
        structuralErrors = true;
        return;
      }
      seenFixed.add(fixed.key);
      columns.push({ key: fixed.key, header, index });
      return;
    }
    const size = parseSizeHeader(header);
    if (size.kind === "invalid") {
      issues.push(createIssue("INVALID_SIZE_COLUMN", { column: header }));
      structuralErrors = true;
      return;
    }
    if (size.kind === "size") {
      const sizeKey = normalizeSizeKey(size.label);
      if (seenSizes.has(sizeKey)) {
        issues.push(createIssue("DUPLICATE_COLUMN", { column: header }));
        structuralErrors = true;
        return;
      }
      seenSizes.add(sizeKey);
      columns.push({ key: "size", header, index, sizeKey, sizeLabel: size.label });
      return;
    }
    workbook.ignoredColumns.push(header);
  });

  const missing = FIXED_COLUMNS.filter((column) => !seenFixed.has(column.key));
  if (missing.length) {
    issues.push(createIssue("MISSING_COLUMNS", { list: missing.map((column) => column.header) }));
    structuralErrors = true;
  }
  if (workbook.ignoredColumns.length) issues.push(createIssue("IGNORED_COLUMNS", { list: workbook.ignoredColumns }));

  const rows: RawRow[] = [];
  inventory.data.forEach((cells, index) => {
    if (index <= headerIndex || isRowEmpty(cells)) return;
    rows.push({ excelRow: index + 1, cells });
  });
  if (!structuralErrors && rows.length === 0) {
    issues.push(createIssue("NO_PRODUCTS"));
    structuralErrors = true;
  }
  if (!structuralErrors && rows.length > MAX_PRODUCT_ROWS) {
    issues.push(createIssue("TOO_MANY_PRODUCTS", { n: rows.length }));
    structuralErrors = true;
  }

  return { workbook, columns, rows: structuralErrors ? [] : rows, issues };
}
