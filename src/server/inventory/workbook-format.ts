import { normalizeKey } from "../../utils/text-keys";

export const SHEET_INSTRUCTIONS = "Instrucciones";
export const SHEET_INVENTORY = "Inventario";
export const SHEET_LISTS = "Listas";
export const SHEET_NAMES = [SHEET_INSTRUCTIONS, SHEET_INVENTORY, SHEET_LISTS] as const;

export type FixedColumnKey =
  | "id"
  | "type"
  | "manufacturer"
  | "brand"
  | "gender"
  | "price"
  | "sku"
  | "color"
  | "isPublished"
  | "isActive";

export const FIXED_COLUMNS: ReadonlyArray<{ header: string; key: FixedColumnKey }> = [
  { header: "ID", key: "id" },
  { header: "Tipo", key: "type" },
  { header: "Fabricante", key: "manufacturer" },
  { header: "Marca", key: "brand" },
  { header: "Género", key: "gender" },
  { header: "Precio", key: "price" },
  { header: "SKU", key: "sku" },
  { header: "Color", key: "color" },
  { header: "Publicado", key: "isPublished" },
  { header: "Activo", key: "isActive" },
];

export interface WorkbookColumn {
  key: FixedColumnKey | "size";
  /** Encabezado original, tal como aparece en el archivo. */
  header: string;
  index: number;
  sizeKey?: string;
  sizeLabel?: string;
}

export const SIZE_HEADER_PREFIX = "Talla";
export const MAX_SIZE_LABEL_LENGTH = 40;

export const META_FILE_KIND = "Tipo de archivo";
export const META_GENERATED_AT = "Generado (UTC)";
export const META_FORMAT_VERSION = "Versión del formato";
export const KIND_TEMPLATE_LABEL = "Plantilla vacía";
export const KIND_INVENTORY_LABEL = "Inventario actual";
export const FORMAT_VERSION = 1;
export const AMBIGUOUS_SIZES_MARKER = "Unificar tallas";

export type WorkbookKind = "plantilla" | "inventario" | "desconocido";

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_REQUEST_BYTES = 4.5 * 1024 * 1024;
export const MAX_PRODUCT_ROWS = 5_000;
export const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 200;
export const PREVIEW_TTL_MS = 60 * 60 * 1000;
export const VALIDATION_FIRST_ROW = 2;
export const VALIDATION_LAST_ROW = MAX_PRODUCT_ROWS + 1;

export const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const TEMPLATE_FILE_NAME = "plantilla-inventario.xlsx";

export function inventoryFileName(date: Date) {
  return `inventario-${date.toISOString().slice(0, 10)}.xlsx`;
}

/** Recorta espacios, une los repetidos e ignora mayúsculas y tildes. */
export function normalizeHeader(text: string) {
  return normalizeKey(text);
}

/** Compara tallas sin distinguir mayúsculas ni espacios. */
export function normalizeSizeKey(label: string) {
  return label.replace(/\s+/g, "").toLocaleUpperCase("es");
}

export type SizeHeaderResult =
  | { kind: "size"; label: string }
  | { kind: "invalid" }
  | { kind: "none" };

/** Reconoce `Talla <etiqueta>`; la etiqueta tiene de 1 a 40 caracteres. */
export function parseSizeHeader(header: string): SizeHeaderResult {
  const collapsed = header.replace(/\s+/g, " ").trim();
  const normalized = normalizeHeader(collapsed);
  if (normalized === "talla") return { kind: "invalid" };
  const match = /^talla\s+(.+)$/i.exec(collapsed);
  if (!match) return { kind: "none" };
  const label = match[1].trim();
  if (label.length < 1 || label.length > MAX_SIZE_LABEL_LENGTH) return { kind: "invalid" };
  return { kind: "size", label };
}
