import { del, put } from "@vercel/blob";
import { createHash } from "node:crypto";
import { HttpError } from "../http/errors";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function storageToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN no está configurado");
  return token;
}

export function validateImageFile(file: File) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new HttpError(422, "VALIDATION_ERROR", "El archivo debe ser una imagen JPG, PNG, WebP o AVIF.");
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw new HttpError(422, "VALIDATION_ERROR", "La imagen debe pesar entre 1 byte y 10 MB.");
  }
}

export async function uploadProductImage(input: {
  productKey: string;
  file: File;
  pathname?: string;
  addRandomSuffix?: boolean;
}) {
  validateImageFile(input.file);
  const pathname = input.pathname ?? `products/${input.productKey}/${crypto.randomUUID()}`;
  const blob = await put(pathname, input.file, {
    access: "public",
    token: storageToken(),
    addRandomSuffix: input.addRandomSuffix ?? true,
    cacheControlMaxAge: 31536000,
  });
  const bytes = Buffer.from(await input.file.arrayBuffer());
  return {
    pathname: blob.pathname,
    url: blob.url,
    mimeType: input.file.type,
    byteSize: input.file.size,
    checksum: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function removeProductImage(url: string) {
  await del(url, { token: storageToken() });
}
