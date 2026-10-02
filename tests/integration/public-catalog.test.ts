import { describe, expect, it } from "vitest";
import { publicCartSchema } from "../../src/server/validation/catalog";
import { toProducto, type ProductWithRelations } from "../../src/server/catalog/mapper";

describe("public catalog invariants", () => {
  it("preserves numeric and document identifiers and derives availability", () => {
    const product = {
      id: "00000000-0000-0000-0000-000000000001",
      legacyId: 15,
      legacyDocumentId: "doc-15",
      categoryId: null,
      legacyTypeLabel: "Bata",
      manufacturer: "F",
      brand: "B",
      gender: "Unisex",
      price: "10.00",
      sku: null,
      color: "Blanca",
      isPublished: true,
      isActive: true,
      sourceCreatedAt: null,
      sourceUpdatedAt: null,
      sourcePublishedAt: new Date("2024-01-01T00:00:00Z"),
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-01T00:00:00Z"),
      variants: [{ id: "00000000-0000-0000-0000-000000000002", productId: "00000000-0000-0000-0000-000000000001", legacyId: 4, sizeLabel: "M", quantity: 2, createdAt: new Date(), updatedAt: new Date() }],
      images: [{ id: "00000000-0000-0000-0000-000000000003", productId: "00000000-0000-0000-0000-000000000001", legacyId: 8, legacyUrl: "https://legacy/image.jpg", storagePathname: "products/15/image.jpg", storageUrl: "https://blob/image.jpg", checksum: null, mimeType: "image/jpeg", byteSize: 10, width: null, height: null, altText: "Bata", caption: null, position: 0, createdAt: new Date(), updatedAt: new Date(), deletedAt: null }],
    } as ProductWithRelations;
    expect(toProducto(product)).toMatchObject({ id: 15, documentId: "doc-15", isAvailable: true });
  });

  it("bounds cart identifiers and rejects non-positive values", () => {
    expect(publicCartSchema.safeParse({ ids: [1, 2, 3] }).success).toBe(true);
    expect(publicCartSchema.safeParse({ ids: [0] }).success).toBe(false);
  });
});
