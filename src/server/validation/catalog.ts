import { z } from "zod";

export const genderSchema = z.enum(["Dama", "Caballero", "Unisex"]);
const booleanInput = (defaultValue: boolean) => z.preprocess(
  (value) => value === undefined
    ? defaultValue
    : typeof value === "string"
      ? value === "true" || value === "1" || value === "on"
      : Boolean(value),
  z.boolean(),
);

export const variantInputSchema = z.object({
  id: z.string().uuid().optional(),
  legacyId: z.coerce.number().int().positive().optional(),
  sizeLabel: z.string().trim().min(1, "La talla es obligatoria").max(40),
  quantity: z.coerce
    .number()
    .int("La existencia debe ser un número entero")
    .min(0, "La existencia no puede ser negativa"),
});

export const productInputSchema = z.object({
  legacyDocumentId: z.string().trim().min(1).max(255).optional(),
  legacyTypeLabel: z.string().trim().min(1, "El tipo/categoría es obligatorio").max(160),
  manufacturer: z.string().trim().min(1, "El fabricante es obligatorio").max(160),
  brand: z.string().trim().min(1, "La marca es obligatoria").max(160),
  gender: genderSchema,
  price: z.coerce
    .number()
    .finite("El precio debe ser válido")
    .min(0, "El precio no puede ser negativo"),
  sku: z.string().trim().max(160).nullable().optional(),
  color: z.string().trim().min(1, "El color es obligatorio").max(160),
  isPublished: booleanInput(false),
  isActive: booleanInput(true),
  categoryId: z.string().uuid().nullable().optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
  variants: z.array(variantInputSchema).default([]),
});

export const imageMetadataSchema = z.object({
  altText: z.string().trim().max(255).nullable().optional(),
  caption: z.string().trim().max(255).nullable().optional(),
  position: z.coerce.number().int().min(0),
});

export const publicCartSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).max(100),
});

export type ProductInput = z.infer<typeof productInputSchema>;
export type VariantInput = z.infer<typeof variantInputSchema>;
export type ImageMetadataInput = z.infer<typeof imageMetadataSchema>;
