import { signBulkPreviewToken, verifyBulkPreviewToken, type BulkTokenVerification } from "../bulk/preview-token";

const PURPOSE = "inventory-preview";

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

export function signPreviewToken(
  input: { fileSha256: string; baseline: string },
  sessionToken: string,
  now: number = Date.now(),
): { token: string; payload: PreviewTokenPayload } {
  return signBulkPreviewToken(input, sessionToken, PURPOSE, now) as { token: string; payload: PreviewTokenPayload };
}

export function verifyPreviewToken(token: string, sessionToken: string, now: number = Date.now()): PreviewTokenVerification {
  return verifyBulkPreviewToken(token, sessionToken, PURPOSE, now) as BulkTokenVerification & PreviewTokenVerification;
}
