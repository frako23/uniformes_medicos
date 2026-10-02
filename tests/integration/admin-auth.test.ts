import { describe, expect, it } from "vitest";
import { hashPassword, hashToken, randomToken, verifyPassword } from "../../src/server/auth/crypto";
import { HttpError, errorResponse } from "../../src/server/http/errors";

describe("admin authentication primitives", () => {
  it("hashes passwords and rejects an incorrect password", async () => {
    const hash = await hashPassword("correcta-segura");
    expect(await verifyPassword("correcta-segura", hash)).toBe(true);
    expect(await verifyPassword("incorrecta", hash)).toBe(false);
    expect(hash).not.toContain("correcta-segura");
  });

  it("stores only one-way session token material", () => {
    const token = randomToken();
    expect(token).not.toBe(hashToken(token));
    expect(hashToken(token)).toHaveLength(64);
  });

  it("returns a generic JSON error without stack or secret fields", async () => {
    const response = errorResponse(new HttpError(401, "UNAUTHENTICATED", "Credenciales no válidas."));
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body).toEqual({ error: { code: "UNAUTHENTICATED", message: "Credenciales no válidas." } });
  });
});
