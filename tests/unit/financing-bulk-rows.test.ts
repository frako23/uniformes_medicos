import { describe, expect, it } from "vitest";
import type { SheetColumn } from "../../src/server/bulk/sheet";
import { FINANCING_COLUMNS, type FinancingColumnKey } from "../../src/server/financing/bulk/format";
import { parseFinancingRow } from "../../src/server/financing/bulk/rows";

const TODAY = "2026-10-18";
const KEYS = FINANCING_COLUMNS.map((column) => column.key);
const columns: SheetColumn<FinancingColumnKey>[] = FINANCING_COLUMNS.map((column, index) => ({
  key: column.key,
  header: column.header,
  index,
}));

type Cells = Partial<Record<FinancingColumnKey, string | number | Date | boolean | null>>;
const base: Cells = {
  phone: "4141234567",
  clientName: "Ana",
  description: "Dos conjuntos",
  purchaseDate: "18/10/2026",
  total: 100,
  count: 4,
};
const parse = (overrides: Cells = {}) => {
  const merged = { ...base, ...overrides };
  return parseFinancingRow(
    KEYS.map((key) => merged[key] ?? null),
    columns,
    7,
    TODAY,
  );
};
const codes = (overrides: Cells = {}) => parse(overrides).issues.map((issue) => issue.code);

describe("parseFinancingRow", () => {
  it("interpreta una fila válida con los valores por defecto", () => {
    const row = parse();
    expect(row.issues).toEqual([]);
    expect(row).toMatchObject({
      clientPhoneE164: "+584141234567",
      description: "Dos conjuntos",
      purchaseDate: "2026-10-18",
      totalCents: 10_000,
      initialCents: 0,
      count: 4,
      frequency: "quincenal",
      firstDueDate: "2026-10-31",
      paidCount: 0,
    });
  });

  it("celular del cliente", () => {
    expect(codes({ phone: "" })).toEqual(["REQUIRED"]);
    expect(codes({ phone: "123" })).toEqual(["INVALID_PHONE"]);
  });

  it("descripción", () => {
    expect(codes({ description: "a".repeat(501) })).toEqual(["TOO_LONG"]);
    expect(codes({ description: "" })).toEqual(["REQUIRED"]);
  });

  it("fecha de compra", () => {
    expect(codes({ purchaseDate: "31/02/2026" })).toEqual(["INVALID_DATE"]);
    expect(codes({ purchaseDate: "19/10/2026" })).toEqual(["FUTURE_PURCHASE_DATE"]);
    expect(codes({ purchaseDate: new Date("2026-10-01T00:00:00Z") })).toEqual([]);
    expect(codes({ purchaseDate: null })).toEqual(["REQUIRED"]);
  });

  it("monto total", () => {
    expect(codes({ total: "$100" })).toEqual(["INVALID_AMOUNT"]);
    expect(codes({ total: 0 })).toEqual(["INVALID_AMOUNT"]);
    expect(codes({ total: "10,123" })).toEqual(["AMOUNT_DECIMALS"]);
    expect(codes({ total: 10_000_000_000 })).toEqual(["AMOUNT_TOO_HIGH"]);
    expect(codes({ total: null })).toEqual(["REQUIRED"]);
  });

  it("inicial", () => {
    expect(parse({ initial: 20 }).initialCents).toBe(2000);
    expect(codes({ initial: 100 })).toEqual(["INITIAL_TOO_HIGH"]);
    expect(codes({ initial: 150 })).toEqual(["INITIAL_TOO_HIGH"]);
    expect(codes({ initial: 0 })).toEqual([]);
  });

  it("número de cuotas", () => {
    expect(codes({ count: 0 })).toEqual(["INVALID_INSTALLMENT_COUNT"]);
    expect(codes({ count: 49 })).toEqual(["INVALID_INSTALLMENT_COUNT"]);
    expect(codes({ count: 2.5 })).toEqual(["INVALID_INSTALLMENT_COUNT"]);
    expect(codes({ count: 48 })).toEqual([]);
    expect(codes({ count: null })).toEqual(["REQUIRED"]);
  });

  it("frecuencia", () => {
    expect(parse({ frequency: "" }).frequency).toBe("quincenal");
    expect(parse({ frequency: " SEMANAL " }).frequency).toBe("semanal");
    expect(codes({ frequency: "diaria" })).toEqual(["INVALID_FREQUENCY"]);
  });

  it("fecha de la primera cuota", () => {
    expect(codes({ firstDue: "01/10/2026" })).toEqual(["FIRST_DUE_BEFORE_PURCHASE"]);
    expect(parse({ firstDue: "15/11/2026" }).firstDueDate).toBe("2026-11-15");
    expect(parse({ firstDue: "" , frequency: "semanal" }).firstDueDate).toBe("2026-10-25");
  });

  it("cuotas pagadas", () => {
    expect(parse({ paid: "" }).paidCount).toBe(0);
    expect(codes({ paid: -1 })).toEqual(["INVALID_PAID_COUNT"]);
    expect(codes({ paid: 1.5 })).toEqual(["INVALID_PAID_COUNT"]);
    expect(codes({ paid: 4 })).toEqual([]);
    expect(codes({ paid: 5 })).toEqual(["PAID_COUNT_TOO_HIGH"]);
    expect(codes({ paid: 5, initial: 20 })).toEqual([]);
    expect(codes({ paid: 6, initial: 20 })).toEqual(["PAID_COUNT_TOO_HIGH"]);
  });

  it("acepta el alias Celular y avisa el nombre escrito", () => {
    const aliasColumns = columns.map((column) => (column.key === "phone" ? { ...column, header: "Celular" } : column));
    const row = parseFinancingRow(KEYS.map((key) => ({ ...base })[key] ?? null), aliasColumns, 7, TODAY);
    expect(row.clientNameWritten).toBe("Ana");
  });
});
