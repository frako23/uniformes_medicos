import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../../src/db/client";
import { productImages, productVariants, products } from "../../src/db/schema";
import { SYNC_LEGACY_ID_SEQUENCE_SQL, createProduct, updateProduct } from "../../src/server/catalog/admin-products";
import { updateVariantQuantity } from "../../src/server/catalog/admin-variants";
import { HttpError } from "../../src/server/http/errors";
import * as repository from "../../src/server/inventory/repository";
import { INVENTORY_LOCK_KEY } from "../../src/server/inventory/repository";
import { applyInventoryFile, buildInventoryExport, buildInventoryTemplate, previewInventoryFile } from "../../src/server/inventory/service";
import { reworkWorkbook, type RawCell } from "../fixtures/inventory/workbook-builder";
import { hasTestDatabase, resetCatalog, seedProduct, setupTestDatabase, teardownTestDatabase } from "./helpers/test-database";

const SESSION = "token-de-sesion-de-prueba";

async function expectConflict(promise: Promise<unknown>, message?: string) {
  const error = await promise.then(() => null, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(HttpError);
  expect((error as HttpError).status).toBe(409);
  if (message) expect((error as HttpError).message).toContain(message);
}

const columnOf = (header: RawCell[], name: string) => {
  const index = header.indexOf(name);
  if (index < 0) throw new Error(`No existe la columna ${name}`);
  return index;
};

async function snapshotDb() {
  const db = getDb();
  const [productRows, variantRows] = await Promise.all([db.select().from(products), db.select().from(productVariants)]);
  return { products: productRows, variants: variantRows };
}

async function previewAndApply(bytes: Uint8Array, fileName = "inventario.xlsx") {
  const preview = await previewInventoryFile({ fileName, bytes, sessionToken: SESSION });
  expect(preview.status).toBe("ready");
  return applyInventoryFile({ fileName, bytes, previewToken: preview.preview!.token, sessionToken: SESSION });
}

describe.skipIf(!hasTestDatabase())("carga masiva con PostgreSQL", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });
  beforeEach(async () => {
    await resetCatalog();
  });
  afterAll(async () => {
    await teardownTestDatabase();
  });

  describe("ediciones", () => {
    it("aplica cambios de existencias, precio y tallas nuevas sin tocar imágenes ni eliminar filas", async () => {
      const first = await seedProduct({ variants: [{ sizeLabel: "S", quantity: 1 }, { sizeLabel: "M", quantity: 2 }], images: 2, updatedAt: new Date("2026-01-01") });
      const second = await seedProduct({ brand: "Marca B", variants: [{ sizeLabel: "M", quantity: 4 }] });
      const untouched = await seedProduct({ brand: "Marca C", variants: [{ sizeLabel: "M", quantity: 9 }] });
      const before = await snapshotDb();

      const exported = await buildInventoryExport();
      const edited = await reworkWorkbook(exported.bytes, ({ header, rows }) => {
        const price = columnOf(header, "Precio");
        const sizeM = columnOf(header, "Talla M");
        const sizeS = columnOf(header, "Talla S");
        header.push("Talla 4XL");
        for (const row of rows) row.push(null);
        const target = rows.find((row) => row[0] === first.legacyId)!;
        target[price] = 55;
        target[sizeM] = 8;
        target[sizeS] = 0;
        target[header.length - 1] = 3; // talla nueva
        rows.find((row) => row[0] === second.legacyId)![sizeM] = 6;
      });

      const result = await previewAndApply(edited);
      expect(result.summary).toMatchObject({ createdProducts: 0, updatedProducts: 2, createdSizes: 1, changedStocks: 3 });
      expect(result.updated.map((product) => product.id).sort()).toEqual([first.legacyId, second.legacyId].sort());

      const db = getDb();
      const [updatedFirst] = await db.select().from(products).where(eq(products.id, first.id));
      expect(updatedFirst.price).toBe("55.00");
      expect(updatedFirst.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
      expect(updatedFirst.categoryId).toBe(first.categoryId);
      expect(updatedFirst.legacyDocumentId).toBe(first.legacyDocumentId);
      const variants = await db.select().from(productVariants).where(eq(productVariants.productId, first.id));
      expect(Object.fromEntries(variants.map((variant) => [variant.sizeLabel, variant.quantity]))).toEqual({ S: 0, M: 8, "4XL": 3 });
      const [onlyStock] = await db.select().from(products).where(eq(products.id, second.id));
      expect(onlyStock.updatedAt.getTime()).toBeGreaterThan(second.updatedAt.getTime());
      const [notReferenced] = await db.select().from(products).where(eq(products.id, untouched.id));
      expect(notReferenced.updatedAt.getTime()).toBe(untouched.updatedAt.getTime());

      expect(await db.select().from(productImages)).toHaveLength(2);
      const after = await snapshotDb();
      expect(after.products).toHaveLength(before.products.length);
      expect(after.variants.length).toBe(before.variants.length + 1);

      // Reaplicar el mismo archivo no cambia nada (SC-006).
      const again = await previewInventoryFile({ fileName: "inventario.xlsx", bytes: edited, sessionToken: SESSION });
      expect(again.status).toBe("no_changes");
      expect(again.preview).toBeNull();
    });
  });

  describe("altas y secuencia", () => {
    const templateWith = async (rows: RawCell[][]) =>
      reworkWorkbook((await buildInventoryTemplate()).bytes, (sheet) => {
        sheet.rows.push(...rows.map((row) => [...row, ...Array(Math.max(0, sheet.header.length - row.length)).fill(null)]));
      });

    it("crea productos aunque la secuencia de legacy_id esté atrasada", async () => {
      for (let legacyId = 1; legacyId <= 5; legacyId += 1) {
        await seedProduct({ legacyId, brand: `Marca ${legacyId}`, variants: [{ sizeLabel: "M", quantity: 1 }] });
      }
      const bytes = await templateWith([
        [null, "Pijama", "Fab B", "Nueva 1", "Unisex", 45.5, null, "Azul", null, null],
        [null, "Pijama", "Fab B", "Nueva 2", "Dama", "30", "SKU-2", "Rojo", "Sí", "Sí"],
        [null, "Pijama", "Fab B", "Nueva 3", "Caballero", 20, null, "Verde", "No", "No"],
      ]);
      const result = await previewAndApply(bytes, "plantilla.xlsx");
      expect(result.summary.createdProducts).toBe(3);
      expect(result.created).toHaveLength(3);
      expect(result.created.every((product) => product.id > 5)).toBe(true);
      expect(result.created[0].editUrl).toBe(`/admin/productos/${result.created[0].documentId}`);

      const rows = await getDb().select().from(products).where(eq(products.brand, "Nueva 1"));
      expect(rows[0].isPublished).toBe(false);
      expect(rows[0].isActive).toBe(true);
      expect(rows[0].legacyDocumentId).toMatch(/^[0-9a-f-]{36}$/);
      expect(rows[0].categoryId).toBeNull();
    });

    it("crea variantes con legacy_id nulo y solo las tallas con cantidad", async () => {
      const exported = await buildInventoryTemplate();
      const bytes = await reworkWorkbook(exported.bytes, (sheet) => {
        sheet.header.push("Talla 4XL", "Talla S");
        sheet.rows.push([null, "Pijama", "Fab", "Marca", "Dama", 10, null, "Azul", null, null, 2, null]);
      });
      await previewAndApply(bytes, "plantilla.xlsx");
      const variants = await getDb().select().from(productVariants);
      expect(variants).toHaveLength(1);
      expect(variants[0]).toMatchObject({ sizeLabel: "4XL", quantity: 2, legacyId: null });
    });

    it("createProduct también funciona con la secuencia atrasada", async () => {
      await seedProduct({ legacyId: 40 });
      await seedProduct({ legacyId: 41, brand: "Otra" });
      const created = await createProduct({ legacyTypeLabel: "Bata", manufacturer: "F", brand: "Nueva", gender: "Dama", price: 10, color: "Azul", variants: [] });
      expect(created.legacyId).toBeGreaterThan(41);
    });

    it("la migración 0002 sincroniza la secuencia y no la hace retroceder", async () => {
      const db = getDb();
      for (const legacyId of [10, 20, 30]) await seedProduct({ legacyId, brand: `M${legacyId}` });
      const migration = readFileSync("drizzle/0002_sync_product_legacy_id_sequence.sql", "utf8");
      expect(migration).toContain("setval");
      const lastValue = async () => {
        const rows = await db.execute(sql`SELECT last_value FROM pg_sequences WHERE sequencename = 'products_legacy_id_seq'`);
        return Number((rows as unknown as Array<{ last_value: string | number }>)[0].last_value);
      };
      await db.execute(sql.raw(migration));
      expect(await lastValue()).toBeGreaterThanOrEqual(30);
      await db.execute(sql`SELECT setval(pg_get_serial_sequence('products', 'legacy_id'), 500, true)`);
      await db.execute(sql.raw(SYNC_LEGACY_ID_SEQUENCE_SQL));
      expect(await lastValue()).toBe(500);
    });
  });

  describe("atomicidad y concurrencia", () => {
    async function seedAndEdit() {
      const product = await seedProduct({ sku: null, variants: [{ sizeLabel: "M", quantity: 2 }] });
      const exported = await buildInventoryExport();
      const bytes = await reworkWorkbook(exported.bytes, ({ header, rows }) => {
        rows[0][columnOf(header, "Talla M")] = 7;
        rows.push([null, "Pijama", "Fab", "Marca X", "Dama", 10, null, "Azul", "No", "Sí", ...Array(header.length - 10).fill(null)]);
        rows[1][columnOf(header, "Talla M")] = 1;
      });
      return { product, bytes };
    }

    it("un fallo durante la escritura deja el inventario exactamente como estaba (SC-005)", async () => {
      const { bytes } = await seedAndEdit();
      const before = await snapshotDb();
      const preview = await previewInventoryFile({ fileName: "a.xlsx", bytes, sessionToken: SESSION });
      vi.spyOn(repository, "insertNewProducts").mockRejectedValueOnce(new Error("fallo provocado"));
      vi.spyOn(console, "error").mockImplementation(() => {});
      const error = await applyInventoryFile({ fileName: "a.xlsx", bytes, previewToken: preview.preview!.token, sessionToken: SESSION }).catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(500);
      expect((error as HttpError).message).toBe("No se aplicó ningún cambio. Inténtalo de nuevo.");
      expect(await snapshotDb()).toEqual(before);
    });

    it("dos confirmaciones simultáneas con el mismo token: una se aplica y la otra recibe 409", async () => {
      const { bytes } = await seedAndEdit();
      const preview = await previewInventoryFile({ fileName: "a.xlsx", bytes, sessionToken: SESSION });
      const input = { fileName: "a.xlsx", bytes, previewToken: preview.preview!.token, sessionToken: SESSION };
      const results = await Promise.allSettled([applyInventoryFile(input), applyInventoryFile(input)]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
      expect((rejected.reason as HttpError).status).toBe(409);
      expect(await getDb().select().from(products)).toHaveLength(2);
    });

    it("un producto editado entre la vista previa y la confirmación da 409 sin cambios", async () => {
      const { product, bytes } = await seedAndEdit();
      const preview = await previewInventoryFile({ fileName: "a.xlsx", bytes, sessionToken: SESSION });
      await updateProduct(product.legacyDocumentId, {
        legacyTypeLabel: product.legacyTypeLabel, manufacturer: product.manufacturer, brand: "Cambiada", gender: product.gender,
        price: 50, color: product.color, isPublished: true, isActive: true, variants: [{ sizeLabel: "M", quantity: 2 }],
      });
      const before = await snapshotDb();
      await expectConflict(
        applyInventoryFile({ fileName: "a.xlsx", bytes, previewToken: preview.preview!.token, sessionToken: SESSION }),
        "El inventario cambió",
      );
      expect(await snapshotDb()).toEqual(before);
    });

    it("un producto creado entre ambos pasos invalida un archivo que solo tiene altas", async () => {
      const exported = await buildInventoryTemplate();
      const bytes = await reworkWorkbook(exported.bytes, ({ header, rows }) => {
        rows.push([null, "Pijama", "Fab", "Marca", "Dama", 10, null, "Azul", null, null, ...Array(header.length - 10).fill(null)]);
      });
      const preview = await previewInventoryFile({ fileName: "a.xlsx", bytes, sessionToken: SESSION });
      expect(preview.status).toBe("ready");
      await seedProduct({ brand: "Creada aparte" });
      await expectConflict(applyInventoryFile({ fileName: "a.xlsx", bytes, previewToken: preview.preview!.token, sessionToken: SESSION }), "El inventario cambió");
      expect(await getDb().select().from(products)).toHaveLength(1);
    });

    it("un SKU tomado por otro producto entre ambos pasos da 409", async () => {
      const target = await seedProduct({ variants: [{ sizeLabel: "M", quantity: 1 }] });
      const other = await seedProduct({ brand: "Otra marca", variants: [{ sizeLabel: "M", quantity: 1 }] });
      const exported = await buildInventoryExport();
      const bytes = await reworkWorkbook(exported.bytes, ({ header, rows }) => {
        rows.find((row) => row[0] === target.legacyId)![columnOf(header, "SKU")] = "NUEVO-1";
      });
      const preview = await previewInventoryFile({ fileName: "a.xlsx", bytes, sessionToken: SESSION });
      expect(preview.status).toBe("ready");
      await getDb().update(products).set({ sku: "NUEVO-1" }).where(eq(products.id, other.id));
      await expectConflict(applyInventoryFile({ fileName: "a.xlsx", bytes, previewToken: preview.preview!.token, sessionToken: SESSION }), "El inventario cambió");
      const [unchanged] = await getDb().select().from(products).where(eq(products.id, target.id));
      expect(unchanged.sku).toBeNull();
    });

    it("otra carga que retiene el bloqueo produce 409 tras el tiempo de espera", async () => {
      const { bytes } = await seedAndEdit();
      const preview = await previewInventoryFile({ fileName: "a.xlsx", bytes, sessionToken: SESSION });
      const holder = postgres(process.env.TEST_DATABASE_URL!, { max: 1, prepare: false });
      vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await holder.begin(async (transaction) => {
          await transaction`SELECT pg_advisory_xact_lock(${INVENTORY_LOCK_KEY})`;
          await expectConflict(
            applyInventoryFile({ fileName: "a.xlsx", bytes, previewToken: preview.preview!.token, sessionToken: SESSION, lockTimeoutMs: 300 }),
            "Otra carga se está aplicando",
          );
        });
      } finally {
        await holder.end({ timeout: 5 });
      }
    });
  });

  describe("updated_at fiable", () => {
    it("updateVariantQuantity actualiza updated_at del producto y la vista previa lo advierte", async () => {
      const product = await seedProduct({ updatedAt: new Date("2026-01-01"), variants: [{ sizeLabel: "M", quantity: 3 }] });
      const downloadedAt = new Date(Date.now() - 60_000);
      const exported = await buildInventoryExport(downloadedAt);
      const [variant] = await getDb().select().from(productVariants).where(eq(productVariants.productId, product.id));

      await updateVariantQuantity(product.id, variant.id, { quantity: 9 });
      const [after] = await getDb().select().from(products).where(eq(products.id, product.id));
      expect(after.updatedAt.getTime()).toBeGreaterThan(downloadedAt.getTime());

      const edited = await reworkWorkbook(exported.bytes, ({ header, rows }) => {
        rows[0][columnOf(header, "Precio")] = 77;
      });
      const preview = await previewInventoryFile({ fileName: "a.xlsx", bytes: edited, sessionToken: SESSION });
      expect(preview.issues.map((issue) => issue.code)).toContain("MODIFIED_AFTER_DOWNLOAD");
      expect(preview.status).toBe("ready");
    });
  });
});
