import { describe, expect, it } from "vitest";
import { signPreviewToken, verifyPreviewToken } from "../../src/server/inventory/preview-token";

const input = { fileSha256: "a".repeat(64), baseline: "b".repeat(64) };

describe("token de vista previa", () => {
  it("firma y verifica el contenido", () => {
    const { token } = signPreviewToken(input, "sesion-1", 1_000);
    const result = verifyPreviewToken(token, "sesion-1", 2_000);
    expect(result).toEqual({ ok: true, payload: { v: 1, ...input, issuedAt: 1_000, expiresAt: 1_000 + 60 * 60 * 1000 } });
  });

  it("rechaza contenido alterado y firmas de otra sesión", () => {
    const { token } = signPreviewToken(input, "sesion-1", 1_000);
    const [payload, signature] = token.split(".");
    const original = JSON.parse(Buffer.from(payload, "base64url").toString());
    const forged = Buffer.from(JSON.stringify({ ...original, baseline: "c" })).toString("base64url");
    expect(verifyPreviewToken(`${forged}.${signature}`, "sesion-1", 2_000)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyPreviewToken(token, "sesion-2", 2_000)).toEqual({ ok: false, reason: "invalid" });
  });

  it("vence a los 60 minutos exactos", () => {
    const { token } = signPreviewToken(input, "s", 0);
    const limit = 60 * 60 * 1000;
    expect(verifyPreviewToken(token, "s", limit - 1).ok).toBe(true);
    expect(verifyPreviewToken(token, "s", limit)).toEqual({ ok: false, reason: "expired" });
  });

  it("no lanza con firmas de distinta longitud o formato", () => {
    const { token } = signPreviewToken(input, "s", 0);
    const [payload] = token.split(".");
    for (const bad of ["", "x", `${payload}.corta`, `${payload}.${"A".repeat(200)}`, "a.b.c"]) {
      expect(verifyPreviewToken(bad, "s", 1)).toEqual({ ok: false, reason: "invalid" });
    }
  });
});
