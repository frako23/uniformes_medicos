import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HttpError } from "../../src/server/http/errors";
import {
  assertApplicableToken,
  signBulkPreviewToken,
  verifyBulkPreviewToken,
} from "../../src/server/bulk/preview-token";
import { signPreviewToken } from "../../src/server/inventory/preview-token";

const input = { fileSha256: "a".repeat(64), baseline: "b".repeat(64) };
const TTL = 60 * 60 * 1000;

describe("compatibilidad con la 003", () => {
  it("un token de inventario se verifica con el propósito inventory-preview", () => {
    const { token } = signPreviewToken(input, "sesion", 1_000);
    expect(verifyBulkPreviewToken(token, "sesion", "inventory-preview", 2_000)).toEqual({
      ok: true,
      payload: { v: 1, ...input, issuedAt: 1_000, expiresAt: 1_000 + TTL },
    });
  });
});

describe("tokens de sección", () => {
  it("llevan la sección y se firman con la clave de la sección", () => {
    const { token } = signBulkPreviewToken({ ...input, section: "clientes" }, "sesion", "bulk-preview:clientes", 1_000);
    const result = verifyBulkPreviewToken(token, "sesion", "bulk-preview:clientes", 2_000);
    expect(result).toEqual({
      ok: true,
      payload: { v: 1, section: "clientes", ...input, issuedAt: 1_000, expiresAt: 1_000 + TTL },
    });
    const [encoded, provided] = token.split(".");
    const expected = createHash("sha256").update("sesion|bulk-preview:clientes").digest();
    expect(expected.length).toBe(32);
    expect(provided.length).toBeGreaterThan(0);
    expect(JSON.parse(Buffer.from(encoded, "base64url").toString()).section).toBe("clientes");
  });
  it("un token de clientes no vale para congresos ni con otra sesión", () => {
    const { token } = signBulkPreviewToken({ ...input, section: "clientes" }, "sesion", "bulk-preview:clientes", 1_000);
    expect(verifyBulkPreviewToken(token, "sesion", "bulk-preview:congresos", 2_000)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyBulkPreviewToken(token, "otra", "bulk-preview:clientes", 2_000)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("integridad y vencimiento", () => {
  const { token } = signBulkPreviewToken({ ...input, section: "congresos" }, "s", "bulk-preview:congresos", 0);

  it("rechaza contenido alterado", () => {
    const [payload, signature] = token.split(".");
    const original = JSON.parse(Buffer.from(payload, "base64url").toString());
    const forged = Buffer.from(JSON.stringify({ ...original, baseline: "c" })).toString("base64url");
    expect(verifyBulkPreviewToken(`${forged}.${signature}`, "s", "bulk-preview:congresos", 1)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
  it("vence exactamente a los 60 minutos", () => {
    expect(verifyBulkPreviewToken(token, "s", "bulk-preview:congresos", TTL - 1).ok).toBe(true);
    expect(verifyBulkPreviewToken(token, "s", "bulk-preview:congresos", TTL)).toEqual({ ok: false, reason: "expired" });
  });
  it("no lanza con firmas de otra longitud", () => {
    const [payload] = token.split(".");
    expect(verifyBulkPreviewToken(`${payload}.abc`, "s", "bulk-preview:congresos", 1)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyBulkPreviewToken("basura", "s", "bulk-preview:congresos", 1)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("assertApplicableToken", () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const issue = (now: number) => {
    const { token } = signBulkPreviewToken({ section: "clientes", fileSha256: sha, baseline: "x" }, "s", "bulk-preview:clientes", 0);
    return { previewToken: token, sessionToken: "s", section: "clientes" as const, bytes, now };
  };
  const message = (fn: () => unknown) => {
    try {
      fn();
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(409);
      return (error as HttpError).message;
    }
    return null;
  };

  it("devuelve la carga útil si todo coincide", () => {
    expect(assertApplicableToken(issue(1)).baseline).toBe("x");
  });
  it("responde 409 con el mensaje de cada caso", () => {
    expect(message(() => assertApplicableToken({ ...issue(1), previewToken: "mal" }))).toBe(
      "La vista previa no es válida. Valida el archivo de nuevo.",
    );
    expect(message(() => assertApplicableToken(issue(TTL)))).toBe("La vista previa venció. Valida el archivo de nuevo.");
    expect(message(() => assertApplicableToken({ ...issue(1), bytes: new Uint8Array([9]) }))).toBe(
      "El archivo no coincide con el de la vista previa.",
    );
  });
});
