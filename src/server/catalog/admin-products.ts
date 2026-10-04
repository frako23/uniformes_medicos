import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { products, productVariants } from "../../db/schema";
import { db, withTransaction, type DbOrTransaction } from "../db";
import { HttpError } from "../http/errors";
import { productInputSchema } from "../validation/catalog";
import { toProducto, type ProductWithRelations } from "./mapper";

export const ADMIN_PRODUCT_PAGE_SIZES = [20, 50, 100] as const;
export type AdminProductPageSize = (typeof ADMIN_PRODUCT_PAGE_SIZES)[number];

export const ADMIN_PRODUCT_SORT_OPTIONS = [
  { value: "updated", label: "Más recientes" },
  { value: "priceAsc", label: "Precio: menor a mayor" },
  { value: "priceDesc", label: "Precio: mayor a menor" },
] as const;
export type AdminProductSort = (typeof ADMIN_PRODUCT_SORT_OPTIONS)[number]["value"];

export function normalizeAdminProductPageSize(value?: number): AdminProductPageSize {
  return ADMIN_PRODUCT_PAGE_SIZES.includes(value as AdminProductPageSize)
    ? (value as AdminProductPageSize)
    : 20;
}

export function normalizeAdminProductSort(value?: string | null): AdminProductSort {
  return ADMIN_PRODUCT_SORT_OPTIONS.some((option) => option.value === value)
    ? (value as AdminProductSort)
    : "updated";
}

export function normalizeAdminProductFilterValues(values: string[]) {
  const uniqueValues = new Map<string, string>();
  for (const rawValue of values) {
    const value = rawValue.trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase("es");
    if (!uniqueValues.has(key)) uniqueValues.set(key, value);
  }
  return [...uniqueValues.values()].sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" }));
}

export interface AdminProductFormOptions {
  types: string[];
  manufacturers: string[];
  brands: string[];
  colors: string[];
  sizes: string[];
}

export async function getAdminProductFormOptions(): Promise<AdminProductFormOptions> {
  const [typeRows, manufacturerRows, brandRows, colorRows, sizeRows] = await Promise.all([
    db().selectDistinct({ value: products.legacyTypeLabel }).from(products),
    db().selectDistinct({ value: products.manufacturer }).from(products),
    db().selectDistinct({ value: products.brand }).from(products),
    db().selectDistinct({ value: products.color }).from(products),
    db().selectDistinct({ value: productVariants.sizeLabel }).from(productVariants),
  ]);

  return {
    types: normalizeAdminProductFilterValues(typeRows.map((row) => row.value)),
    manufacturers: normalizeAdminProductFilterValues(manufacturerRows.map((row) => row.value)),
    brands: normalizeAdminProductFilterValues(brandRows.map((row) => row.value)),
    colors: normalizeAdminProductFilterValues(colorRows.map((row) => row.value)),
    sizes: normalizeAdminProductFilterValues(sizeRows.map((row) => row.value)),
  };
}

export async function getAdminProductFilterOptions() {
  const [productRows, brandRows] = await Promise.all([
    db().selectDistinct({ value: products.legacyTypeLabel }).from(products),
    db().selectDistinct({ value: products.brand }).from(products),
  ]);
  return {
    products: normalizeAdminProductFilterValues(productRows.map((row) => row.value)),
    brands: normalizeAdminProductFilterValues(brandRows.map((row) => row.value)),
  };
}

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
  brand?: string;
  isPublished?: boolean;
  isActive?: boolean;
  gender?: "Dama" | "Caballero" | "Unisex";
  type?: string;
  sort?: AdminProductSort;
}) {
  const page = Number.isInteger(input.page) && (input.page as number) > 0 ? (input.page as number) : 1;
  const pageSize = normalizeAdminProductPageSize(input.pageSize);
  const filters = [];
  if (typeof input.isPublished === "boolean") filters.push(eq(products.isPublished, input.isPublished));
  if (typeof input.isActive === "boolean") filters.push(eq(products.isActive, input.isActive));
  if (input.gender) filters.push(eq(products.gender, input.gender));
  if (input.type?.trim()) filters.push(ilike(products.legacyTypeLabel, `%${input.type.trim()}%`));
  if (input.brand?.trim()) filters.push(ilike(products.brand, `%${input.brand.trim()}%`));
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

  const where = filters.length ? and(...filters) : undefined;
  const [{ count: totalCount }] = await db()
    .select({ count: count() })
    .from(products)
    .where(where);
  const total = Number(totalCount);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const sort = normalizeAdminProductSort(input.sort);
  const orderBy = sort === "priceAsc"
    ? [asc(products.price), asc(products.legacyId)]
    : sort === "priceDesc"
      ? [desc(products.price), asc(products.legacyId)]
      : [desc(products.updatedAt), asc(products.legacyId)];
  const rows = await db().query.products.findMany({
    where,
    orderBy,
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
    with: { variants: true, images: true },
  });
  return {
    data: rows.map((row) => toProducto(row as ProductWithRelations)),
    page: currentPage,
    pageSize,
    sort,
    total,
    totalPages,
    hasPreviousPage: currentPage > 1,
    hasNextPage: currentPage < totalPages,
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
