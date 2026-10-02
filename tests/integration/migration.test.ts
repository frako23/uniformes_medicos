import { describe, expect, it, vi } from "vitest";
import { normalizeProduct } from "../../src/server/migration/normalize-strapi";
import { createStrapiClient } from "../../src/server/migration/strapi-client";

describe("Strapi migration source", () => {
  it("normalizes Strapi v4 attributes and preserves publication state", () => {
    const product = normalizeProduct({
      id: 42,
      documentId: "doc-42",
      attributes: {
        Tipo: "Bata",
        Fabricantes: "Fabricante",
        Marca: "Marca",
        Genero: "Dama",
        Precio: 25,
        Color: "Azul",
        publishedAt: null,
        Talla: { data: [{ id: 9, attributes: { Talla: "M", cantidad_actual: 3 } }] },
        Foto: { data: [{ id: 7, attributes: { url: "/uploads/bata.jpg", mime: "image/jpeg" } }] },
      },
    });
    expect(product.legacyId).toBe(42);
    expect(product.legacyDocumentId).toBe("doc-42");
    expect(product.isPublished).toBe(false);
    expect(product.variants[0]).toMatchObject({ id: 9, sizeLabel: "M", quantity: 3 });
    expect(product.images[0]).toMatchObject({ id: 7, position: 0 });
  });

  it("reads all pages instead of assuming a fixed page count", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const page = new URL(url).searchParams.get("pagination[page]");
      const id = page === "1" ? 1 : 2;
      return new Response(JSON.stringify({ data: [{ id, attributes: { Tipo: "Bata" } }], meta: { pagination: { pageCount: 2 } } }), { status: 200 });
    });
    const client = createStrapiClient({ baseUrl: "https://strapi.example", token: "test-token", pageSize: 1 });
    await expect(client.products()).resolves.toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
  });
});
