import { describe, expect, it } from "vitest";
import {
  annulSchema,
  deleteSchema,
  financingCreateSchema,
  financingUpdateSchema,
  restoreSchema,
} from "../../src/server/validation/financing";
import { fieldErrors } from "../../src/server/validation/parse";

const base = {
  clientRef: 12,
  description: "Dos conjuntos talla M",
  purchaseDate: "2026-10-18",
  frequency: "quincenal",
  installments: [
    { isInitial: false, dueDate: "2026-10-31", amountUsd: "50.00" },
    { isInitial: false, dueDate: "2026-11-15", amountUsd: "50.00" },
  ],
};

const errorsOf = (input: unknown) => {
  const parsed = financingCreateSchema.safeParse(input);
  return parsed.success ? {} : fieldErrors(parsed.error);
};

describe("financingCreateSchema", () => {
  it("acepta un financiamiento válido", () => {
    const parsed = financingCreateSchema.safeParse(base);
    expect(parsed.success && parsed.data).toMatchObject({ clientRef: 12, frequency: "quincenal" });
  });

  it("exige el cliente, la descripción y la fecha", () => {
    expect(errorsOf({ ...base, clientRef: undefined })).toHaveProperty("clientRef");
    expect(errorsOf({ ...base, clientRef: 0 })).toHaveProperty("clientRef");
    expect(errorsOf({ ...base, description: "  " })).toHaveProperty("description");
    expect(errorsOf({ ...base, description: "a".repeat(501) })).toHaveProperty("description");
    expect(errorsOf({ ...base, description: "a".repeat(500) })).toEqual({});
    expect(errorsOf({ ...base, purchaseDate: "2026-02-31" })).toHaveProperty("purchaseDate");
    expect(errorsOf({ ...base, frequency: "diaria" })).toHaveProperty("frequency");
  });

  it("limita el número de cuotas de 1 a 49 con como máximo una inicial", () => {
    expect(errorsOf({ ...base, installments: [] })).toHaveProperty("installments");
    const row = { isInitial: false, dueDate: "2026-10-31", amountUsd: "1.00" };
    expect(errorsOf({ ...base, installments: Array(48).fill(row) })).toEqual({});
    expect(errorsOf({ ...base, installments: Array(49).fill(row) })).toHaveProperty("installments");
    expect(errorsOf({ ...base, installments: [{ ...row, isInitial: true, dueDate: "2026-10-18" }, ...Array(48).fill(row)] })).toEqual({});
    expect(
      errorsOf({ ...base, installments: [{ ...row, isInitial: true, dueDate: "2026-10-18" }, { ...row, isInitial: true, dueDate: "2026-10-18" }] }),
    ).toHaveProperty("installments");
  });

  it("la inicial vence en la fecha de compra", () => {
    const errors = errorsOf({
      ...base,
      installments: [{ isInitial: true, dueDate: "2026-10-20", amountUsd: "10.00" }, base.installments[0]],
    });
    expect(errors).toHaveProperty(["installments.0.dueDate"]);
  });

  it("valida los montos y reporta la cuota con su clave", () => {
    const withAmount = (amountUsd: string) =>
      errorsOf({ ...base, installments: [base.installments[0], base.installments[1], { isInitial: false, dueDate: "2026-11-30", amountUsd }, { isInitial: false, dueDate: "bad", amountUsd: "1.00" }] });
    expect(withAmount("0")).toHaveProperty(["installments.2.amountUsd"]);
    expect(withAmount("-5")).toHaveProperty(["installments.2.amountUsd"]);
    expect(withAmount("1.234")).toHaveProperty(["installments.2.amountUsd"]);
    expect(withAmount("abc")).toHaveProperty(["installments.2.amountUsd"]);
    expect(withAmount("10000000000.00")).toHaveProperty(["installments.2.amountUsd"]);
    expect(withAmount("9999999999.99")).not.toHaveProperty(["installments.2.amountUsd"]);
    expect(withAmount("25")).not.toHaveProperty(["installments.2.amountUsd"]);
    expect(withAmount("25")).toHaveProperty(["installments.3.dueDate"]);
  });
});

describe("esquemas con expectedUpdatedAt", () => {
  const expectedUpdatedAt = "2026-10-18T12:00:00.000Z";

  it("financingUpdateSchema exige descripción, cuotas y versión", () => {
    const valid = {
      description: "Nueva descripción",
      pendingInstallments: [{ id: "2f9b6cf2-5a43-4f13-9a52-4e2b1d9d0a11", dueDate: "2026-10-31", amountUsd: "25.00" }, { dueDate: "2026-11-15", amountUsd: "25.00" }],
      expectedUpdatedAt,
    };
    expect(financingUpdateSchema.safeParse(valid).success).toBe(true);
    expect(financingUpdateSchema.safeParse({ ...valid, expectedUpdatedAt: undefined }).success).toBe(false);
    expect(financingUpdateSchema.safeParse({ ...valid, pendingInstallments: [{ id: "no-uuid", dueDate: "2026-10-31", amountUsd: "25.00" }] }).success).toBe(false);
    expect(financingUpdateSchema.safeParse({ ...valid, pendingInstallments: [] }).success).toBe(true);
  });

  it("annulSchema limita el motivo a 500 caracteres", () => {
    expect(annulSchema.safeParse({ expectedUpdatedAt }).success).toBe(true);
    expect(annulSchema.safeParse({ reason: "a".repeat(500), expectedUpdatedAt }).success).toBe(true);
    expect(annulSchema.safeParse({ reason: "a".repeat(501), expectedUpdatedAt }).success).toBe(false);
    const parsed = annulSchema.parse({ reason: "  ", expectedUpdatedAt });
    expect(parsed.reason).toBeNull();
    expect(annulSchema.safeParse({}).success).toBe(false);
  });

  it("restoreSchema y deleteSchema exigen la versión", () => {
    expect(restoreSchema.safeParse({ expectedUpdatedAt }).success).toBe(true);
    expect(restoreSchema.safeParse({}).success).toBe(false);
    expect(deleteSchema.safeParse({ expectedUpdatedAt }).success).toBe(true);
    expect(deleteSchema.safeParse({}).success).toBe(false);
  });
});
