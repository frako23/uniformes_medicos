import { and, asc, eq, isNull } from "drizzle-orm";
import { productImages, products } from "../../db/schema";
import { db, withTransaction } from "../db";
import { HttpError } from "../http/errors";
import { imageMetadataSchema } from "../validation/catalog";
import { removeProductImage, uploadProductImage } from "../storage/blob";

export async function uploadImageForProduct(productKey: string, file: File, metadata: unknown) {
  const product = await db().query.products.findFirst({ where: eq(products.legacyDocumentId, productKey) });
  if (!product) throw new HttpError(404, "NOT_FOUND", "Producto no encontrado.");
  const parsed = imageMetadataSchema.safeParse(metadata);
  if (!parsed.success) throw new HttpError(422, "VALIDATION_ERROR", "Los metadatos de la imagen no son válidos.");
  const blob = await uploadProductImage({ productKey, file });
  const current = await db().query.productImages.findMany({
    where: and(eq(productImages.productId, product.id), isNull(productImages.deletedAt)),
    orderBy: asc(productImages.position),
  });
  const position = parsed.data.position ?? current.length;
  try {
    const [image] = await db()
      .insert(productImages)
      .values({
        productId: product.id,
        legacyUrl: blob.url,
        storagePathname: blob.pathname,
        storageUrl: blob.url,
        checksum: blob.checksum,
        mimeType: blob.mimeType,
        byteSize: blob.byteSize,
        altText: parsed.data.altText ?? null,
        caption: parsed.data.caption ?? null,
        position,
      })
      .returning();
    return image;
  } catch (error) {
    await removeProductImage(blob.url).catch(() => undefined);
    throw error;
  }
}

export async function updateImageMetadata(productKey: string, imageId: string, input: unknown) {
  const product = await db().query.products.findFirst({ where: eq(products.legacyDocumentId, productKey) });
  if (!product) throw new HttpError(404, "NOT_FOUND", "Producto no encontrado.");
  const parsed = imageMetadataSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(422, "VALIDATION_ERROR", "Los metadatos de la imagen no son válidos.");
  return withTransaction(async (transaction) => {
    const image = await transaction.query.productImages.findFirst({
      where: and(eq(productImages.id, imageId), eq(productImages.productId, product.id), isNull(productImages.deletedAt)),
    });
    if (!image) throw new HttpError(404, "NOT_FOUND", "Imagen no encontrada.");
    const images = await transaction.select().from(productImages)
      .where(and(eq(productImages.productId, product.id), isNull(productImages.deletedAt)))
      .orderBy(asc(productImages.position));
    const ordered = images.filter((item) => item.id !== image.id);
    ordered.splice(Math.min(parsed.data.position, ordered.length), 0, image);
    for (const [index, item] of images.entries()) {
      await transaction.update(productImages).set({ position: 100000 + index, updatedAt: new Date() }).where(eq(productImages.id, item.id));
    }
    for (const [position, item] of ordered.entries()) {
      await transaction.update(productImages).set({
        ...(item.id === image.id ? parsed.data : {}),
        position,
        updatedAt: new Date(),
      }).where(eq(productImages.id, item.id));
    }
    const [updated] = await transaction.select().from(productImages).where(eq(productImages.id, image.id)).limit(1);
    return updated;
  });
}

export async function deleteImageFromProduct(productKey: string, imageId: string) {
  const product = await db().query.products.findFirst({ where: eq(products.legacyDocumentId, productKey) });
  if (!product) throw new HttpError(404, "NOT_FOUND", "Producto no encontrado.");
  const image = await db().query.productImages.findFirst({
    where: and(eq(productImages.id, imageId), eq(productImages.productId, product.id), isNull(productImages.deletedAt)),
  });
  if (!image) throw new HttpError(404, "NOT_FOUND", "Imagen no encontrada.");
  const active = await db().query.productImages.findMany({
    where: and(eq(productImages.productId, product.id), isNull(productImages.deletedAt)),
  });
  if (active.length <= 1) throw new HttpError(409, "CONFLICT", "El producto debe conservar al menos una imagen.");
  await withTransaction(async (transaction) => {
    await transaction.update(productImages).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(productImages.id, image.id));
  });
  await removeProductImage(image.storageUrl).catch(() => undefined);
  return { id: image.id, deleted: true };
}
