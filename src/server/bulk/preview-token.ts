import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "../http/errors";
import { PREVIEW_TTL_MS } from "../inventory/workbook-format";

export type BulkSection = "clientes" | "financiamientos" | "congresos";

export interface BulkPreviewPayload {
  v: 1;
  section?: BulkSection;
  fileSha256: string;
  baseline: string;
  issuedAt: number;
  expiresAt: number;
}

export type BulkTokenVerification =
  | { ok: true; payload: BulkPreviewPayload }
  | { ok: false; reason: "invalid" | "expired" };

const SECTION_PURPOSE_PREFIX = "bulk-preview:";

export const bulkPurpose = (section: BulkSection) => `${SECTION_PURPOSE_PREFIX}${section}`;

function signingKey(sessionToken: string, purpose: string) {
  return createHash("sha256").update(`${sessionToken}|${purpose}`).digest();
}

function signature(encodedPayload: string, sessionToken: string, purpose: string) {
  return createHmac("sha256", signingKey(sessionToken, purpose)).update(encodedPayload).digest();
}

export function signBulkPreviewToken(
  input: { section?: BulkSection; fileSha256: string; baseline: string },
  sessionToken: string,
  purpose: string,
  now: number = Date.now(),
): { token: string; payload: BulkPreviewPayload } {
  const payload: BulkPreviewPayload = {
    v: 1,
    ...(input.section ? { section: input.section } : {}),
    fileSha256: input.fileSha256,
    baseline: input.baseline,
    issuedAt: now,
    expiresAt: now + PREVIEW_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${encoded}.${signature(encoded, sessionToken, purpose).toString("base64url")}`;
  return { token, payload };
}

export function verifyBulkPreviewToken(
  token: string,
  sessionToken: string,
  purpose: string,
  now: number = Date.now(),
): BulkTokenVerification {
  const invalid = { ok: false, reason: "invalid" } as const;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return invalid;
  const [encoded, provided] = parts;

  const expected = signature(encoded, sessionToken, purpose);
  const actual = Buffer.from(provided, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return invalid;

  let payload: BulkPreviewPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return invalid;
  }
  if (
    payload?.v !== 1 ||
    typeof payload.fileSha256 !== "string" ||
    typeof payload.baseline !== "string" ||
    typeof payload.issuedAt !== "number" ||
    typeof payload.expiresAt !== "number"
  ) {
    return invalid;
  }
  if (purpose.startsWith(SECTION_PURPOSE_PREFIX) && payload.section !== purpose.slice(SECTION_PURPOSE_PREFIX.length)) {
    return invalid;
  }
  if (now >= payload.expiresAt) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}

function conflict(message: string, field: "previewToken" | "file") {
  return new HttpError(409, "CONFLICT", message, { [field]: message });
}

/** Comprueba el token de una sección contra la sesión y el archivo; responde 409 si no es aplicable. */
export function assertApplicableToken(input: {
  previewToken: string;
  sessionToken: string;
  section: BulkSection;
  bytes: Uint8Array;
  now?: number;
}): BulkPreviewPayload {
  const verification = verifyBulkPreviewToken(
    input.previewToken,
    input.sessionToken,
    bulkPurpose(input.section),
    input.now ?? Date.now(),
  );
  if (!verification.ok) {
    throw conflict(
      verification.reason === "expired"
        ? "La vista previa venció. Valida el archivo de nuevo."
        : "La vista previa no es válida. Valida el archivo de nuevo.",
      "previewToken",
    );
  }
  const fileSha256 = createHash("sha256").update(input.bytes).digest("hex");
  if (fileSha256 !== verification.payload.fileSha256) {
    throw conflict("El archivo no coincide con el de la vista previa.", "file");
  }
  return verification.payload;
}
