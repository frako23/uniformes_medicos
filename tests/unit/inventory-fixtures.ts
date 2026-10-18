import { createSnapshot, type CatalogSnapshot, type SnapshotProduct } from "../../src/server/inventory/changes";
import { parseInventoryRow, type CellValue } from "../../src/server/inventory/rows";
import { FIXED_COLUMNS, normalizeSizeKey, type WorkbookColumn } from "../../src/server/inventory/workbook-format";

export const UPDATED_AT = new Date("2026-10-01T00:00:00.000Z");

export function makeProduct(overrides: Partial<SnapshotProduct> & { legacyId: number }): SnapshotProduct {
  return {
    id: `uuid-${overrides.legacyId}`,
    legacyDocumentId: `doc-${overrides.legacyId}`,
    type: "Bata",
    manufacturer: "Fab A",
    brand: "Marca A",
    gender: "Dama",
    price: "50.00",
    sku: null,
    color: "Blanca",
    isPublished: true,
    isActive: true,
    updatedAt: UPDATED_AT,
    imageCount: 1,
    variants: [],
    ...overrides,
  };
}

const variant = (sizeLabel: string, quantity: number, id = `${sizeLabel}-${quantity}`) => ({ id, sizeLabel, quantity });

/** Instantánea determinista del catálogo de pruebas. */
export function makeSnapshot(): CatalogSnapshot {
  return createSnapshot([
    makeProduct({ legacyId: 1, imageCount: 2, variants: [variant("S", 5), variant("M", 5), variant("L", 0)] }),
    makeProduct({ legacyId: 2, brand: "Marca B", color: "Azul Marino", imageCount: 0, variants: [variant("M", 2)] }),
    makeProduct({ legacyId: 3, brand: "Marca C", isPublished: false, variants: [variant("S", 1)] }),
    makeProduct({ legacyId: 4, brand: "Marca D", isActive: false, variants: [variant("XS", 1), variant("XXL", 1)] }),
    makeProduct({ legacyId: 5, brand: "Marca E", sku: "BAT-001", gender: "Caballero", variants: [variant("2XL", 3), variant("Única", 1)] }),
    makeProduct({ legacyId: 6, brand: "Marca F", variants: [variant("M", 1, "m-upper"), variant("m", 1, "m-lower")] }),
  ]);
}

export function sizeColumn(label: string, index: number): WorkbookColumn {
  return { key: "size", header: `Talla ${label}`, index, sizeKey: normalizeSizeKey(label), sizeLabel: label };
}

export function columnsFor(sizeLabels: string[]): WorkbookColumn[] {
  return [
    ...FIXED_COLUMNS.map((column, index) => ({ key: column.key, header: column.header, index })),
    ...sizeLabels.map((label, offset) => sizeColumn(label, FIXED_COLUMNS.length + offset)),
  ];
}

export type RowInput = Partial<Record<(typeof FIXED_COLUMNS)[number]["key"], CellValue>> & { sizes?: Record<string, CellValue> };

/** Construye filas interpretadas como si vinieran de la hoja; `sizes` usa la etiqueta como clave. */
export function parseRows(inputs: RowInput[], sizeLabels: string[], firstRow = 2) {
  const columns = columnsFor(sizeLabels);
  const rows = inputs.map((input, index) => {
    const base: Record<string, CellValue> = {
      id: null, type: "Bata", manufacturer: "Fab A", brand: "Marca A", gender: "Dama", price: 50, sku: null,
      color: "Blanca", isPublished: "Sí", isActive: "Sí",
    };
    const merged = { ...base, ...input };
    const cells: CellValue[] = [
      ...FIXED_COLUMNS.map((column) => merged[column.key]),
      ...sizeLabels.map((label) => input.sizes?.[label] ?? null),
    ];
    return parseInventoryRow(cells, columns, firstRow + index);
  });
  return { rows, columns };
}
