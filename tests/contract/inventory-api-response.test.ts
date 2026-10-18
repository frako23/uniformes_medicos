import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildChangeSet, createSnapshot, type InventoryChangeSet } from "../../src/server/inventory/changes";
import { parseInventoryRow } from "../../src/server/inventory/rows";
import { toApplyResponse, toPreviewResponse } from "../../src/server/inventory/response";
import { readInventoryWorkbook } from "../../src/server/inventory/workbook-reader";
import { FIXED_COLUMNS } from "../../src/server/inventory/workbook-format";
import { buildInventoryBuffer } from "../fixtures/inventory/workbook-builder";
import { makeProduct, makeSnapshot, parseRows } from "../unit/inventory-fixtures";

const fieldSchema = z.object({
  field: z.enum(["type", "manufacturer", "brand", "gender", "price", "sku", "color", "isPublished", "isActive"]),
  label: z.string(),
  from: z.string().nullable(),
  to: z.string().nullable(),
});

const previewSchema = z.object({
  status: z.enum(["ready", "invalid", "no_changes"]),
  file: z.object({ name: z.string(), kind: z.enum(["plantilla", "inventario", "desconocido"]), generatedAt: z.string().nullable(), productRows: z.number() }),
  summary: z.object({
    newProducts: z.number(), updatedProducts: z.number(), unchangedProducts: z.number(), newSizes: z.number(),
    changedStocks: z.number(), errors: z.number(), warnings: z.number(),
  }),
  issues: z.array(z.object({
    severity: z.enum(["error", "warning", "notice"]), code: z.string(), column: z.string().nullable(),
    message: z.string(), rows: z.array(z.string()), count: z.number(),
  })),
  changes: z.array(z.object({
    row: z.number(), action: z.enum(["create", "update"]), id: z.number().nullable(), label: z.string(),
    fields: z.array(fieldSchema),
    sizes: z.array(z.object({ label: z.string(), from: z.number().nullable(), to: z.number() })),
    availability: z.object({ from: z.boolean().nullable(), to: z.boolean() }),
    warnings: z.array(z.string()),
  })),
  preview: z.object({ token: z.string(), expiresAt: z.string() }).nullable(),
});

const productSchema = z.object({ id: z.number(), documentId: z.string(), label: z.string(), editUrl: z.string() });
const applySchema = z.object({
  status: z.literal("applied"),
  appliedAt: z.string(),
  summary: z.object({ createdProducts: z.number(), updatedProducts: z.number(), createdSizes: z.number(), changedStocks: z.number() }),
  created: z.array(productSchema),
  updated: z.array(productSchema),
});

const workbook = { sha256: "x", kind: "inventario" as const, generatedAt: new Date("2026-10-17T00:00:00Z"), formatVersion: 1, ignoredColumns: [] };

function changeSet(rowsInput: Parameters<typeof parseRows>[0], sizeLabels: string[] = []): InventoryChangeSet {
  const { rows, columns } = parseRows(rowsInput, sizeLabels);
  return buildChangeSet({ rows, workbook: { generatedAt: workbook.generatedAt, columns }, snapshot: makeSnapshot() });
}
const token = { token: "abc.def", expiresAt: 1_800_000_000_000 };

describe("PreviewResponse", () => {
  it("con estado ready incluye el token y los valores listos para mostrar", () => {
    const set = changeSet([{ id: 1, price: 55, isActive: "No", sizes: { S: 9, M: 5 } }, { id: 2, brand: "Marca B", color: "Azul Marino", sizes: { M: 2 } }], ["S", "M"]);
    const response = toPreviewResponse({ fileName: "a.xlsx", workbook, productRows: 2, changeSet: set, token });
    const parsed = previewSchema.parse(response);
    expect(parsed.status).toBe("ready");
    expect(parsed.preview).toEqual({ token: "abc.def", expiresAt: new Date(token.expiresAt).toISOString() });
    expect(parsed.changes).toHaveLength(1);
    expect(parsed.changes[0].fields).toEqual(expect.arrayContaining([
      { field: "price", label: "Precio", from: "50.00", to: "55.00" },
      { field: "isActive", label: "Activo", from: "Sí", to: "No" },
    ]));
    expect(parsed.summary).toMatchObject({ updatedProducts: 1, unchangedProducts: 1 });
    expect(parsed.issues.every((issue) => issue.rows.every((range) => typeof range === "string"))).toBe(true);
  });

  it("con invalid o no_changes no emite vista previa", () => {
    const invalid = toPreviewResponse({ fileName: "a.xlsx", workbook, productRows: 1, changeSet: changeSet([{ id: 99 }]), token });
    expect(previewSchema.parse(invalid)).toMatchObject({ status: "invalid", preview: null, changes: [] });
    expect(invalid.summary.errors).toBe(1);
    const same = toPreviewResponse({ fileName: "a.xlsx", workbook, productRows: 1, changeSet: changeSet([{ id: 1 }]), token });
    expect(previewSchema.parse(same)).toMatchObject({ status: "no_changes", preview: null });
  });
});

describe("ApplyResponse", () => {
  it("incluye los productos actualizados con su enlace de edición", () => {
    const set = changeSet([{ id: 1, price: 55 }]);
    const response = toApplyResponse({
      appliedAt: new Date("2026-10-17T10:00:00Z"),
      counts: set.counts,
      created: [{ id: 200, documentId: "nuevo-doc", label: "Pijama" }],
      updated: set.writes.updates.map((update) => ({ id: update.legacyId, documentId: update.documentId, label: update.label })),
    });
    const parsed = applySchema.parse(response);
    expect(parsed.updated[0].editUrl).toBe("/admin/productos/doc-1");
    expect(parsed.created[0].editUrl).toBe("/admin/productos/nuevo-doc");
    expect(parsed.summary).toMatchObject({ updatedProducts: 1, createdProducts: 0 });
  });
});

describe("tamaño y rendimiento", () => {
  const header = [...FIXED_COLUMNS.map((column) => column.header), "Talla S", "Talla M"];

  it("la vista previa de 5.000 productos ocupa menos de 4 MB", async () => {
    const products = Array.from({ length: 5000 }, (_, index) =>
      makeProduct({ legacyId: index + 1, brand: `Marca ${index}`, variants: [{ id: `s${index}`, sizeLabel: "S", quantity: 1 }, { id: `m${index}`, sizeLabel: "M", quantity: 1 }] }),
    );
    const snapshot = createSnapshot(products);
    const rows = products.map((product) => [product.legacyId, "Bata", "Fab A", product.brand, "Dama", 55, null, "Blanca", "Sí", "Sí", 4, 4]);
    const read = await readInventoryWorkbook({ fileName: "a.xlsx", bytes: await buildInventoryBuffer({ header, rows }) });
    const parsed = read.rows.map((row) => parseInventoryRow(row.cells, read.columns, row.excelRow));
    const set = buildChangeSet({ rows: parsed, workbook: { generatedAt: read.workbook.generatedAt, columns: read.columns }, snapshot });
    expect(set.counts.updatedProducts).toBe(5000);
    const response = toPreviewResponse({ fileName: "a.xlsx", workbook: read.workbook, productRows: read.rows.length, changeSet: set, token });
    expect(Buffer.byteLength(JSON.stringify(response))).toBeLessThan(4 * 1024 * 1024);
  }, 60_000);

  it("leer 1.000 productos y calcular los cambios tarda menos de 10 s", async () => {
    const products = Array.from({ length: 1000 }, (_, index) => makeProduct({ legacyId: index + 1, brand: `Marca ${index}`, variants: [{ id: `s${index}`, sizeLabel: "S", quantity: 1 }] }));
    const rows = products.map((product) => [product.legacyId, "Bata", "Fab A", product.brand, "Dama", 60, null, "Blanca", "Sí", "Sí", 2, null]);
    const started = performance.now();
    const read = await readInventoryWorkbook({ fileName: "a.xlsx", bytes: await buildInventoryBuffer({ header, rows }) });
    const parsed = read.rows.map((row) => parseInventoryRow(row.cells, read.columns, row.excelRow));
    buildChangeSet({ rows: parsed, workbook: { generatedAt: null, columns: read.columns }, snapshot: createSnapshot(products) });
    expect(performance.now() - started).toBeLessThan(10_000);
  }, 60_000);
});
