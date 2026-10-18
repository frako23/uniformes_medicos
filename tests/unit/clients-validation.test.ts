import { describe, expect, it } from "vitest";
import {
  CLIENT_LIMITS,
  clientInputSchema,
  clientListQuerySchema,
  clientUpdateSchema,
} from "../../src/server/validation/clients";

const valid = { name: "  Ana Pérez ", phone: "0414-123-4567" };

describe("clientInputSchema", () => {
  it("recorta el nombre y normaliza el celular", () => {
    const result = clientInputSchema.safeParse(valid);
    expect(result.success && result.data).toMatchObject({ name: "Ana Pérez", phoneE164: "+584141234567" });
  });

  it("exige el nombre y limita su largo", () => {
    expect(clientInputSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
    expect(clientInputSchema.safeParse({ ...valid, name: "a".repeat(CLIENT_LIMITS.name + 1) }).success).toBe(false);
    expect(clientInputSchema.safeParse({ ...valid, name: "a".repeat(CLIENT_LIMITS.name) }).success).toBe(true);
  });

  it("acepta cualquier escritura válida del celular y reporta el error en phone", () => {
    for (const phone of ["04141234567", "+58 414 123 4567", 4141234567, "+57 300 123 4567"]) {
      expect(clientInputSchema.safeParse({ ...valid, phone }).success).toBe(true);
    }
    const bad = clientInputSchema.safeParse({ ...valid, phone: "123" });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues[0].path).toEqual(["phone"]);
      expect(bad.error.issues[0].message).toContain("10 dígitos");
    }
    expect(clientInputSchema.safeParse({ name: "Ana" }).success).toBe(false);
  });

  it("admite Mujer, Hombre o null en sexo", () => {
    expect(clientInputSchema.safeParse({ ...valid, sex: "Mujer" }).success).toBe(true);
    expect(clientInputSchema.safeParse({ ...valid, sex: null }).success).toBe(true);
    expect(clientInputSchema.safeParse({ ...valid, sex: "" }).success).toBe(true);
    expect(clientInputSchema.safeParse({ ...valid, sex: "Otro" }).success).toBe(false);
  });

  it("limita los textos opcionales", () => {
    expect(clientInputSchema.safeParse({ ...valid, size: "a".repeat(41) }).success).toBe(false);
    expect(clientInputSchema.safeParse({ ...valid, size: "a".repeat(40) }).success).toBe(true);
    for (const field of ["city", "hospital", "clinic", "specialty"]) {
      expect(clientInputSchema.safeParse({ ...valid, [field]: "a".repeat(161) }).success).toBe(false);
      expect(clientInputSchema.safeParse({ ...valid, [field]: "a".repeat(160) }).success).toBe(true);
    }
    expect(clientInputSchema.safeParse({ ...valid, notes: "a".repeat(1001) }).success).toBe(false);
    expect(clientInputSchema.safeParse({ ...valid, notes: "a".repeat(1000) }).success).toBe(true);
  });

  it("convierte los textos vacíos en null", () => {
    const result = clientInputSchema.safeParse({ ...valid, size: "  ", city: "", hospital: undefined, notes: null });
    expect(result.success && result.data).toMatchObject({ size: null, city: null, hospital: null, notes: null });
  });
});

describe("clientUpdateSchema", () => {
  it("exige expectedUpdatedAt", () => {
    expect(clientUpdateSchema.safeParse(valid).success).toBe(false);
    const ok = clientUpdateSchema.safeParse({ ...valid, expectedUpdatedAt: "2026-10-18T12:00:00.000Z" });
    expect(ok.success && ok.data.expectedUpdatedAt).toBe("2026-10-18T12:00:00.000Z");
  });
});

describe("clientListQuerySchema", () => {
  it("usa valores por defecto", () => {
    expect(clientListQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 20 });
  });
  it("acepta 20, 50 y 100 por página", () => {
    for (const size of ["20", "50", "100"]) expect(clientListQuerySchema.parse({ pageSize: size }).pageSize).toBe(Number(size));
    expect(clientListQuerySchema.parse({ pageSize: "30" }).pageSize).toBe(20);
  });
  it("normaliza la página", () => {
    expect(clientListQuerySchema.parse({ page: "3" }).page).toBe(3);
    expect(clientListQuerySchema.parse({ page: "0" }).page).toBe(1);
    expect(clientListQuerySchema.parse({ page: "x" }).page).toBe(1);
  });
  it("valida saldo y sexo", () => {
    expect(clientListQuerySchema.parse({ balance: "pending", sex: "Hombre" })).toMatchObject({ balance: "pending", sex: "Hombre" });
    expect(clientListQuerySchema.parse({ balance: "overdue" }).balance).toBe("overdue");
    const invalid = clientListQuerySchema.parse({ balance: "otro", sex: "Otro" });
    expect(invalid.balance).toBeUndefined();
    expect(invalid.sex).toBeUndefined();
  });
  it("trata los filtros vacíos como ausentes", () => {
    const query = clientListQuerySchema.parse({ search: "  Ana ", city: "", specialty: "Pediatría" });
    expect(query).toMatchObject({ search: "Ana", specialty: "Pediatría" });
    expect(query.city).toBeUndefined();
  });
});
