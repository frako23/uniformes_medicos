import type { Product, ProductImage, ProductVariant } from "../../db/schema";
import { compareSizeLabels } from "../../utils/catalog-filters";
import type { Producto } from "../../utils/types";

export type ProductWithRelations = Product & {
  variants: ProductVariant[];
  images: ProductImage[];
};

export function toProducto(product: ProductWithRelations): Producto {
  return {
    id: product.legacyId,
    documentId: product.legacyDocumentId,
    Tipo: product.legacyTypeLabel,
    Fabricantes: product.manufacturer,
    Marca: product.brand,
    Genero: product.gender,
    Precio: Number(product.price),
    SKU: product.sku,
    Color: product.color,
    Talla: [...product.variants]
      .sort((a, b) => compareSizeLabels(a.sizeLabel, b.sizeLabel))
      .map((variant) => ({
        id: variant.legacyId ?? variant.id,
        Talla: variant.sizeLabel,
        cantidad_actual: variant.quantity,
      })),
    Foto: [...product.images]
      .filter((image) => !image.deletedAt)
      .sort((a, b) => a.position - b.position)
      .map((image) => ({
        id: image.legacyId ?? image.id,
        alternativeText: image.altText,
        caption: image.caption,
        width: image.width,
        height: image.height,
        url: image.storageUrl,
        position: image.position,
        mime: image.mimeType,
        size: image.byteSize,
      })),
    createdAt: product.sourceCreatedAt?.toISOString() ?? product.createdAt.toISOString(),
    updatedAt: product.sourceUpdatedAt?.toISOString() ?? product.updatedAt.toISOString(),
    publishedAt: product.sourcePublishedAt?.toISOString() ?? null,
    isAvailable:
      product.isPublished &&
      product.isActive &&
      product.variants.some((variant) => variant.quantity > 0),
  };
}
