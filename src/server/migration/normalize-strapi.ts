export interface SourceImage {
  id?: number;
  documentId?: string;
  name?: string;
  url: string;
  alternativeText?: string | null;
  caption?: string | null;
  width?: number | null;
  height?: number | null;
  mime?: string;
  size?: number;
  position: number;
}

export interface SourceVariant {
  id?: number;
  sizeLabel: string;
  quantity: number;
}

export interface SourceProduct {
  legacyId: number;
  legacyDocumentId: string;
  typeLabel: string;
  manufacturer: string;
  brand: string;
  gender: "Dama" | "Caballero" | "Unisex";
  price: number;
  sku: string | null;
  color: string;
  isPublished: boolean;
  sourceCreatedAt: Date | null;
  sourceUpdatedAt: Date | null;
  sourcePublishedAt: Date | null;
  variants: SourceVariant[];
  images: SourceImage[];
}

function unwrap(value: any): any {
  if (value?.data && Array.isArray(value.data)) return value.data;
  if (value?.data && typeof value.data === "object") return value.data;
  return value;
}

function asArray(value: any) {
  const unwrapped = unwrap(value);
  return Array.isArray(unwrapped) ? unwrapped : unwrapped ? [unwrapped] : [];
}

function attrs(value: any) {
  const unwrapped = unwrap(value);
  return unwrapped?.attributes
    ? { id: unwrapped.id, documentId: unwrapped.documentId, ...unwrapped.attributes }
    : unwrapped ?? {};
}

function dateOrNull(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeGender(value: unknown): SourceProduct["gender"] {
  return value === "Dama" || value === "Caballero" ? value : "Unisex";
}

export function normalizeProduct(raw: any): SourceProduct {
  const value = attrs(raw);
  const legacyId = Number(value.id ?? raw.id);
  if (!Number.isInteger(legacyId) || legacyId <= 0) throw new Error("Producto de origen sin identificador numérico válido.");
  const rawVariants = asArray(value.Talla ?? value.talla ?? value.variants);
  const rawImages = asArray(value.Foto ?? value.foto ?? value.images);
  return {
    legacyId,
    legacyDocumentId: String(value.documentId ?? value.id ?? raw.id),
    typeLabel: String(value.Tipo ?? value.tipo ?? value.category ?? "Sin categoría"),
    manufacturer: String(value.Fabricantes ?? value.fabricante ?? ""),
    brand: String(value.Marca ?? value.marca ?? ""),
    gender: normalizeGender(value.Genero ?? value.genero),
    price: Number(value.Precio ?? value.precio ?? value.price ?? 0),
    sku: value.SKU == null ? null : String(value.SKU),
    color: String(value.Color ?? value.color ?? ""),
    isPublished: value.publishedAt !== undefined
      ? value.publishedAt !== null
      : value.isPublished === undefined
        ? true
        : Boolean(value.isPublished),
    sourceCreatedAt: dateOrNull(value.createdAt),
    sourceUpdatedAt: dateOrNull(value.updatedAt),
    sourcePublishedAt: dateOrNull(value.publishedAt),
    variants: rawVariants.map((item) => {
      const variant = attrs(item);
      return {
        id: variant.id ? Number(variant.id) : undefined,
        sizeLabel: String(variant.Talla ?? variant.talla ?? variant.size ?? ""),
        quantity: Math.max(0, Number(variant.cantidad_actual ?? variant.quantity ?? 0)),
      };
    }).filter((variant) => variant.sizeLabel),
    images: rawImages.map((item, index) => {
      const image = attrs(item);
      return {
        id: image.id ? Number(image.id) : undefined,
        documentId: image.documentId,
        name: image.name,
        url: String(image.url ?? image.formats?.medium?.url ?? ""),
        alternativeText: image.alternativeText ?? null,
        caption: image.caption ?? null,
        width: image.width ? Number(image.width) : null,
        height: image.height ? Number(image.height) : null,
        mime: image.mime,
        size: image.size ? Number(image.size) : undefined,
        position: index,
      };
    }).filter((image) => image.url),
  };
}
