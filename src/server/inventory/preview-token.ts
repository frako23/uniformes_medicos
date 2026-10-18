import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { PREVIEW_TTL_MS } from "./workbook-format";

export interface PreviewTokenPayload {
  v: 1;
  fileSha256: string;
  baseline: string;
  issuedAt: number;
  expiresAt: number;
}

export type PreviewTokenVerification =
  | { ok: true; payload: PreviewTokenPayload }
  | { ok: false; reason: "invalid" | "expired" };

function signingKey(sessionToken: string) {
  return createHash("sha256").update(`${sessionToken}|inventory-preview`).digest();
}

function signature(encodedPayload: string, sessionToken: string) {
  return createHmac("sha256", signingKey(sessionToken)).update(encodedPayload).digest();
}

export function signPreviewToken(
  input: { fileSha256: string; baseline: string },
  sessionToken: string,
  now: number = Date.now(),
): { token: string; payload: PreviewTokenPayload } {
  const payload: PreviewTokenPayload = {
    v: 1,
    fileSha256: input.fileSha256,
    baseline: input.baseline,
    issuedAt: now,
    expiresAt: now + PREVIEW_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${encoded}.${signature(encoded, sessionToken).toString("base64url")}`;
  return { token, payload };
}

export function verifyPreviewToken(
  token: string,
  sessionToken: string,
  now: number = Date.now(),
): PreviewTokenVerification {
  const invalid = { ok: false, reason: "invalid" } as const;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return invalid;
  const [encoded, provided] = parts;

  const expected = signature(encoded, sessionToken);
  const actual = Buffer.from(provided, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return invalid;

  let payload: PreviewTokenPayload;
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
  if (now >= payload.expiresAt) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}
