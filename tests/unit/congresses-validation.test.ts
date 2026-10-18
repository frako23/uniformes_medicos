import { describe, expect, it } from "vitest";
import {
  CONGRESS_LIMITS,
  congressDeleteSchema,
  congressInputSchema,
  congressRangeQuerySchema,
  congressUpdateSchema,
} from "../../src/server/validation/congresses";
import { fieldErrors } from "../../src/server/validation/parse";

const valid = { name: "  Congreso de Mastología ", startDate: "2026-10-30", endDate: "2026-11-01" };
const errors = (input: unknown, schema = congressInputSchema) => {
  const parsed = schema.safeParse(input);
  return parsed.success ? {} : fieldErrors(parsed.error);
};

describe("congressInputSchema", () => {
  it("recorta y acepta un congreso válido", () => {
    const parsed = congressInputSchema.parse(valid);
    expect(parsed).toMatchObject({ name: "Congreso de Mastología", venue: null, specialty: null, notes: null });
  });
  it("el nombre tiene de 1 a 160 caracteres", () => {
    expect(errors({ ...valid, name: " " })).toHaveProperty("name");
    expect(errors({ ...valid, name: "a".repeat(CONGRESS_LIMITS.name + 1) })).toHaveProperty("name");
    expect(errors({ ...valid, name: "a".repeat(CONGRESS_LIMITS.name) })).toEqual({});
  });
  it("las fechas son obligatorias y válidas", () => {
    expect(errors({ ...valid, startDate: undefined })).toHaveProperty("startDate");
    expect(errors({ ...valid, endDate: "" })).toHaveProperty("endDate");
    expect(errors({ ...valid, startDate: "2026-02-31" })).toHaveProperty("startDate");
  });
  it("una fecha de fin anterior da fields.endDate", () => {
    expect(errors({ ...valid, endDate: "2026-10-29" })).toEqual({ endDate: "La fecha de fin no puede ser anterior a la de inicio." });
    expect(errors({ ...valid, endDate: "2026-10-30" })).toEqual({});
  });
  it("limita lugar, especialidad y notas", () => {
    expect(errors({ ...valid, venue: "a".repeat(161) })).toHaveProperty("venue");
    expect(errors({ ...valid, specialty: "a".repeat(161) })).toHaveProperty("specialty");
    expect(errors({ ...valid, notes: "a".repeat(1001) })).toHaveProperty("notes");
    expect(errors({ ...valid, venue: "a".repeat(160), specialty: "a".repeat(160), notes: "a".repeat(1000) })).toEqual({});
  });
  it("los textos vacíos pasan a null", () => {
    expect(congressInputSchema.parse({ ...valid, venue: "  ", specialty: "", notes: null })).toMatchObject({ venue: null, specialty: null, notes: null });
  });
});

describe("expectedUpdatedAt", () => {
  const expectedUpdatedAt = "2026-10-18T12:00:00.000Z";
  it("es obligatorio al editar y al eliminar", () => {
    expect(congressUpdateSchema.safeParse(valid).success).toBe(false);
    expect(congressUpdateSchema.safeParse({ ...valid, expectedUpdatedAt }).success).toBe(true);
    expect(congressDeleteSchema.safeParse({}).success).toBe(false);
    expect(congressDeleteSchema.safeParse({ expectedUpdatedAt }).success).toBe(true);
  });
});

describe("congressRangeQuerySchema", () => {
  it("acepta un rango válido y descarta los inválidos", () => {
    expect(congressRangeQuerySchema.parse({ from: "2026-10-01", to: "2026-10-31" })).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(congressRangeQuerySchema.parse({ from: "x", to: "" })).toEqual({ from: undefined, to: undefined });
  });
});
