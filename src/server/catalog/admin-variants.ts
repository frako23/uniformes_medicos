import { eq } from "drizzle-orm";
import { productVariants, products } from "../../db/schema";
import { db } from "../db";
import { HttpError } from "../http/errors";
import { variantInputSchema } from "../validation/catalog";

export async function updateVariantQuantity(productId: string, variantId: string, input: unknown) {
  const parsed = variantInputSchema.pick({ quantity: true }).safeParse(input);
  if (!parsed.success) {
    throw new HttpError(422, "VALIDATION_ERROR", "La existencia no es válida.", {
      quantity: parsed.error.issues[0]?.message ?? "La existencia debe ser un entero no negativo.",
    });
  }
  const [variant] = await db()
    .update(productVariants)
    .set({ quantity: parsed.data.quantity, updatedAt: new Date() })
    .where(eq(productVariants.id, variantId))
    .returning();
  if (!variant || variant.productId !== productId) {
    throw new HttpError(404, "NOT_FOUND", "Talla no encontrada.");
  }
  return variant;
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
