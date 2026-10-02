import { createHash } from "node:crypto";
import { uploadProductImage } from "../storage/blob";
import type { SourceImage } from "./normalize-strapi";
import { createStrapiClient } from "./strapi-client";

export async function importSourceImage(
  client: ReturnType<typeof createStrapiClient>,
  productKey: string,
  image: SourceImage,
) {
  const downloaded = await client.downloadImage(image.url);
  const contentLength = Number(downloaded.response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 10 * 1024 * 1024) {
    throw new Error(`La imagen de origen supera el límite de 10 MB (${image.url}).`);
  }
  const buffer = Buffer.from(await downloaded.response.arrayBuffer());
  const responseMime = downloaded.response.headers.get("content-type")?.split(";")[0];
  const mimeType = responseMime?.startsWith("image/") ? responseMime : image.mime ?? responseMime ?? "";
  const filename = (image.name ?? downloaded.url.split("/").pop()?.split("?")[0] ?? "image")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(-120) || "image";
  const file = new globalThis.File([buffer], filename, { type: mimeType });
  const stored = await uploadProductImage({
    productKey,
    file,
    pathname: `products/${productKey}/${image.id ?? image.documentId ?? filename}`,
    addRandomSuffix: false,
  });
  return {
    ...stored,
    legacyUrl: downloaded.url,
    legacyId: image.id,
    width: image.width,
    height: image.height,
    altText: image.alternativeText,
    caption: image.caption,
    position: image.position,
    checksum: createHash("sha256").update(buffer).digest("hex"),
  };
}
