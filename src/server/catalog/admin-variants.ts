import { and, eq } from "drizzle-orm";
import { productVariants, products } from "../../db/schema";
import { db, withTransaction } from "../db";
import { HttpError } from "../http/errors";
import { variantInputSchema } from "../validation/catalog";

export async function updateVariantQuantity(productId: string, variantId: string, input: unknown) {
  const parsed = variantInputSchema.pick({ quantity: true }).safeParse(input);
  if (!parsed.success) {
    throw new HttpError(422, "VALIDATION_ERROR", "La existencia no es válida.", {
      quantity: parsed.error.issues[0]?.message ?? "La existencia debe ser un entero no negativo.",
    });
  }
  return withTransaction(async (transaction) => {
    const now = new Date();
    const [variant] = await transaction
      .update(productVariants)
      .set({ quantity: parsed.data.quantity, updatedAt: now })
      .where(and(eq(productVariants.id, variantId), eq(productVariants.productId, productId)))
      .returning();
    if (!variant) throw new HttpError(404, "NOT_FOUND", "Talla no encontrada.");
    // `products.updated_at` es la marca de “modificado después de la descarga” de la carga masiva.
    await transaction.update(products).set({ updatedAt: now }).where(eq(products.id, productId));
    return variant;
  });
}

export async function updateProductAvailability(productId: string, input: { isPublished: boolean; isActive: boolean }) {
  const [product] = await db()
    .update(products)
    .set({ isPublished: input.isPublished, isActive: input.isActive, updatedAt: new Date() })
    .where(eq(products.id, productId))
    .returning();
  if (!product) throw new HttpError(404, "NOT_FOUND", "Producto no encontrado.");
  return product;
}
