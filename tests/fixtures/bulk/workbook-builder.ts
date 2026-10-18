import writeXlsxFile from "write-excel-file/node";

export type RawCell = string | number | boolean | Date | null;

export {
  plainTextBytes,
  oleContainerBytes,
  zipWithoutWorkbook,
  zipWithMacros,
  zipWithManyEntries,
  truncatedZip,
} from "../inventory/workbook-builder";

const toCell = (value: RawCell): Record<string, unknown> | null => {
  if (value === null) return null;
  if (typeof value === "number") return { value, type: Number };
  if (typeof value === "boolean") return { value, type: Boolean };
  if (value instanceof Date) return { value, type: Date, format: "yyyy-mm-dd" };
  return { value, type: String };
};

/** Pares etiqueta/valor de la hoja Instrucciones; omite los que llegan como `undefined`. */
export function sectionMetadataRows(input: {
  section?: string;
  kind?: string;
  generatedAt?: string;
  version?: string | number;
}): RawCell[][] {
  const pairs: Array<[string, string | undefined]> = [
    ["Sección", input.section],
    ["Tipo de archivo", input.kind],
    ["Generado (UTC)", input.generatedAt],
    ["Versión del formato", input.version === undefined ? undefined : String(input.version)],
  ];
  return pairs.filter((pair): pair is [string, string] => pair[1] !== undefined);
}

/** Genera en memoria un `.xlsx` con las hojas indicadas, en ese orden. */
export async function buildWorkbookBuffer(sheets: Array<{ name: string; rows: RawCell[][] }>): Promise<Buffer> {
  const data = sheets.map((sheet) => ({ sheet: sheet.name, data: sheet.rows.map((row) => row.map(toCell)) }));
  const write = writeXlsxFile as unknown as (sheets: unknown) => { toBuffer(): Promise<Buffer> };
  return write(data).toBuffer();
}

export const MEDICOS_HEADER = ["Nombre", "Celular", "Sexo", "Talla", "Ciudad", "Hospital", "Clinica", "Especialidad"];
export const EVENTOS_HEADER = ["Desde", "Hasta", "Especialidad", "Lugar", "Nombre"];

/** Libro de dos hojas con la estructura de la hoja de cálculo de la propietaria (datos inventados). */
export function medicosWorkbook(rows: RawCell[][], eventos: RawCell[][] = []): Promise<Buffer> {
  return buildWorkbookBuffer([
    { name: "Medicos", rows: [MEDICOS_HEADER, ...rows] },
    { name: "Eventos", rows: [EVENTOS_HEADER, ...eventos] },
  ]);
}
