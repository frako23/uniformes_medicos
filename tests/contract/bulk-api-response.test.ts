import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MAX_DETAILED_CHANGES, toBulkApplyResponse, toBulkPreviewResponse } from "../../src/server/bulk/response";
import { groupIssues } from "../../src/server/bulk/issues";
import {
  buildClientChangeSet,
  createClientSnapshot,
  type SnapshotClient,
} from "../../src/server/clients/bulk/changes";
import { CLIENT_COLUMNS, type ClientColumnKey } from "../../src/server/clients/bulk/format";
import { parseClientRow } from "../../src/server/clients/bulk/rows";
import { readSectionSheet } from "../../src/server/bulk/sheet";
import { CLIENTS_MAX_ROWS } from "../../src/server/clients/bulk/format";
import { buildWorkbookBuffer } from "../fixtures/bulk/workbook-builder";
import { buildReferenceIndex } from "../../src/server/reference/values";
import {
  buildFinancingChangeSet,
  createFinancingSnapshot,
} from "../../src/server/financing/bulk/changes";
import { buildCongressChangeSet, createCongressSnapshot } from "../../src/server/congresses/bulk/changes";
import { CONGRESS_COLUMNS } from "../../src/server/congresses/bulk/format";
import { parseCongressRow } from "../../src/server/congresses/bulk/rows";
import { FINANCING_COLUMNS } from "../../src/server/financing/bulk/format";
import { parseFinancingRow } from "../../src/server/financing/bulk/rows";

/* Esquemas equivalentes a BulkPreviewResponse y BulkApplyResponse de contracts/admin-api.md. */
const issueSchema = z.object({
  severity: z.enum(["error", "warning", "notice"]),
  code: z.string(),
  column: z.string().nullable(),
  message: z.string(),
  rows: z.array(z.string().regex(/^\d+(-\d+)?$/)),
  count: z.number().int().positive(),
});

const scheduleSchema = z.object({
  purchaseDate: z.string(),
  frequency: z.enum(["semanal", "quincenal", "mensual"]),
  totalUsd: z.string(),
  initial: z.object({ amountUsd: z.string(), dueDate: z.string(), paid: z.boolean() }).nullable(),
  installments: z.object({
    count: z.number().int(),
    regularAmountUsd: z.string(),
    lastAmountUsd: z.string(),
    firstDue: z.string(),
    lastDue: z.string(),
    paidCount: z.number().int(),
  }),
});

const changeSchema = z.object({
  row: z.number().int().min(2),
  action: z.enum(["create", "update"]),
  ref: z.number().int().nullable(),
  matchedBy: z.enum(["identificador", "celular"]).nullable(),
  label: z.string(),
  fields: z.array(z.object({ field: z.string(), label: z.string(), from: z.string().nullable(), to: z.string().nullable() })),
  schedule: scheduleSchema.optional(),
  warnings: z.array(z.string()),
});

export const previewSchema = z.object({
  status: z.enum(["ready", "invalid", "no_changes"]),
  section: z.enum(["clientes", "financiamientos", "congresos"]),
  file: z.object({
    name: z.string(),
    kind: z.enum(["plantilla", "datos", "desconocido"]),
    sheet: z.string(),
    generatedAt: z.string().nullable(),
    rows: z.number().int(),
  }),
  summary: z.object({
    created: z.number().int(),
    updated: z.number().int(),
    unchanged: z.number().int(),
    errors: z.number().int(),
    warnings: z.number().int(),
    installments: z.number().int().optional(),
    financedUsd: z.string().optional(),
    outstandingUsd: z.string().optional(),
  }),
  issues: z.array(issueSchema),
  changes: z.array(changeSchema),
  omittedChanges: z.number().int().min(0),
  preview: z.object({ token: z.string(), expiresAt: z.string().datetime() }).nullable(),
});

export const applySchema = z.object({
  status: z.literal("applied"),
  section: z.enum(["clientes", "financiamientos", "congresos"]),
  appliedAt: z.string().datetime(),
  summary: z.object({ created: z.number().int(), updated: z.number().int(), installments: z.number().int().optional() }),
  created: z.array(z.object({ ref: z.number().int(), label: z.string(), url: z.string().startsWith("/admin/") })),
  updated: z.array(z.object({ ref: z.number().int(), label: z.string(), url: z.string().startsWith("/admin/") })),
});

const HEADERS = Object.fromEntries(CLIENT_COLUMNS.map((column) => [column.key, column.header])) as Record<ClientColumnKey, string>;

function existing(ref: number, input: Partial<SnapshotClient> = {}): SnapshotClient {
  return {
    id: `id-${ref}`,
    ref,
    name: `Cliente ${ref}`,
    phoneE164: `+5841400000${String(ref).padStart(2, "0")}`,
    sex: null,
    size: "M",
    city: null,
    hospital: null,
    clinic: null,
    specialty: null,
    notes: null,
    updatedAt: new Date("2026-10-10T00:00:00Z"),
    ...input,
  };
}

function clientRows(keys: ClientColumnKey[], cells: Array<Array<string | number | null>>) {
  const columns = keys.map((key, index) => ({ key, header: HEADERS[key], index }));
  return cells.map((row, index) => parseClientRow(row, columns, index + 2));
}

const respond = (rows: ReturnType<typeof clientRows>, snapshot = createClientSnapshot([], buildReferenceIndex([])), token = true) => {
  const changeSet = buildClientChangeSet({ rows, workbook: { generatedAt: null }, snapshot });
  return toBulkPreviewResponse({
    section: "clientes",
    status: changeSet.status,
    fileName: "clientes.xlsx",
    workbook: { kind: "datos", sheetName: "Clientes", generatedAt: null },
    rowCount: rows.length,
    counts: changeSet.counts,
    issues: changeSet.issues,
    changes: changeSet.changes,
    token: token && changeSet.status === "ready" ? { token: "firma", expiresAt: Date.parse("2026-10-18T15:00:00Z") } : null,
  });
};

describe("BulkPreviewResponse de clientes", () => {
  it("cumple el contrato y solo trae preview en ready", () => {
    const ready = respond(clientRows(["name", "phone"], [["Ana", "4141234567"]]));
    expect(previewSchema.parse(ready).preview).toEqual({ token: "firma", expiresAt: "2026-10-18T15:00:00.000Z" });

    const invalid = respond(clientRows(["name", "phone"], [["Ana", "123"]]));
    expect(previewSchema.parse(invalid)).toMatchObject({ status: "invalid", preview: null, changes: [] });

    const same = respond(
      clientRows(["name", "phone"], [["Cliente 1", "4140000001"]]),
      createClientSnapshot([existing(1)], buildReferenceIndex([])),
    );
    expect(previewSchema.parse(same)).toMatchObject({ status: "no_changes", preview: null });
  });

  it("cada cambio trae matchedBy y los datos que se borrarán llevan to: null", () => {
    const snapshot = createClientSnapshot([existing(1, { city: "Caracas" }), existing(2)], buildReferenceIndex([{ field: "city", value: "Caracas", count: 1 }]));
    const response = respond(
      clientRows(
        ["name", "phone", "city", "id"],
        [
          ["Cliente 1", "4140000001", "", 1],
          ["Dos", "4140000002", "", null],
          ["Nueva", "4149999999", "Caracas", null],
        ],
      ),
      snapshot,
    );
    const parsed = previewSchema.parse(response);
    expect(parsed.changes.map((change) => change.matchedBy)).toEqual(["identificador", "celular", null]);
    expect(parsed.changes[0].fields).toEqual([{ field: "city", label: "Ciudad", from: "Caracas", to: null }]);
    // El orden de las filas se conserva.
    expect(parsed.changes.map((change) => change.row)).toEqual([2, 3, 4]);
  });

  it("agrupa las filas en rangos de texto", () => {
    const issues = groupIssues([2, 3, 4, 9].map((row) => ({ severity: "error" as const, code: "REQUIRED", column: "Nombre", message: "x", row })));
    expect(issueSchema.parse(issues[0]).rows).toEqual(["2-4", "9"]);
  });

  it("la respuesta con 10.000 altas ocupa menos de 4 MB", () => {
    const cells = Array.from({ length: 10_000 }, (_, index) => [
      `Cliente número ${index} con un nombre bastante largo`,
      String(4_140_000_000 + index),
      "Mujer",
      "M",
      "Caracas",
      "Hospital Universitario de Caracas",
      "Clínica Santa Sofía",
      "Medicina Interna",
      "Notas de ejemplo para este cliente",
    ]);
    const response = respond(
      clientRows(["name", "phone", "sex", "size", "city", "hospital", "clinic", "specialty", "notes"], cells),
    );
    const parsed = previewSchema.parse(response);
    expect(parsed.summary.created).toBe(10_000);
    expect(parsed.changes).toHaveLength(MAX_DETAILED_CHANGES);
    expect(parsed.omittedChanges).toBe(10_000 - MAX_DETAILED_CHANGES);
    expect(Buffer.byteLength(JSON.stringify(parsed))).toBeLessThan(4 * 1024 * 1024);
  });
});

describe("BulkApplyResponse", () => {
  it("cumple el contrato", () => {
    const response = toBulkApplyResponse({
      section: "clientes",
      appliedAt: new Date("2026-10-18T14:00:00Z"),
      summary: { created: 1, updated: 1 },
      created: [{ ref: 5, label: "Ana · 0414-123-4567", url: "/admin/clientes/5" }],
      updated: [{ ref: 1, label: "Luis · 0424-765-4321", url: "/admin/clientes/1" }],
    });
    expect(applySchema.parse(response).status).toBe("applied");
  });
});

describe("BulkPreviewResponse de financiamientos", () => {
  const columns = FINANCING_COLUMNS.map((column, index) => ({ key: column.key, header: column.header, index }));
  const snapshot = createFinancingSnapshot(
    Array.from({ length: 2_000 }, (_, index) => ({
      id: `c${index}`,
      ref: index + 1,
      name: `Cliente ${index}`,
      phoneE164: `+58414${String(1_000_000 + index).slice(-7)}`,
    })),
    [],
  );
  const respond = (rows: Array<Array<string | number | null>>) => {
    const parsed = rows.map((cells, index) => parseFinancingRow(cells, columns, index + 2, "2026-10-18"));
    const changeSet = buildFinancingChangeSet({ rows: parsed, workbook: { generatedAt: null }, snapshot });
    return toBulkPreviewResponse({
      section: "financiamientos",
      status: changeSet.status,
      fileName: "financiamientos.xlsx",
      workbook: { kind: "plantilla", sheetName: "Financiamientos", generatedAt: null },
      rowCount: rows.length,
      counts: changeSet.counts,
      extraSummary: changeSet.extraSummary,
      issues: changeSet.issues,
      changes: changeSet.changes,
      token: changeSet.status === "ready" ? { token: "firma", expiresAt: Date.parse("2026-10-18T15:00:00Z") } : null,
    });
  };

  it("cada cambio trae schedule y el resumen trae cuotas, monto financiado y saldo", () => {
    const response = respond([["4141000000", "Cliente 0", "Dos conjuntos", "01/09/2026", 120, 20, 4, "Quincenal", "15/09/2026", 3]]);
    const parsed = previewSchema.parse(response);
    expect(parsed.changes[0].schedule).toMatchObject({ totalUsd: "120.00", initial: { paid: true }, installments: { count: 4, paidCount: 2 } });
    expect(parsed.summary).toMatchObject({ created: 1, installments: 5, financedUsd: "120.00", outstandingUsd: "50.00" });
  });

  it("la vista previa de 2.000 filas con 48 cuotas e inicial ocupa menos de 4 MB", () => {
    const rows = Array.from({ length: 2_000 }, (_, index) => [
      `414${String(1_000_000 + index).slice(-7)}`,
      `Cliente ${index}`,
      "Uniformes quirúrgicos y batas para consulta, con bordado",
      "01/01/2026",
      4_800,
      100,
      48,
      "Semanal",
      null,
      10,
    ]);
    const parsed = previewSchema.parse(respond(rows));
    expect(parsed.summary.created).toBe(2_000);
    expect(Buffer.byteLength(JSON.stringify(parsed))).toBeLessThan(4 * 1024 * 1024);
  });
});

describe("BulkPreviewResponse de congresos", () => {
  it("la vista previa de 10.000 altas ocupa menos de 4 MB", () => {
    const columns = CONGRESS_COLUMNS.map((column, index) => ({ key: column.key, header: column.header, index }));
    const rows = Array.from({ length: 10_000 }, (_, index) =>
      parseCongressRow(
        ["30/10/2031", "01/11/2031", "Medicina Interna", "Hotel Eurobuilding Caracas", `Congreso Venezolano número ${index}`, "Notas del congreso para la prueba", null],
        columns,
        index + 2,
      ),
    );
    const changeSet = buildCongressChangeSet({
      rows,
      workbook: { generatedAt: null },
      snapshot: createCongressSnapshot([], buildReferenceIndex([])),
      today: "2026-10-18",
    });
    const response = toBulkPreviewResponse({
      section: "congresos",
      status: changeSet.status,
      fileName: "congresos.xlsx",
      workbook: { kind: "datos", sheetName: "Congresos", generatedAt: null },
      rowCount: rows.length,
      counts: changeSet.counts,
      issues: changeSet.issues,
      changes: changeSet.changes,
      token: { token: "firma", expiresAt: Date.parse("2026-10-18T15:00:00Z") },
    });
    const parsed = previewSchema.parse(response);
    expect(parsed.summary.created).toBe(10_000);
    expect(Buffer.byteLength(JSON.stringify(parsed))).toBeLessThan(4 * 1024 * 1024);
  });
});

describe("tiempo de la vista previa (SC-007)", () => {
  it("leer el archivo y calcular los cambios de 5.000 clientes tarda menos de 10 s", async () => {
    const rows = [["Nombre", "Celular", "Ciudad"], ...Array.from({ length: 5_000 }, (_, index) => [`Cliente ${index}`, String(4_140_000_000 + index), "Caracas"])];
    const bytes = await buildWorkbookBuffer([{ name: "Clientes", rows }]);
    const started = performance.now();
    const read = await readSectionSheet({ fileName: "c.xlsx", bytes, sectionLabel: "Clientes", columns: CLIENT_COLUMNS, idKey: "id", maxRows: CLIENTS_MAX_ROWS });
    const parsed = read.rows.map((row) => parseClientRow(row.cells, read.columns, row.excelRow));
    const set = buildClientChangeSet({ rows: parsed, workbook: { generatedAt: null }, snapshot: createClientSnapshot([], buildReferenceIndex([])) });
    expect(set.counts.created).toBe(5_000);
    expect(performance.now() - started).toBeLessThan(10_000);
  }, 30_000);

  it("y los de 5.000 congresos", async () => {
    const rows = [["Desde", "Hasta", "Nombre"], ...Array.from({ length: 5_000 }, (_, index) => ["10/11/2031", "12/11/2031", `Congreso ${index}`])];
    const bytes = await buildWorkbookBuffer([{ name: "Congresos", rows }]);
    const started = performance.now();
    const read = await readSectionSheet({ fileName: "c.xlsx", bytes, sectionLabel: "Congresos", columns: CONGRESS_COLUMNS, idKey: "id", maxRows: 10_000 });
    const parsed = read.rows.map((row) => parseCongressRow(row.cells, read.columns, row.excelRow));
    const set = buildCongressChangeSet({ rows: parsed, workbook: { generatedAt: null }, snapshot: createCongressSnapshot([], buildReferenceIndex([])), today: "2026-10-18" });
    expect(set.counts.created).toBe(5_000);
    expect(performance.now() - started).toBeLessThan(10_000);
  }, 30_000);
});
