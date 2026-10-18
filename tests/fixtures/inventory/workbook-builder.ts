import writeXlsxFile from "write-excel-file/node";
import { zipSync, strToU8 } from "fflate";
import { FIXED_COLUMNS } from "../../../src/server/inventory/workbook-format";

export type RawCell = string | number | boolean | Date | null;

const toCell = (value: RawCell): Record<string, unknown> | null => {
  if (value === null) return null;
  if (typeof value === "number") return { value, type: Number };
  if (typeof value === "boolean") return { value, type: Boolean };
  if (value instanceof Date) return { value, type: Date, format: "yyyy-mm-dd" };
  return { value, type: String };
};

export const FIXED_HEADER = FIXED_COLUMNS.map((column) => column.header);

export function metadataRows(input: { kind?: string; generatedAt?: string; version?: string | number } = {}): RawCell[][] {
  return [
    ["Tipo de archivo", input.kind ?? "Inventario actual"],
    ["Generado (UTC)", input.generatedAt ?? "2026-10-17T12:00:00.000Z"],
    ["Versión del formato", String(input.version ?? 1)],
  ];
}

export interface BuildInput {
  header?: RawCell[];
  rows?: RawCell[][];
  /** Filas de la hoja Instrucciones; por defecto, los metadatos. `null` omite la hoja. */
  instructions?: RawCell[][] | null;
  inventorySheetName?: string;
  extraSheets?: Array<{ sheet: string; data: RawCell[][] }>;
}

/** Genera en memoria un `.xlsx` con las hojas Instrucciones, Inventario y Listas. */
export async function buildInventoryBuffer(input: BuildInput = {}): Promise<Buffer> {
  const sheets: Array<{ sheet: string; data: Array<Array<Record<string, unknown> | null>> }> = [];
  const instructions = input.instructions === undefined ? metadataRows() : input.instructions;
  if (instructions) sheets.push({ sheet: "Instrucciones", data: instructions.map((row) => row.map(toCell)) });
  sheets.push({
    sheet: input.inventorySheetName ?? "Inventario",
    data: [input.header ?? FIXED_HEADER, ...(input.rows ?? [])].map((row) => row.map(toCell)),
  });
  sheets.push({ sheet: "Listas", data: [[{ value: "Tipos", type: String }]] });
  for (const extra of input.extraSheets ?? []) sheets.push({ sheet: extra.sheet, data: extra.data.map((row) => row.map(toCell)) });
  const write = writeXlsxFile as unknown as (sheets: unknown) => { toBuffer(): Promise<Buffer> };
  return write(sheets).toBuffer();
}

/* Entradas inválidas -------------------------------------------------- */

export const plainTextBytes = () => Buffer.from("esto no es un libro de Excel");

export const oleContainerBytes = () =>
  Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512)]);

export const zipWithoutWorkbook = () => Buffer.from(zipSync({ "hola.txt": strToU8("hola") }));

export const zipWithMacros = () =>
  Buffer.from(zipSync({ "xl/workbook.xml": strToU8("<workbook/>"), "xl/vbaProject.bin": strToU8("macro") }));

export const zipWithManyEntries = (count = 201) => {
  const files: Record<string, Uint8Array> = { "xl/workbook.xml": strToU8("<workbook/>") };
  for (let index = 0; index < count - 1; index += 1) files[`xl/extra${index}.xml`] = strToU8("x");
  return Buffer.from(zipSync(files));
};

export const truncatedZip = async () => {
  const valid = await buildInventoryBuffer({});
  return valid.subarray(0, Math.floor(valid.length / 2));
};

/** Abre un libro generado por la aplicación, lo modifica en memoria y lo vuelve a escribir. */
export async function reworkWorkbook(
  bytes: Uint8Array,
  edit: (sheet: { header: RawCell[]; rows: RawCell[][] }) => void,
): Promise<Buffer> {
  const { default: readExcelFile } = await import("read-excel-file/node");
  const sheets = (await readExcelFile(Buffer.from(bytes) as never)) as unknown as Array<{ sheet: string; data: RawCell[][] }>;
  const instructions = sheets[0].data;
  const [header, ...rows] = sheets[1].data;
  const sheet = { header, rows };
  edit(sheet);
  return buildInventoryBuffer({ header: sheet.header, rows: sheet.rows, instructions });
}
