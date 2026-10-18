import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../../../src/db/client";
import { productImages, productVariants, products } from "../../../src/db/schema";

export function hasTestDatabase() {
  return Boolean(process.env.TEST_DATABASE_URL);
}

function assertSafeDatabase(url: string) {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    throw new Error(`TEST_DATABASE_URL debe apuntar a una base cuyo nombre termine en _test (recibido: ${name}).`);
  }
}

export async function setupTestDatabase() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL no está configurada.");
  assertSafeDatabase(url);
  process.env.DATABASE_URL = url;
  await migrate(getDb(), { migrationsFolder: "drizzle" });
}

export async function resetCatalog() {
  assertSafeDatabase(process.env.TEST_DATABASE_URL ?? "");
  await getDb().execute(sql`TRUNCATE product_images, product_variants, products RESTART IDENTITY CASCADE`);
}

export interface SeedProductInput {
  legacyId?: number;
  type?: string;
  manufacturer?: string;
  brand?: string;
  gender?: "Dama" | "Caballero" | "Unisex";
  price?: string;
  sku?: string | null;
  color?: string;
  isPublished?: boolean;
  isActive?: boolean;
  categoryId?: string | null;
  variants?: Array<{ sizeLabel: string; quantity: number }>;
  images?: number;
  deletedImages?: number;
  updatedAt?: Date;
}

let seedCounter = 0;

export async function seedProduct(input: SeedProductInput = {}) {
  const db = getDb();
  seedCounter += 1;
  const [product] = await db
    .insert(products)
    .values({
      ...(input.legacyId ? { legacyId: input.legacyId } : {}),
      legacyDocumentId: crypto.randomUUID(),
      legacyTypeLabel: input.type ?? "Bata",
      manufacturer: input.manufacturer ?? "Fab A",
      brand: input.brand ?? "Marca A",
      gender: input.gender ?? "Dama",
      price: input.price ?? "50.00",
      sku: input.sku ?? null,
      color: input.color ?? "Blanca",
      isPublished: input.isPublished ?? true,
      isActive: input.isActive ?? true,
      categoryId: input.categoryId ?? null,
      ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
    })
    .returning();
  if (input.variants?.length) {
    await db.insert(productVariants).values(input.variants.map((variant) => ({ productId: product.id, ...variant })));
  }
  const imageRows = [
    ...Array.from({ length: input.images ?? 0 }, (_, position) => ({ position, deleted: false })),
    ...Array.from({ length: input.deletedImages ?? 0 }, (_, position) => ({ position: 100 + position, deleted: true })),
  ];
  if (imageRows.length) {
    await db.insert(productImages).values(
      imageRows.map((image) => ({
        productId: product.id,
        legacyUrl: `legacy-${seedCounter}-${image.position}`,
        storagePathname: `test/${seedCounter}-${image.position}.jpg`,
        storageUrl: `https://example.test/${seedCounter}-${image.position}.jpg`,
        mimeType: "image/jpeg",
        byteSize: 1,
        position: image.position,
        deletedAt: image.deleted ? new Date() : null,
      })),
    );
  }
  return product;
}

export async function teardownTestDatabase() {
  await closeDb();
}
