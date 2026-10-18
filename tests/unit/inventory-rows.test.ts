import { describe, expect, it } from "vitest";
import { parseInventoryRow, type CellValue } from "../../src/server/inventory/rows";
import { FIXED_COLUMNS, type WorkbookColumn } from "../../src/server/inventory/workbook-format";

const columns: WorkbookColumn[] = [
  ...FIXED_COLUMNS.map((column, index) => ({ key: column.key, header: column.header, index })),
  { key: "size", header: "Talla M", index: 10, sizeKey: "M", sizeLabel: "M" },
];

type Overrides = Partial<Record<(typeof FIXED_COLUMNS)[number]["key"] | "M", CellValue>>;

function row(overrides: Overrides = {}) {
  const base: Record<string, CellValue> = {
    id: null,
    type: "Bata",
    manufacturer: "Fab",
    brand: "Marca",
    gender: "Dama",
    price: 50,
    sku: null,
    color: "Blanca",
    isPublished: "Sí",
    isActive: "Sí",
    M: 3,
  };
  const merged = { ...base, ...overrides };
  const cells = [...FIXED_COLUMNS.map((column) => merged[column.key]), merged.M];
  return parseInventoryRow(cells, columns, 2);
}
const codes = (parsed: ReturnType<typeof row>) => parsed.issues.map((issue) => issue.code);

describe("interpretación de filas", () => {
  it("interpreta una fila válida", () => {
    const parsed = row();
    expect(parsed.issues).toEqual([]);
    expect(parsed.legacyId).toBeNull();
    expect(parsed.values).toMatchObject({ type: "Bata", gender: "Dama", price: "50.00", sku: null, isPublished: true, isActive: true });
    expect(parsed.sizes.M).toEqual({ label: "M", quantity: 3 });
  });

  it("valida el ID", () => {
    expect(row({ id: 12 }).legacyId).toBe(12);
    expect(row({ id: "12" }).legacyId).toBe(12);
    expect(codes(row({ id: "abc" }))).toEqual(["INVALID_ID"]);
    expect(codes(row({ id: 1.5 }))).toEqual(["INVALID_ID"]);
    expect(codes(row({ id: 0 }))).toEqual(["INVALID_ID"]);
  });

  it("valida los textos", () => {
    expect(codes(row({ brand: null }))).toEqual(["REQUIRED"]);
    expect(codes(row({ color: "   " }))).toEqual(["REQUIRED"]);
    expect(codes(row({ type: "x".repeat(161) }))).toEqual(["TOO_LONG"]);
    expect(codes(row({ manufacturer: new Date() }))).toEqual(["INVALID_TYPE"]);
    expect(row({ brand: "  Marca  " }).values.brand).toBe("Marca");
  });

  it("valida el género sin distinguir mayúsculas ni tildes", () => {
    expect(row({ gender: "CABALLERO" }).values.gender).toBe("Caballero");
    expect(codes(row({ gender: "mujer" }))).toEqual(["INVALID_GENDER"]);
    expect(codes(row({ gender: null }))).toEqual(["REQUIRED"]);
  });

  it("valida el precio", () => {
    expect(row({ price: "45.5" }).values.price).toBe("45.50");
    expect(row({ price: "45,5" }).values.price).toBe("45.50");
    expect(row({ price: 49.990000000000002 }).values.price).toBe("49.99");
    expect(row({ price: 0 }).values.price).toBe("0.00");
    expect(codes(row({ price: "$50" }))).toEqual(["INVALID_PRICE"]);
    expect(codes(row({ price: -1 }))).toEqual(["INVALID_PRICE"]);
    expect(codes(row({ price: "1.250" }))).toEqual(["PRICE_DECIMALS"]);
    expect(codes(row({ price: 49.999 }))).toEqual(["PRICE_DECIMALS"]);
    expect(codes(row({ price: 100000000 }))).toEqual(["PRICE_TOO_HIGH"]);
    expect(codes(row({ price: null }))).toEqual(["REQUIRED"]);
  });

  it("interpreta el SKU", () => {
    expect(row({ sku: 123 }).values.sku).toBe("123");
    expect(row({ sku: "" }).values.sku).toBeNull();
    expect(codes(row({ sku: "s".repeat(161) }))).toEqual(["TOO_LONG"]);
  });

  it("interpreta Publicado y Activo", () => {
    expect(row({ isPublished: "si" }).values.isPublished).toBe(true);
    expect(row({ isPublished: "NO" }).values.isPublished).toBe(false);
    expect(row({ isActive: true }).values.isActive).toBe(true);
    expect(codes(row({ isPublished: "quizá" }))).toEqual(["INVALID_YES_NO"]);
  });

  it("aplica valores por defecto solo en productos nuevos", () => {
    const created = row({ isPublished: null, isActive: null });
    expect(created.values).toMatchObject({ isPublished: false, isActive: true });
    expect(codes(row({ id: 5, isPublished: null, isActive: null }))).toEqual(["REQUIRED", "REQUIRED"]);
  });

  it("valida las cantidades", () => {
    expect(row({ M: "7" }).sizes.M.quantity).toBe(7);
    expect(row({ M: null }).sizes.M.quantity).toBeNull();
    expect(row({ M: 0 }).sizes.M.quantity).toBe(0);
    for (const bad of [2.5, -1, "x"]) expect(codes(row({ M: bad }))).toEqual(["INVALID_QUANTITY"]);
  });

  it("reconoce el marcador de tallas ambiguas", () => {
    expect(codes(row({ id: 3, M: "Unificar tallas" }))).toEqual(["AMBIGUOUS_SIZES"]);
  });
});
