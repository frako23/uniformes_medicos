import { and, eq, inArray } from "drizzle-orm";
import { products } from "../../db/schema";
import { db } from "../db";
import { toProducto, type ProductWithRelations } from "./mapper";

function isAvailable(product: ProductWithRelations) {
  return product.isPublished && product.isActive && product.variants.some((variant) => variant.quantity > 0);
}

export async function listPublicProducts() {
  const rows = await db().query.products.findMany({
    where: and(eq(products.isPublished, true), eq(products.isActive, true)),
    with: { variants: true, images: true },
  });
  return rows
    .map((row) => row as ProductWithRelations)
    .filter(isAvailable)
    .map(toProducto);
}

export async function getPublicProduct(publicId: string) {
  const row = await db().query.products.findFirst({
    where: and(eq(products.legacyDocumentId, publicId), eq(products.isPublished, true), eq(products.isActive, true)),
    with: { variants: true, images: true },
  });
  if (!row) return null;
  const product = row as ProductWithRelations;
  return isAvailable(product) ? toProducto(product) : { product: toProducto(product), available: false };
}

export async function getPublicProductsByLegacyIds(ids: number[]) {
  if (!ids.length) return { data: [], missingIds: [] };
  const rows = await db().query.products.findMany({
    where: inArray(products.legacyId, ids),
    with: { variants: true, images: true },
  });
  const byId = new Map(rows.map((row) => [row.legacyId, row as ProductWithRelations]));
  const data = ids.flatMap((id) => {
    const row = byId.get(id);
    return row && isAvailable(row) ? [toProducto(row)] : [];
  });
  const missingIds = ids.filter((id) => !byId.has(id) || !isAvailable(byId.get(id)!));
  return { data, missingIds };
}
