import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import readExcelFile from "read-excel-file/node";
import {
  MAX_FILE_BYTES,
  MAX_UNCOMPRESSED_BYTES,
  MAX_ZIP_ENTRIES,
} from "../inventory/workbook-format";
import type { FileRejectionCode } from "./issues";

export type CellValue = string | number | boolean | Date | null | undefined;

export interface SheetData {
  sheet: string;
  data: CellValue[][];
}

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function startsWith(bytes: Uint8Array, signature: number[]) {
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}

function inspectContainer(bytes: Uint8Array, fail: (code: FileRejectionCode) => Error) {
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
    throw fail("FILE_UNREADABLE");
  }
  if (entries > MAX_ZIP_ENTRIES || uncompressed > MAX_UNCOMPRESSED_BYTES) throw fail("FILE_UNREADABLE");
  if (hasMacros) throw fail("FILE_HAS_MACROS");
  if (!hasWorkbook) throw fail("FILE_NOT_XLSX");
}

/**
 * Aplica las guardas de la carga masiva en el orden de la 003 y lee todas las hojas.
 * `fail(code)` construye el error que se lanza, para que cada módulo conserve su propia clase.
 */
export async function readXlsxSheets(input: {
  fileName: string;
  bytes: Uint8Array;
  fail: (code: FileRejectionCode) => Error;
}): Promise<{ sheets: SheetData[]; sha256: string }> {
  const { fileName, bytes, fail } = input;
  if (bytes.length === 0) throw fail("FILE_REQUIRED");
  if (bytes.length > MAX_FILE_BYTES) throw fail("FILE_TOO_LARGE");
  if (startsWith(bytes, OLE_SIGNATURE)) throw fail("FILE_PROTECTED_OR_XLS");
  if (!/\.xlsx$/i.test(fileName.trim())) throw fail("FILE_NOT_XLSX");
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw fail("FILE_NOT_XLSX");
  inspectContainer(bytes, fail);

  let sheets: SheetData[];
  try {
    sheets = (await readExcelFile(Buffer.from(bytes) as never)) as unknown as SheetData[];
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "XLS_FILE_NOT_SUPPORTED") throw fail("FILE_PROTECTED_OR_XLS");
    if (code === "FILE_NOT_SUPPORTED") throw fail("FILE_NOT_XLSX");
    throw fail("FILE_UNREADABLE");
  }
  return { sheets, sha256: createHash("sha256").update(bytes).digest("hex") };
}
