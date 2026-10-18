import { describe, expect, it } from "vitest";
import type { SheetColumn } from "../../src/server/bulk/sheet";
import {
  buildFinancingChangeSet,
  createFinancingSnapshot,
  type FinancingSnapshot,
} from "../../src/server/financing/bulk/changes";
import { FINANCING_COLUMNS, type FinancingColumnKey } from "../../src/server/financing/bulk/format";
import { parseFinancingRow, type ParsedFinancingRow } from "../../src/server/financing/bulk/rows";

const TODAY = "2026-10-18";
const KEYS = FINANCING_COLUMNS.map((column) => column.key);
const columns: SheetColumn<FinancingColumnKey>[] = FINANCING_COLUMNS.map((column, index) => ({ key: column.key, header: column.header, index }));
type Cells = Partial<Record<FinancingColumnKey, string | number | null>>;

const rowsOf = (...inputs: Cells[]): ParsedFinancingRow[] =>
  inputs.map((input, index) =>
    parseFinancingRow(KEYS.map((key) => input[key] ?? null), columns, index + 2, TODAY),
  );

const clients = [
  { id: "c1", ref: 1, name: "Ana Pérez", phoneE164: "+584141234567" },
  { id: "c2", ref: 2, name: "Luis Gómez", phoneE164: "+584247654321" },
];
const snap = (financings: Array<{ ref: number; clientId: string; purchaseDate: string; totalCents: number }> = []): FinancingSnapshot =>
  createFinancingSnapshot(clients, financings);
const run = (rows: ParsedFinancingRow[], snapshot = snap()) => buildFinancingChangeSet({ rows, workbook: { generatedAt: null }, snapshot });
const codes = (set: ReturnType<typeof run>) => set.issues.map((issue) => issue.code);

const row1: Cells = { phone: "0414-123-4567", clientName: "Ana Pérez", description: "2 conjuntos talla M", purchaseDate: "18/10/2026", total: 100, count: 4 };
const row2: Cells = {
  phone: "0424-765-4321",
  clientName: "Luis Gómez",
  description: "Bata y conjunto",
  purchaseDate: "01/09/2026",
  total: 120,
  initial: 20,
  count: 4,
  frequency: "Quincenal",
  firstDue: "15/09/2026",
  paid: 3,
};

describe("cliente", () => {
  it("un celular sin cliente da CLIENT_NOT_FOUND", () => {
    const set = run(rowsOf({ ...row1, phone: "4149999999" }));
    expect(codes(set)).toEqual(["CLIENT_NOT_FOUND"]);
    expect(set.status).toBe("invalid");
  });
  it("un nombre distinto da CLIENT_NAME_MISMATCH, sin impedir confirmar", () => {
    const set = run(rowsOf({ ...row1, clientName: "Otra Persona" }));
    expect(set.issues[0]).toMatchObject({ code: "CLIENT_NAME_MISMATCH", severity: "warning" });
    expect(set.issues[0].message).toBe("El celular pertenece a “Ana Pérez”, no a “Otra Persona”. Revisa que el celular sea correcto.");
    expect(set.status).toBe("ready");
    expect(run(rowsOf({ ...row1, clientName: "ana PEREZ" })).issues).toEqual([]);
  });
});

describe("duplicados", () => {
  it("POSSIBLE_DUPLICATE contra un financiamiento existente", () => {
    const set = run(rowsOf(row1), snap([{ ref: 9, clientId: "c1", purchaseDate: "2026-10-18", totalCents: 10_000 }]));
    expect(set.issues[0].message).toBe("Parece repetido: mismo cliente, fecha de compra y monto total que financiamiento #9.");
    expect(set.status).toBe("ready");
  });
  it("POSSIBLE_DUPLICATE contra otra fila del archivo", () => {
    const set = run(rowsOf(row1, row2, row1));
    expect(set.issues.map((issue) => [issue.code, issue.message])).toEqual([
      ["POSSIBLE_DUPLICATE", "Parece repetido: mismo cliente, fecha de compra y monto total que la fila 2."],
    ]);
    expect(set.issues[0].rows).toEqual(["4"]);
  });
});

describe("calendario", () => {
  it("coincide con generateSchedule y todas las filas son altas", () => {
    const set = run(rowsOf(row1));
    expect(set.counts).toEqual({ created: 1, updated: 0, unchanged: 0 });
    expect(set.drafts[0].installments.map((item) => [item.dueDate, item.amountCents, item.paid])).toEqual([
      ["2026-10-31", 2500, false],
      ["2026-11-15", 2500, false],
      ["2026-11-30", 2500, false],
      ["2026-12-15", 2500, false],
    ]);
    expect(set.changes[0]).toMatchObject({ action: "create", ref: null });
  });
  it("la fila 3 del ejemplo deja pagadas la inicial y las cuotas del 15/09 y del 30/09", () => {
    const set = run(rowsOf(row2));
    const items = set.drafts[0].installments;
    expect(items.map((item) => [item.isInitial ? "Inicial" : item.dueDate, item.amountCents, item.paid])).toEqual([
      ["Inicial", 2000, true],
      ["2026-09-15", 2500, true],
      ["2026-09-30", 2500, true],
      ["2026-10-15", 2500, false],
      ["2026-10-31", 2500, false],
    ]);
  });
});

describe("resumen", () => {
  it("el FinancingScheduleSummary y los conteos son correctos", () => {
    const set = run(rowsOf(row1, row2));
    expect(set.changes[1].schedule).toEqual({
      purchaseDate: "2026-09-01",
      frequency: "quincenal",
      totalUsd: "120.00",
      initial: { amountUsd: "20.00", dueDate: "2026-09-01", paid: true },
      installments: { count: 4, regularAmountUsd: "25.00", lastAmountUsd: "25.00", firstDue: "2026-09-15", lastDue: "2026-10-31", paidCount: 2 },
    });
    expect(set.extraSummary).toEqual({ installments: 9, financedUsd: "220.00", outstandingUsd: "150.00" });
  });
});

describe("línea base", () => {
  it("cambia si cambia el marcador", () => {
    const base = run(rowsOf(row1)).baseline;
    expect(run(rowsOf(row1), snap([{ ref: 3, clientId: "c2", purchaseDate: "2020-01-01", totalCents: 1 }])).baseline).not.toBe(base);
    expect(run(rowsOf(row1)).baseline).toBe(base);
  });
});
