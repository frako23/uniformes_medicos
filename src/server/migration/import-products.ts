import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { categories, productImages, productVariants, products } from "../../db/schema";
import { withTransaction } from "../db";
import { importSourceImage } from "./media-import";
import type { SourceProduct } from "./normalize-strapi";
import type { createStrapiClient } from "./strapi-client";

function categorySlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "sin-categoria";
}

function uniqueSourceValues(product: SourceProduct) {
  const variantLabels = new Set<string>();
  for (const variant of product.variants) {
    if (variantLabels.has(variant.sizeLabel)) {
      throw new Error(`La fuente contiene tallas duplicadas para el producto ${product.legacyId}.`);
    }
    variantLabels.add(variant.sizeLabel);
  }
  const imageUrls = new Set<string>();
  for (const image of product.images) {
    if (imageUrls.has(image.url)) {
      throw new Error(`La fuente contiene URLs de imagen duplicadas para el producto ${product.legacyId}.`);
    }
    imageUrls.add(image.url);
  }
}

export async function importProduct(
  client: ReturnType<typeof createStrapiClient>,
  source: SourceProduct,
) {
  uniqueSourceValues(source);

  return withTransaction(async (transaction) => {
    const [category] = await transaction
      .select()
      .from(categories)
      .where(eq(categories.name, source.typeLabel))
      .limit(1);
    const categoryRecord = category ?? (await transaction.insert(categories).values({
      name: source.typeLabel,
      slug: categorySlug(source.typeLabel),
      isActive: true,
    }).onConflictDoNothing({ target: categories.name }).returning())[0];
    const resolvedCategory = categoryRecord ?? (await transaction.select().from(categories)
      .where(eq(categories.name, source.typeLabel)).limit(1))[0];

    let product = (await transaction.select().from(products)
      .where(eq(products.legacyId, source.legacyId)).limit(1))[0];
    if (!product) {
      product = (await transaction.select().from(products)
        .where(eq(products.legacyDocumentId, source.legacyDocumentId)).limit(1))[0];
    }

    const productValues = {
      legacyId: source.legacyId,
      legacyDocumentId: source.legacyDocumentId,
      categoryId: resolvedCategory?.id ?? null,
      legacyTypeLabel: source.typeLabel,
      manufacturer: source.manufacturer,
      brand: source.brand,
      gender: source.gender,
      price: source.price.toFixed(2),
      sku: source.sku,
      color: source.color,
      isPublished: source.isPublished,
      isActive: true,
      sourceCreatedAt: source.sourceCreatedAt,
      sourceUpdatedAt: source.sourceUpdatedAt,
      sourcePublishedAt: source.sourcePublishedAt,
      updatedAt: new Date(),
    };

    if (product) {
      [product] = await transaction.update(products)
        .set(productValues)
        .where(eq(products.id, product.id))
        .returning();
    } else {
      [product] = await transaction.insert(products).values(productValues).returning();
    }

    await transaction.delete(productVariants).where(eq(productVariants.productId, product.id));
    if (source.variants.length) {
      await transaction.insert(productVariants).values(source.variants.map((variant) => ({
        productId: product.id,
        legacyId: variant.id ?? null,
        sizeLabel: variant.sizeLabel,
        quantity: variant.quantity,
      })));
    }

    const existingImages = await transaction.select().from(productImages)
      .where(eq(productImages.productId, product.id))
      .orderBy(asc(productImages.position));
    if (existingImages.length) {
      await transaction.update(productImages)
        .set({ position: sql`${productImages.position} + 100000`, updatedAt: new Date() })
        .where(eq(productImages.productId, product.id));
    }

    let importedImages = 0;
    for (const sourceImage of source.images) {
      const legacyUrl = client.absoluteUrl(sourceImage.url);
      const existing = existingImages.find((image) =>
        image.legacyUrl === legacyUrl || (sourceImage.id !== undefined && image.legacyId === sourceImage.id));
      let stored = existing;
      if (!stored || !stored.checksum) {
        const copied = await importSourceImage(client, String(source.legacyDocumentId), {
          ...sourceImage,
          url: legacyUrl,
        });
        if (stored) {
          [stored] = await transaction.update(productImages).set({
            legacyId: copied.legacyId ?? null,
            legacyUrl: copied.legacyUrl,
            storagePathname: copied.pathname,
            storageUrl: copied.url,
            checksum: copied.checksum,
            mimeType: copied.mimeType,
            byteSize: copied.byteSize,
            width: copied.width ?? null,
            height: copied.height ?? null,
            altText: copied.altText ?? null,
            caption: copied.caption ?? null,
            position: sourceImage.position,
            deletedAt: null,
            updatedAt: new Date(),
          }).where(eq(productImages.id, stored.id)).returning();
        } else {
          [stored] = await transaction.insert(productImages).values({
            productId: product.id,
            legacyId: copied.legacyId ?? null,
            legacyUrl: copied.legacyUrl,
            storagePathname: copied.pathname,
            storageUrl: copied.url,
            checksum: copied.checksum,
            mimeType: copied.mimeType,
            byteSize: copied.byteSize,
            width: copied.width ?? null,
            height: copied.height ?? null,
            altText: copied.altText ?? null,
            caption: copied.caption ?? null,
            position: sourceImage.position,
          }).returning();
        }
        importedImages += 1;
      } else {
        [stored] = await transaction.update(productImages).set({
          legacyUrl,
          legacyId: sourceImage.id ?? stored.legacyId,
          width: sourceImage.width ?? stored.width,
          height: sourceImage.height ?? stored.height,
          altText: sourceImage.alternativeText ?? stored.altText,
          caption: sourceImage.caption ?? stored.caption,
          position: sourceImage.position,
          deletedAt: null,
          updatedAt: new Date(),
        }).where(eq(productImages.id, stored.id)).returning();
      }
    }

    await transaction.update(productImages).set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(productImages.productId, product.id), isNull(productImages.deletedAt)));
    for (const sourceImage of source.images) {
      await transaction.update(productImages).set({ deletedAt: null, updatedAt: new Date() })
        .where(and(eq(productImages.productId, product.id), eq(productImages.legacyUrl, client.absoluteUrl(sourceImage.url))));
    }

    return { product, importedImages, sourceImageCount: source.images.length };
  });
}
