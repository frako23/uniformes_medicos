import writeXlsxFile from "write-excel-file/node";
import dataValidation from "@onparallel/write-excel-file-data-validation";
import { compareSizeLabels } from "../../utils/catalog-filters";
import type { CatalogSnapshot, SnapshotProduct } from "./changes";
import {
  AMBIGUOUS_SIZES_MARKER,
  FIXED_COLUMNS,
  FORMAT_VERSION,
  KIND_INVENTORY_LABEL,
  KIND_TEMPLATE_LABEL,
  MAX_FILE_BYTES,
  MAX_PRODUCT_ROWS,
  META_FILE_KIND,
  META_FORMAT_VERSION,
  META_GENERATED_AT,
  SHEET_INSTRUCTIONS,
  SHEET_INVENTORY,
  SHEET_LISTS,
  SIZE_HEADER_PREFIX,
  VALIDATION_FIRST_ROW,
  VALIDATION_LAST_ROW,
  normalizeSizeKey,
} from "./workbook-format";

type Cell = Record<string, unknown> | null;

export interface BuildWorkbookInput {
  kind: "plantilla" | "inventario";
  snapshot: CatalogSnapshot;
  generatedAt: Date;
}

const HEADER_STYLE = { fontWeight: "bold", backgroundColor: "#e2e8f0" } as const;
const ID_STYLE = { backgroundColor: "#e5e7eb", textColor: "#475569" } as const;

const text = (value: string | null, extra: Record<string, unknown> = {}): Cell =>
  value === null || value === "" ? null : { value, type: String, ...extra };
const textColumn = (value: string | null): Cell => text(value, { format: "@" });
const heading = (value: string): Cell => ({ value, type: String, fontWeight: "bold" });

function sizeColumnLabels(snapshot: CatalogSnapshot) {
  return Object.values(snapshot.canonicalSizes).sort(compareSizeLabels);
}

function ambiguousProducts(snapshot: CatalogSnapshot) {
  return snapshot.products.filter((product) => {
    const keys = product.variants.map((variant) => normalizeSizeKey(variant.sizeLabel));
    return new Set(keys).size !== keys.length;
  });
}

function compareProducts(left: SnapshotProduct, right: SnapshotProduct) {
  return (
    left.type.localeCompare(right.type, "es", { sensitivity: "base" }) ||
    left.brand.localeCompare(right.brand, "es", { sensitivity: "base" }) ||
    left.color.localeCompare(right.color, "es", { sensitivity: "base" }) ||
    left.gender.localeCompare(right.gender, "es") ||
    left.legacyId - right.legacyId
  );
}

function instructionsSheet(input: BuildWorkbookInput): Cell[][] {
  const { kind, snapshot, generatedAt } = input;
  const ambiguous = ambiguousProducts(snapshot);
  const rows: Cell[][] = [
    [heading("Carga masiva de inventario")],
    [],
    [heading("Cómo llenar este archivo")],
    [text("1. Trabaja solo en la hoja “Inventario”: una fila por producto.")],
    [text("2. Una fila con ID edita ese producto. Una fila sin ID crea un producto nuevo. No modifiques la columna ID.")],
    [text("3. Para una talla nueva agrega una columna con el encabezado “Talla <etiqueta>”, por ejemplo “Talla 4XL”.")],
    [text("4. Guarda el archivo como Excel (.xlsx), súbelo en el panel y revisa la vista previa antes de confirmar.")],
    [],
    [heading("Columnas")],
    [text("ID"), text("Identificador del producto. Vacío = producto nuevo.")],
    [text("Tipo, Fabricante, Marca, Color"), text("Obligatorios. Texto de 1 a 160 caracteres.")],
    [text("Género"), text("Obligatorio: Dama, Caballero o Unisex.")],
    [text("Precio"), text("Obligatorio. Número mayor o igual a 0, con máximo dos decimales.")],
    [text("SKU"), text("Opcional, hasta 160 caracteres y único en el catálogo. Vacío = sin SKU.")],
    [text("Publicado, Activo"), text("Sí o No. En productos nuevos, vacío equivale a: Publicado = No y Activo = Sí.")],
    [text("Talla …"), text("Existencia total de la talla (entero ≥ 0). Reemplaza el valor actual, no se suma.")],
    [],
    [heading("Celdas vacías y cero")],
    [text("Fila sin ID = producto nuevo. Publicado vacío = No y Activo vacío = Sí.")],
    [text("Una talla vacía significa que el producto no usa esa talla. Si el producto ya la tiene, escribe 0 para dejarla sin existencias: la carga masiva no elimina tallas.")],
    [text("Una columna de talla eliminada no cambia las existencias de esa talla.")],
    [],
    [heading("Límites")],
    [text(`Archivo .xlsx de hasta ${MAX_FILE_BYTES / 1024 / 1024} MB y ${MAX_PRODUCT_ROWS.toLocaleString("es-ES")} productos. Sin macros ni contraseña.`)],
    [text("La carga es de todo o nada: nunca elimina productos, tallas ni fotografías, y las fotos se agregan desde la edición de cada producto.")],
  ];
  if (ambiguous.length) {
    rows.push([], [heading("Productos con tallas duplicadas")]);
    rows.push([text(`En estos productos la celda de la talla duplicada dice “${AMBIGUOUS_SIZES_MARKER}”. Unifícalas desde la edición del producto antes de cargarlos.`)]);
    for (const product of ambiguous) rows.push([text(`ID ${product.legacyId}`), text(`${product.type} · ${product.brand} · ${product.color}`)]);
  }
  rows.push(
    [],
    [heading("Datos del archivo")],
    [text(META_FILE_KIND), text(kind === "plantilla" ? KIND_TEMPLATE_LABEL : KIND_INVENTORY_LABEL)],
    [text(META_GENERATED_AT), text(generatedAt.toISOString())],
    [text(META_FORMAT_VERSION), text(String(FORMAT_VERSION))],
  );
  return rows;
}

function listsSheet(snapshot: CatalogSnapshot) {
  const columns = [
    ["Tipos", snapshot.distinctValues.types],
    ["Fabricantes", snapshot.distinctValues.manufacturers],
    ["Marcas", snapshot.distinctValues.brands],
    ["Colores", snapshot.distinctValues.colors],
    ["Tallas", snapshot.distinctValues.sizes],
  ] as const;
  const height = Math.max(0, ...columns.map(([, values]) => values.length));
  const rows: Cell[][] = [columns.map(([title]) => heading(title))];
  for (let index = 0; index < height; index += 1) {
    rows.push(columns.map(([, values]) => text(values[index] ?? null)));
  }
  return { rows, lengths: columns.map(([, values]) => values.length) };
}

function inventoryRows(input: BuildWorkbookInput, sizeLabels: string[]): Cell[][] {
  const header: Cell[] = [
    ...FIXED_COLUMNS.map((column) => ({ value: column.header, type: String, ...HEADER_STYLE })),
    ...sizeLabels.map((label) => ({ value: `${SIZE_HEADER_PREFIX} ${label}`, type: String, ...HEADER_STYLE })),
  ];
  if (input.kind === "plantilla") return [header];

  const rows: Cell[][] = [header];
  for (const product of [...input.snapshot.products].sort(compareProducts)) {
    const byKey = new Map<string, number[]>();
    for (const variant of product.variants) {
      const key = normalizeSizeKey(variant.sizeLabel);
      byKey.set(key, [...(byKey.get(key) ?? []), variant.quantity]);
    }
    rows.push([
      { value: product.legacyId, type: Number, ...ID_STYLE },
      textColumn(product.type),
      textColumn(product.manufacturer),
      textColumn(product.brand),
      textColumn(product.gender),
      { value: Number(product.price), type: Number, format: "0.00" },
      textColumn(product.sku),
      textColumn(product.color),
      text(product.isPublished ? "Sí" : "No"),
      text(product.isActive ? "Sí" : "No"),
      ...sizeLabels.map((label): Cell => {
        const quantities = byKey.get(normalizeSizeKey(label));
        if (!quantities) return null;
        if (quantities.length > 1) return text(AMBIGUOUS_SIZES_MARKER);
        return { value: quantities[0], type: Number };
      }),
    ]);
  }
  return rows;
}

function validations(sizeCount: number, listLengths: number[]) {
  const range = (column: number) => ({
    from: { row: VALIDATION_FIRST_ROW, column },
    to: { row: VALIDATION_LAST_ROW, column },
  });
  const suggestion = (column: number, listColumn: string, length: number, name: string) => ({
    cellRange: range(column),
    validation: {
      type: "list" as const,
      valuesRange: `${SHEET_LISTS}!$${listColumn}$2:$${listColumn}$${Math.max(2, length + 1)}`,
      errorStyle: "information" as const,
      error: `“${name}” no está en la lista; se creará un valor nuevo.`,
      showErrorMessage: true,
    },
  });
  const rules: Array<Record<string, unknown>> = [
    {
      cellRange: range(1),
      validation: { type: "any", inputTitle: "ID", input: "No modifiques este valor. Déjalo vacío para crear un producto nuevo." },
    },
    suggestion(2, "A", listLengths[0], "Tipo"),
    suggestion(3, "B", listLengths[1], "Fabricante"),
    suggestion(4, "C", listLengths[2], "Marca"),
    {
      cellRange: range(5),
      validation: { type: "list", values: ["Dama", "Caballero", "Unisex"], errorStyle: "stop", error: "Usa Dama, Caballero o Unisex." },
    },
    {
      cellRange: range(6),
      validation: { type: "decimal", operator: ">=", value: 0, errorStyle: "stop", error: "El precio debe ser un número mayor o igual a 0." },
    },
    suggestion(8, "D", listLengths[3], "Color"),
    { cellRange: range(9), validation: { type: "list", values: ["Sí", "No"], errorStyle: "stop", error: "Usa Sí o No." } },
    { cellRange: range(10), validation: { type: "list", values: ["Sí", "No"], errorStyle: "stop", error: "Usa Sí o No." } },
  ];
  if (sizeCount > 0) {
    rules.push({
      cellRange: { from: { row: VALIDATION_FIRST_ROW, column: FIXED_COLUMNS.length + 1 }, to: { row: VALIDATION_LAST_ROW, column: FIXED_COLUMNS.length + sizeCount } },
      validation: { type: "integer", operator: ">=", value: 0, errorStyle: "stop", error: "La cantidad debe ser un número entero mayor o igual a 0." },
    });
  }
  return rules;
}

/** Genera la plantilla vacía o el inventario actual como libro `.xlsx` en memoria. */
export async function buildInventoryWorkbook(input: BuildWorkbookInput): Promise<Buffer> {
  const sizeLabels = sizeColumnLabels(input.snapshot);
  const lists = listsSheet(input.snapshot);
  const columnWidths = [
    { width: 8 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 14 },
    { width: 12 },
    { width: 16 },
    { width: 18 },
    { width: 12 },
    { width: 10 },
    ...sizeLabels.map(() => ({ width: 11 })),
  ];

  const sheets = [
    { data: instructionsSheet(input), sheet: SHEET_INSTRUCTIONS, columns: [{ width: 48 }, { width: 70 }] },
    {
      data: inventoryRows(input, sizeLabels),
      sheet: SHEET_INVENTORY,
      columns: columnWidths,
      stickyRowsCount: 1,
      dataValidation: validations(sizeLabels.length, lists.lengths),
    },
    { data: lists.rows, sheet: SHEET_LISTS, columns: [{ width: 24 }, { width: 24 }, { width: 24 }, { width: 24 }, { width: 12 }] },
  ];

  // Los tipos de `write-excel-file` no conocen la opción `dataValidation` del complemento.
  const write = writeXlsxFile as unknown as (
    sheets: unknown,
    options: unknown,
  ) => { toBuffer(): Promise<Buffer> };
  return write(sheets, { features: [dataValidation] }).toBuffer();
}
