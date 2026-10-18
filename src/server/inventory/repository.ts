import { inArray, isNull, sql, count } from "drizzle-orm";
import { productImages, productVariants, products } from "../../db/schema";
import { ensureProductLegacyIdSequence } from "../catalog/admin-products";
import { withBulkLock, chunk as bulkChunk, pgErrorCode as bulkPgErrorCode, BULK_LOCK_KEYS } from "../bulk/transaction";
import type { DbOrTransaction, Transaction } from "../db";
import { createSnapshot, type CatalogSnapshot, type CreateWrite, type SnapshotProduct, type UpdateWrite } from "./changes";

/** Clave fija del bloqueo consultivo que serializa las cargas masivas. */
export const INVENTORY_LOCK_KEY = BULK_LOCK_KEYS.inventory;
export const WRITE_BATCH_SIZE = 1_000;

export async function loadCatalogSnapshot(source: DbOrTransaction): Promise<CatalogSnapshot> {
  const [productRows, variantRows, imageRows] = await Promise.all([
    source.select().from(products),
    source.select().from(productVariants),
    source
      .select({ productId: productImages.productId, total: count() })
      .from(productImages)
      .where(isNull(productImages.deletedAt))
      .groupBy(productImages.productId),
  ]);

  const variantsByProduct = new Map<string, SnapshotProduct["variants"]>();
  for (const variant of variantRows) {
    const list = variantsByProduct.get(variant.productId) ?? [];
    list.push({ id: variant.id, sizeLabel: variant.sizeLabel, quantity: variant.quantity });
    variantsByProduct.set(variant.productId, list);
  }
  const imagesByProduct = new Map(imageRows.map((row) => [row.productId, Number(row.total)]));

  return createSnapshot(
    productRows.map((row) => ({
      id: row.id,
      legacyId: row.legacyId,
      legacyDocumentId: row.legacyDocumentId,
      type: row.legacyTypeLabel,
      manufacturer: row.manufacturer,
      brand: row.brand,
      gender: row.gender,
      price: Number(row.price).toFixed(2),
      sku: row.sku,
      color: row.color,
      isPublished: row.isPublished,
      isActive: row.isActive,
      updatedAt: row.updatedAt,
      imageCount: imagesByProduct.get(row.id) ?? 0,
      variants: variantsByProduct.get(row.id) ?? [],
    })),
  );
}

/**
 * Ejecuta `callback` dentro de una transacción con el bloqueo de cargas masivas tomado,
 * los productos referenciados bloqueados y la instantánea del catálogo ya cargada.
 */
export async function withInventoryLock<T>(
  options: { referencedLegacyIds: number[]; lockTimeoutMs?: number },
  callback: (transaction: Transaction, snapshot: CatalogSnapshot) => Promise<T>,
): Promise<T> {
  return withBulkLock({ lockKey: INVENTORY_LOCK_KEY, lockTimeoutMs: options.lockTimeoutMs }, async (transaction) => {
    if (options.referencedLegacyIds.length) {
      const locked = await transaction
        .select({ id: products.id })
        .from(products)
        .where(inArray(products.legacyId, options.referencedLegacyIds))
        .for("update");
      if (locked.length) {
        await transaction
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(inArray(productVariants.productId, locked.map((row) => row.id)))
          .for("update");
      }
    }
    const snapshot = await loadCatalogSnapshot(transaction);
    return callback(transaction, snapshot);
  });
}

const chunk = bulkChunk;

async function upsertVariants(
  transaction: Transaction,
  variants: Array<{ productId: string; sizeLabel: string; quantity: number }>,
  now: Date,
) {
  for (const batch of chunk(variants)) {
    await transaction
      .insert(productVariants)
      .values(batch.map((variant) => ({ ...variant, legacyId: null, createdAt: now, updatedAt: now })))
      .onConflictDoUpdate({
        target: [productVariants.productId, productVariants.sizeLabel],
        set: { quantity: sql`excluded.quantity`, updatedAt: sql`excluded.updated_at` },
      });
  }
}

/** Actualiza productos existentes y sus variantes. Nunca elimina filas ni toca categoría, origen o imágenes. */
export async function applyProductUpdates(transaction: Transaction, updates: UpdateWrite[], now: Date) {
  if (!updates.length) return;

  // Los SKU que cambian pasan antes por NULL para permitir intercambios entre filas.
  const skuChanging = updates.filter((update) => update.skuChanged).map((update) => update.productId);
  for (const batch of chunk(skuChanging)) {
    await transaction.update(products).set({ sku: null }).where(inArray(products.id, batch));
  }

  const timestamp = now.toISOString();
  for (const batch of chunk(updates)) {
    const rows = sql.join(
      batch.map(
        ({ productId, values }) =>
          sql`(${productId}::uuid, ${values.type}::text, ${values.manufacturer}::text, ${values.brand}::text, ${values.gender}::text, ${values.price}::numeric, ${values.sku}::text, ${values.color}::text, ${values.isPublished}::boolean, ${values.isActive}::boolean)`,
      ),
      sql`, `,
    );
    await transaction.execute(sql`
      UPDATE products AS p SET
        legacy_type_label = v.legacy_type_label,
        manufacturer = v.manufacturer,
        brand = v.brand,
        gender = v.gender::gender,
        price = v.price,
        sku = v.sku,
        color = v.color,
        is_published = v.is_published,
        is_active = v.is_active,
        updated_at = ${timestamp}::timestamptz
      FROM (VALUES ${rows}) AS v(id, legacy_type_label, manufacturer, brand, gender, price, sku, color, is_published, is_active)
      WHERE p.id = v.id
    `);
  }

  await upsertVariants(
    transaction,
    updates.flatMap((update) => update.variants.map((variant) => ({ productId: update.productId, ...variant }))),
    now,
  );
}

export interface InsertedProduct {
  id: string;
  legacyId: number;
  documentId: string;
  label: string;
  excelRow: number;
}

/** Inserta productos nuevos con sus variantes, conservando el orden de las filas. */
export async function insertNewProducts(
  transaction: Transaction,
  creates: CreateWrite[],
  now: Date,
): Promise<InsertedProduct[]> {
  if (!creates.length) return [];
  await ensureProductLegacyIdSequence(transaction);

  const inserted: InsertedProduct[] = [];
  const variants: Array<{ productId: string; sizeLabel: string; quantity: number }> = [];
  for (const batch of chunk(creates)) {
    const documentIds = batch.map(() => crypto.randomUUID());
    const returned = await transaction
      .insert(products)
      .values(
        batch.map(({ values }, index) => ({
          legacyDocumentId: documentIds[index],
          legacyTypeLabel: values.type,
          manufacturer: values.manufacturer,
          brand: values.brand,
          gender: values.gender,
          price: values.price,
          sku: values.sku,
          color: values.color,
          isPublished: values.isPublished,
          isActive: values.isActive,
          categoryId: null,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .returning({ id: products.id, legacyId: products.legacyId, documentId: products.legacyDocumentId });
    const byDocument = new Map(returned.map((row) => [row.documentId, row]));
    batch.forEach((create, index) => {
      const row = byDocument.get(documentIds[index]);
      if (!row) throw new Error("No se pudo leer un producto insertado.");
      inserted.push({ id: row.id, legacyId: row.legacyId, documentId: row.documentId, label: create.label, excelRow: create.excelRow });
      for (const variant of create.variants) variants.push({ productId: row.id, ...variant });
    });
  }
  await upsertVariants(transaction, variants, now);
  return inserted;
}

export const pgErrorCode = bulkPgErrorCode;
