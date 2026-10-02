import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { products, productVariants } from "../../db/schema";
import { db, withTransaction, type DbOrTransaction } from "../db";
import { HttpError } from "../http/errors";
import { productInputSchema } from "../validation/catalog";
import { toProducto, type ProductWithRelations } from "./mapper";

async function findByPublicId(source: DbOrTransaction, publicId: string) {
  const result = await source.query.products.findFirst({
    where: eq(products.legacyDocumentId, publicId),
    with: { variants: true, images: true },
  });
  return result as ProductWithRelations | undefined;
}

export async function getProductByPublicId(publicId: string) {
  return findByPublicId(db(), publicId);
}

export async function listAdminProducts(input: {
  page?: number;
  pageSize?: number;
  search?: string;
  isPublished?: boolean;
  isActive?: boolean;
  gender?: "Dama" | "Caballero" | "Unisex";
  type?: string;
}) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 25));
  const filters = [];
  if (typeof input.isPublished === "boolean") filters.push(eq(products.isPublished, input.isPublished));
  if (typeof input.isActive === "boolean") filters.push(eq(products.isActive, input.isActive));
  if (input.gender) filters.push(eq(products.gender, input.gender));
  if (input.type?.trim()) filters.push(ilike(products.legacyTypeLabel, `%${input.type.trim()}%`));
  if (input.search?.trim()) {
    const term = `%${input.search.trim()}%`;
    filters.push(
      or(
        ilike(products.legacyTypeLabel, term),
        ilike(products.brand, term),
        ilike(products.manufacturer, term),
        ilike(products.sku, term),
      ),
    );
  }

  const rows = await db().query.products.findMany({
    where: filters.length ? and(...filters) : undefined,
    orderBy: [desc(products.updatedAt), asc(products.legacyId)],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    with: { variants: true, images: true },
  });
  return {
    data: rows.map((row) => toProducto(row as ProductWithRelations)),
    page,
    pageSize,
    hasNextPage: rows.length === pageSize,
  };
}

export async function createProduct(input: unknown) {
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(422, "VALIDATION_ERROR", "Revisa los campos indicados.", fieldErrors(parsed.error));
  const values = parsed.data;
  const publicId = values.legacyDocumentId ?? crypto.randomUUID();

  const created = await withTransaction(async (transaction) => {
    const [product] = await transaction
      .insert(products)
      .values({
        legacyDocumentId: publicId,
        legacyTypeLabel: values.legacyTypeLabel,
        manufacturer: values.manufacturer,
        brand: values.brand,
        gender: values.gender,
        price: values.price.toFixed(2),
        sku: values.sku || null,
        color: values.color,
        isPublished: values.isPublished,
        isActive: values.isActive,
        categoryId: values.categoryId ?? null,
      })
      .returning();
    if (values.variants.length) {
      await transaction.insert(productVariants).values(
        values.variants.map((variant) => ({
          productId: product.id,
          legacyId: variant.legacyId,
          sizeLabel: variant.sizeLabel,
          quantity: variant.quantity,
        })),
      );
    }
    return product;
  });
  const result = await getProductByPublicId(created.legacyDocumentId);
  if (!result) throw new HttpError(500, "DATABASE_ERROR", "No se pudo leer el producto creado.");
  return result;
}

export async function updateProduct(publicId: string, input: unknown) {
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(422, "VALIDATION_ERROR", "Revisa los campos indicados.", fieldErrors(parsed.error));
  const values = parsed.data;
  const updated = await withTransaction(async (transaction) => {
    const existing = await findByPublicId(transaction, publicId);
    if (!existing) throw new HttpError(404, "NOT_FOUND", "Producto no encontrado.");
    const [product] = await transaction
      .update(products)
      .set({
        legacyTypeLabel: values.legacyTypeLabel,
        manufacturer: values.manufacturer,
        brand: values.brand,
        gender: values.gender,
        price: values.price.toFixed(2),
        sku: values.sku || null,
        color: values.color,
        isPublished: values.isPublished,
        isActive: values.isActive,
        categoryId: values.categoryId ?? null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(products.id, existing.id),
        values.expectedUpdatedAt ? eq(products.updatedAt, new Date(values.expectedUpdatedAt)) : undefined,
      ))
      .returning();
    if (!product) throw new HttpError(409, "CONFLICT", "El producto cambió mientras lo editabas. Recarga la página e inténtalo de nuevo.");
    await transaction.delete(productVariants).where(eq(productVariants.productId, existing.id));
    if (values.variants.length) {
      await transaction.insert(productVariants).values(
        values.variants.map((variant) => ({
          productId: existing.id,
          legacyId: variant.legacyId,
          sizeLabel: variant.sizeLabel,
          quantity: variant.quantity,
        })),
      );
    }
    return product;
  });
  const result = await getProductByPublicId(updated.legacyDocumentId);
  if (!result) throw new HttpError(500, "DATABASE_ERROR", "No se pudo leer el producto actualizado.");
  return result;
}

function fieldErrors(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return Object.fromEntries(error.issues.map((issue) => [String(issue.path[0] ?? "form"), issue.message]));
}
