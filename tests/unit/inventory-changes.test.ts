import { describe, expect, it } from "vitest";
import {
  buildCanonicalSizes,
  buildChangeSet,
  computeBaseline,
  createSnapshot,
  isAvailable,
  productLabel,
  type CatalogSnapshot,
  type InventoryChangeSet,
} from "../../src/server/inventory/changes";
import { parseInventoryRow } from "../../src/server/inventory/rows";
import { readInventoryWorkbook } from "../../src/server/inventory/workbook-reader";
import { FIXED_HEADER, buildInventoryBuffer, type RawCell } from "../fixtures/inventory/workbook-builder";
import { UPDATED_AT, makeProduct, makeSnapshot, parseRows, type RowInput } from "./inventory-fixtures";

function run(
  inputs: RowInput[],
  sizeLabels: string[] = [],
  options: { snapshot?: CatalogSnapshot; generatedAt?: Date | null } = {},
): InventoryChangeSet {
  const { rows, columns } = parseRows(inputs, sizeLabels);
  return buildChangeSet({
    rows,
    workbook: { generatedAt: options.generatedAt ?? null, columns },
    snapshot: options.snapshot ?? makeSnapshot(),
  });
}
const codes = (set: InventoryChangeSet) => set.issues.map((issue) => issue.code);
const issue = (set: InventoryChangeSet, code: string) => set.issues.find((candidate) => candidate.code === code);

describe("fundamentos", () => {
  it("computeBaseline es estable aunque cambie el orden de entrada", () => {
    const snapshot = makeSnapshot();
    const reversed = createSnapshot([...snapshot.products].reverse());
    expect(computeBaseline(reversed, [1, 2])).toBe(computeBaseline(snapshot, [2, 1]));
  });

  it("computeBaseline cambia con un campo, una talla o el marcador, pero no con productos no referenciados", () => {
    const snapshot = makeSnapshot();
    const base = computeBaseline(snapshot, [1]);
    const edit = (change: (product: ReturnType<typeof makeProduct>) => void, legacyId: number) => {
      const products = makeSnapshot().products.map((product) => ({ ...product, variants: product.variants.map((v) => ({ ...v })) }));
      change(products.find((product) => product.legacyId === legacyId)!);
      return createSnapshot(products);
    };
    expect(computeBaseline(edit((product) => (product.price = "51.00"), 1), [1])).not.toBe(base);
    expect(computeBaseline(edit((product) => (product.variants[0].quantity += 1), 1), [1])).not.toBe(base);
    expect(computeBaseline(edit((product) => (product.brand = "Otra"), 2), [1])).toBe(base);
    const withExtra = createSnapshot([...snapshot.products, makeProduct({ legacyId: 7 })]);
    expect(computeBaseline(withExtra, [1])).not.toBe(base);
  });

  it("buildCanonicalSizes elige la escritura más usada y, en empate, la primera por orden de tallas", () => {
    const canonical = buildCanonicalSizes([
      { variants: [{ sizeLabel: "M" }, { sizeLabel: "xl" }] },
      { variants: [{ sizeLabel: "m" }, { sizeLabel: "XL" }] },
      { variants: [{ sizeLabel: "m" }] },
    ]);
    expect(canonical.M).toBe("m");
    expect(canonical.XL).toBe("XL");
  });

  it("isAvailable exige publicado, activo y alguna existencia positiva", () => {
    expect(isAvailable({ isPublished: true, isActive: true, quantities: [0, 2] })).toBe(true);
    expect(isAvailable({ isPublished: false, isActive: true, quantities: [2] })).toBe(false);
    expect(isAvailable({ isPublished: true, isActive: false, quantities: [2] })).toBe(false);
    expect(isAvailable({ isPublished: true, isActive: true, quantities: [0] })).toBe(false);
  });

  it("productLabel usa Tipo · Marca · Color · Género", () => {
    expect(productLabel({ type: "Bata", brand: "Marca A", color: "Blanca", gender: "Dama" })).toBe("Bata · Marca A · Blanca · Dama");
  });
});

describe("ediciones", () => {
  it("una fila sin diferencias no genera cambios", () => {
    const set = run([{ id: 1, sizes: { S: 5, M: 5, L: 0 } }], ["S", "M", "L"]);
    expect(set.status).toBe("no_changes");
    expect(set.counts).toMatchObject({ unchangedProducts: 1, updatedProducts: 0, newSizes: 0, changedStocks: 0 });
    expect(set.referencedLegacyIds).toEqual([1]);
  });

  it("solo aparecen los campos que cambian; el precio se compara con dos decimales", () => {
    const set = run([{ id: 1, price: "55,5", type: "bata", sizes: { S: 5 } }], ["S"]);
    expect(set.status).toBe("ready");
    expect(set.updates[0].fields).toEqual([
      { field: "type", label: "Tipo", from: "Bata", to: "bata" },
      { field: "price", label: "Precio", from: "50.00", to: "55.50" },
    ]);
    expect(run([{ id: 1, price: 50.0 }]).status).toBe("no_changes");
  });

  it("empareja tallas sin distinguir mayúsculas y reemplaza la cantidad", () => {
    const set = run([{ id: 1, sizes: { m: 8 } }], ["m"]);
    expect(set.updates[0].sizes).toEqual([{ label: "M", from: 5, to: 8 }]);
    expect(set.counts).toMatchObject({ changedStocks: 1, newSizes: 0 });
    expect(set.writes.updates[0].variants).toEqual([{ sizeLabel: "M", quantity: 8 }]);
  });

  it("crea tallas nuevas con la etiqueta canónica del catálogo o la del encabezado", () => {
    const canonical = run([{ id: 1, sizes: { xxl: 2 } }], ["xxl"]);
    expect(canonical.updates[0].sizes).toEqual([{ label: "XXL", from: null, to: 2 }]);
    const unknown = run([{ id: 1, sizes: { "4XL": 2 } }], ["4XL"]);
    expect(unknown.updates[0].sizes).toEqual([{ label: "4XL", from: null, to: 2 }]);
    expect(unknown.counts.newSizes).toBe(1);
  });

  it("las celdas vacías y las columnas ausentes no cambian nada", () => {
    expect(run([{ id: 1, sizes: { XL: null } }], ["XL"]).status).toBe("no_changes");
    expect(run([{ id: 1 }]).status).toBe("no_changes");
  });

  it("una celda vacía en una talla existente es un error", () => {
    const set = run([{ id: 1, sizes: { S: null } }], ["S"]);
    expect(set.status).toBe("invalid");
    expect(issue(set, "EXISTING_SIZE_BLANK")).toMatchObject({ column: "Talla S", rows: ["2"] });
  });

  it("un producto con tallas M y m es ambiguo", () => {
    const set = run([{ id: 6, sizes: { M: 3 } }], ["M"]);
    expect(set.status).toBe("invalid");
    expect(codes(set)).toContain("AMBIGUOUS_SIZES");
  });

  it("detecta IDs inexistentes y repetidos", () => {
    const set = run([{ id: 99 }, { id: 1 }, { id: 1 }]);
    expect(issue(set, "UNKNOWN_ID")?.rows).toEqual(["2"]);
    expect(issue(set, "DUPLICATE_ID")?.rows).toEqual(["3-4"]);
    expect(set.status).toBe("invalid");
  });

  it("evalúa el SKU sobre el resultado final", () => {
    const inUse = run([{ id: 1, sku: "BAT-001" }]);
    expect(issue(inUse, "SKU_IN_USE")?.message).toContain("ID 5");
    // El dueño actual libera el SKU en el mismo archivo.
    const released = run([{ id: 1, sku: "BAT-001" }, { id: 5, sku: "" }]);
    expect(released.status).toBe("ready");
    const repeated = run([{ id: 1, sku: "X" }, { id: 2, sku: "X" }]);
    expect(issue(repeated, "SKU_REPEATED")?.rows).toEqual(["2-3"]);
  });

  it("permite intercambiar SKU entre dos filas y vaciar un SKU", () => {
    const snapshot = createSnapshot([
      makeProduct({ legacyId: 10, sku: "A", variants: [] }),
      makeProduct({ legacyId: 11, brand: "Otra", sku: "B", variants: [] }),
    ]);
    const swapped = run([{ id: 10, sku: "B" }, { id: 11, brand: "Otra", sku: "A" }], [], { snapshot });
    expect(swapped.status).toBe("ready");
    expect(swapped.writes.updates.every((update) => update.skuChanged)).toBe(true);
    const cleared = run([{ id: 5, brand: "Marca E", gender: "Caballero", sku: "" }]);
    expect(cleared.updates[0].fields).toEqual([{ field: "sku", label: "SKU", from: "BAT-001", to: null }]);
  });

  it("calcula la disponibilidad antes y después con todas las tallas del producto", () => {
    const soldOut = run([{ id: 1, sizes: { S: 0, M: 0 } }], ["S", "M"]);
    expect(soldOut.updates[0].availability).toEqual({ from: true, to: false });
    const stillAvailable = run([{ id: 1, sizes: { S: 0, M: 0 } }], ["S", "M"], {
      snapshot: createSnapshot([makeProduct({ legacyId: 1, variants: [{ id: "a", sizeLabel: "S", quantity: 1 }, { id: "b", sizeLabel: "M", quantity: 1 }, { id: "c", sizeLabel: "L", quantity: 4 }] })]),
    });
    expect(stillAvailable.updates[0].availability).toEqual({ from: true, to: true });
  });

  it("nunca elimina y reaplicar el estado resultante no produce cambios (SC-006)", () => {
    const first = run([{ id: 1, price: 60, sizes: { S: 9, "4XL": 1 } }], ["S", "4XL"]);
    expect(first.status).toBe("ready");
    const snapshot = makeSnapshot();
    const product = snapshot.products[0];
    const write = first.writes.updates[0];
    Object.assign(product, { price: write.values.price });
    for (const variant of write.variants) {
      const existing = product.variants.find((candidate) => candidate.sizeLabel === variant.sizeLabel);
      if (existing) existing.quantity = variant.quantity;
      else product.variants.push({ id: variant.sizeLabel, ...variant });
    }
    const second = run([{ id: 1, price: 60, sizes: { S: 9, "4XL": 1 } }], ["S", "4XL"], { snapshot: createSnapshot(snapshot.products) });
    expect(second.status).toBe("no_changes");
  });
});

describe("altas", () => {
  const brandNew = { type: "Pijama", manufacturer: "Fab B", brand: "Marca B2", gender: "Unisex", price: 45.5, color: "Azul" } satisfies RowInput;

  it("una fila sin ID es un alta con Publicado = No y Activo = Sí por defecto", () => {
    const set = run([{ ...brandNew, isPublished: null, isActive: null, sizes: { M: 10, "4XL": 2 } }], ["M", "4XL"]);
    expect(set.status).toBe("ready");
    expect(set.creates).toHaveLength(1);
    expect(set.creates[0]).toMatchObject({ action: "create", legacyId: null, label: "Pijama · Marca B2 · Azul · Unisex" });
    expect(set.creates[0].fields.find((field) => field.field === "isPublished")).toMatchObject({ from: null, to: "No" });
    expect(set.creates[0].fields.find((field) => field.field === "isActive")).toMatchObject({ to: "Sí" });
    expect(set.writes.creates[0].variants).toEqual([{ sizeLabel: "M", quantity: 10 }, { sizeLabel: "4XL", quantity: 2 }]);
    expect(set.counts).toMatchObject({ newProducts: 1, newSizes: 2 });
  });

  it("exige los campos obligatorios y solo crea las tallas con cantidad", () => {
    const missing = run([{ ...brandNew, brand: null }]);
    expect(missing.status).toBe("invalid");
    expect(codes(missing)).toContain("REQUIRED");
    const sized = run([{ ...brandNew, sizes: { M: 3, S: null, L: 0 } }], ["M", "S", "L"]);
    expect(sized.writes.creates[0].variants).toEqual([{ sizeLabel: "M", quantity: 3 }, { sizeLabel: "L", quantity: 0 }]);
  });

  it("valida el SKU contra el catálogo y entre filas", () => {
    expect(codes(run([{ ...brandNew, sku: "BAT-001" }]))).toContain("SKU_IN_USE");
    const repeated = run([{ ...brandNew, sku: "N-1" }, { ...brandNew, color: "Rojo", sku: "N-1" }]);
    expect(issue(repeated, "SKU_REPEATED")?.rows).toEqual(["2-3"]);
  });

  it("un archivo mixto distingue altas de ediciones", () => {
    const set = run([{ id: 1, price: 70 }, { ...brandNew }]);
    expect(set.counts).toMatchObject({ newProducts: 1, updatedProducts: 1 });
    expect(set.updates[0].action).toBe("update");
    expect(set.creates[0].action).toBe("create");
  });
});

describe("advertencias", () => {
  const brandNew = { type: "Pijama", manufacturer: "Fab B", brand: "Marca B2", gender: "Unisex", price: 45, color: "Azul" } satisfies RowInput;

  it("NEW_VALUE compara sin distinguir mayúsculas ni tildes", () => {
    const set = run([{ ...brandNew, manufacturer: "fab a", color: "azul marino" }]);
    const newValues = set.issues.filter((candidate) => candidate.code === "NEW_VALUE").map((candidate) => candidate.column);
    expect(newValues).toEqual(["Tipo", "Marca"]);
    expect(newValues).not.toContain("Color");
    expect(newValues).not.toContain("Fabricante");
  });

  it("NEW_SIZE se emite una vez por etiqueta nueva", () => {
    const set = run([{ ...brandNew, sizes: { "5XL": 1 } }, { ...brandNew, color: "Rojo", sizes: { "5XL": 2 } }], ["5XL"]);
    const warnings = set.issues.filter((candidate) => candidate.code === "NEW_SIZE");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].count).toBe(1);
  });

  it("POSSIBLE_DUPLICATE detecta coincidencias con el catálogo y dentro del archivo", () => {
    const existing = run([{ type: "bata", manufacturer: "fab a", brand: "marca a", gender: "Dama", color: "blanca", price: 10 }]);
    expect(issue(existing, "POSSIBLE_DUPLICATE")?.message).toContain("ID 1");
    const inFile = run([{ ...brandNew }, { ...brandNew }]);
    expect(issue(inFile, "POSSIBLE_DUPLICATE")?.message).toContain("la fila 2");
    expect(issue(inFile, "POSSIBLE_DUPLICATE")?.rows).toEqual(["3"]);
  });

  it("PUBLISHED_WITHOUT_IMAGES y PUBLISHED_WITHOUT_STOCK solo aplican a lo que cambia", () => {
    const created = run([{ ...brandNew, isPublished: "Sí" }]);
    expect(codes(created)).toEqual(expect.arrayContaining(["PUBLISHED_WITHOUT_IMAGES", "PUBLISHED_WITHOUT_STOCK"]));
    // El producto 2 ya estaba publicado sin fotos: un cambio de precio no repite la advertencia.
    const priceOnly = run([{ id: 2, brand: "Marca B", color: "Azul Marino", price: 99 }]);
    expect(codes(priceOnly)).not.toContain("PUBLISHED_WITHOUT_IMAGES");
    // Al volver a publicarlo sí aparece.
    const republished = run(
      [{ id: 2, brand: "Marca B", color: "Azul Marino", isPublished: "Sí" }],
      [],
      { snapshot: createSnapshot([makeProduct({ legacyId: 2, brand: "Marca B", color: "Azul Marino", isPublished: false, imageCount: 0, variants: [{ id: "x", sizeLabel: "M", quantity: 2 }] })]) },
    );
    expect(codes(republished)).toContain("PUBLISHED_WITHOUT_IMAGES");
  });

  it("BECOMES_AVAILABLE y BECOMES_UNAVAILABLE", () => {
    const available = run([{ id: 3, brand: "Marca C", isPublished: "Sí" }]);
    expect(codes(available)).toContain("BECOMES_AVAILABLE");
    const unavailable = run([{ id: 1, sizes: { S: 0, M: 0 } }], ["S", "M"]);
    expect(codes(unavailable)).toContain("BECOMES_UNAVAILABLE");
  });

  it("MODIFIED_AFTER_DOWNLOAD requiere fecha de generación, cambios y un updated_at posterior", () => {
    const before = new Date(UPDATED_AT.getTime() - 1000);
    const after = new Date(UPDATED_AT.getTime() + 1000);
    expect(codes(run([{ id: 1, price: 70 }], [], { generatedAt: before }))).toContain("MODIFIED_AFTER_DOWNLOAD");
    expect(codes(run([{ id: 1, price: 70 }], [], { generatedAt: after }))).not.toContain("MODIFIED_AFTER_DOWNLOAD");
    expect(codes(run([{ id: 1, price: 70 }], [], { generatedAt: null }))).not.toContain("MODIFIED_AFTER_DOWNLOAD");
    expect(codes(run([{ id: 1 }], [], { generatedAt: before }))).not.toContain("MODIFIED_AFTER_DOWNLOAD");
  });

  it("las advertencias no impiden confirmar ni alteran el estado", () => {
    const set = run([{ id: 3, brand: "Marca C", isPublished: "Sí" }]);
    expect(set.issues.some((candidate) => candidate.severity === "warning")).toBe(true);
    expect(set.status).toBe("ready");
    expect(set.updates[0].warnings).toContain("BECOMES_AVAILABLE");
  });
});

describe("catálogo de errores", () => {
  it("un único libro produce cada código de error de fila con su columna (SC-004)", async () => {
    const header = [...FIXED_HEADER, "Talla S", "Talla M"];
    const fresh = (overrides: Record<number, RawCell> = {}): RawCell[] => {
      const row: RawCell[] = [null, "Pijama", "Fab A", "Marca Z", "Dama", 10, null, "Azul", "Sí", "Sí", null, null];
      for (const [index, value] of Object.entries(overrides)) row[Number(index)] = value;
      return row;
    };
    const existing = (id: number, brand: string, overrides: Record<number, RawCell> = {}): RawCell[] =>
      fresh({ 0: id, 1: "Bata", 3: brand, 4: "Dama", 5: 50, 7: "Blanca", ...overrides });
    const rows: RawCell[][] = [
      fresh({ 0: "abc" }), // 2 INVALID_ID
      existing(99, "Marca A"), // 3 UNKNOWN_ID
      existing(1, "Marca A", { 10: 5, 11: 5 }), // 4 DUPLICATE_ID
      existing(1, "Marca A", { 10: 5, 11: 5 }), // 5 DUPLICATE_ID
      fresh({ 3: null }), // 6 REQUIRED
      fresh({ 1: "x".repeat(161) }), // 7 TOO_LONG
      fresh({ 2: new Date("2026-01-01") }), // 8 INVALID_TYPE
      fresh({ 4: "mujer" }), // 9 INVALID_GENDER
      fresh({ 5: "$5" }), // 10 INVALID_PRICE
      fresh({ 5: 1.234 }), // 11 PRICE_DECIMALS
      fresh({ 5: 1e9 }), // 12 PRICE_TOO_HIGH
      fresh({ 8: "quizá" }), // 13 INVALID_YES_NO
      fresh({ 10: -1 }), // 14 INVALID_QUANTITY
      existing(2, "Marca B", { 7: "Azul Marino", 11: null }), // 15 EXISTING_SIZE_BLANK
      existing(6, "Marca F", { 11: 3 }), // 16 AMBIGUOUS_SIZES
      existing(3, "Marca C", { 6: "BAT-001", 10: 1 }), // 17 SKU_IN_USE
      fresh({ 6: "DUP-1" }), // 18 SKU_REPEATED
      fresh({ 6: "DUP-1", 7: "Rojo" }), // 19 SKU_REPEATED
    ];
    const bytes = await buildInventoryBuffer({ header, rows });
    const read = await readInventoryWorkbook({ fileName: "errores.xlsx", bytes });
    expect(read.issues.filter((candidate) => candidate.severity === "error")).toEqual([]);
    const parsed = read.rows.map((row) => parseInventoryRow(row.cells, read.columns, row.excelRow));
    const set = buildChangeSet({ rows: parsed, workbook: { generatedAt: read.workbook.generatedAt, columns: read.columns }, snapshot: makeSnapshot() });

    const expected: Record<string, string> = {
      INVALID_ID: "ID", UNKNOWN_ID: "ID", DUPLICATE_ID: "ID", REQUIRED: "Marca", TOO_LONG: "Tipo", INVALID_TYPE: "Fabricante",
      INVALID_GENDER: "Género", INVALID_PRICE: "Precio", PRICE_DECIMALS: "Precio", PRICE_TOO_HIGH: "Precio", INVALID_YES_NO: "Publicado",
      INVALID_QUANTITY: "Talla S", EXISTING_SIZE_BLANK: "Talla M", AMBIGUOUS_SIZES: "Talla M", SKU_IN_USE: "SKU", SKU_REPEATED: "SKU",
    };
    expect(set.status).toBe("invalid");
    for (const [code, column] of Object.entries(expected)) {
      const found = set.issues.find((candidate) => candidate.code === code);
      expect(found, code).toBeDefined();
      expect(found!.rows.length, code).toBeGreaterThan(0);
      expect(found!.column, code).toBe(column);
    }
  });
});
