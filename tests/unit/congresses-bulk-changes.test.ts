import { describe, expect, it } from "vitest";
import type { SheetColumn } from "../../src/server/bulk/sheet";
import { buildReferenceIndex } from "../../src/server/reference/values";
import {
  buildCongressChangeSet,
  createCongressSnapshot,
  type CongressChangeSet,
  type CongressSnapshot,
  type SnapshotCongress,
} from "../../src/server/congresses/bulk/changes";
import { CONGRESS_COLUMNS, type CongressColumnKey } from "../../src/server/congresses/bulk/format";
import { parseCongressRow, type ParsedCongressRow } from "../../src/server/congresses/bulk/rows";

const TODAY = "2026-10-18";
const UPDATED = new Date("2026-10-10T12:00:00Z");
const HEADERS = Object.fromEntries(CONGRESS_COLUMNS.map((column) => [column.key, column.header])) as Record<CongressColumnKey, string>;

function existing(ref: number, input: Partial<SnapshotCongress> = {}): SnapshotCongress {
  return { id: `id-${ref}`, ref, name: `Congreso ${ref}`, startDate: "2026-11-10", endDate: "2026-11-12", venue: null, specialty: null, notes: null, updatedAt: UPDATED, ...input };
}
const snapshotOf = (congresses: SnapshotCongress[]): CongressSnapshot =>
  createCongressSnapshot(
    congresses,
    buildReferenceIndex(congresses.flatMap((item) => (item.specialty ? [{ field: "specialty" as const, value: item.specialty, count: 1 }] : []))),
  );

type Cells = Partial<Record<CongressColumnKey, string | number | Date | null>>;
function rowsOf(...inputs: Cells[]): ParsedCongressRow[] {
  const keys = [...new Set(inputs.flatMap((input) => Object.keys(input)))] as CongressColumnKey[];
  const columns: SheetColumn<CongressColumnKey>[] = keys.map((key, index) => ({ key, header: HEADERS[key], index }));
  return inputs.map((input, index) => parseCongressRow(keys.map((key) => input[key] ?? null), columns, index + 2));
}
const run = (rows: ParsedCongressRow[], snapshot = snapshotOf([]), generatedAt: Date | null = null): CongressChangeSet =>
  buildCongressChangeSet({ rows, workbook: { generatedAt }, snapshot, today: TODAY });
const codes = (set: CongressChangeSet) => set.issues.map((issue) => issue.code);

describe("errores", () => {
  it("Desde, Hasta y Nombre vacíos dan REQUIRED", () => {
    const set = run(rowsOf({ from: null, to: null, name: null }));
    expect(set.issues.filter((issue) => issue.code === "REQUIRED").map((issue) => issue.column).sort()).toEqual(["Desde", "Hasta", "Nombre"]);
    expect(set.status).toBe("invalid");
  });
  it("las fechas inválidas dan INVALID_DATE y Hasta anterior a Desde, END_BEFORE_START", () => {
    expect(codes(run(rowsOf({ from: "31/02/2026", to: "01/11/2026", name: "X" })))).toEqual(["INVALID_DATE"]);
    const set = run(rowsOf({ from: "05/11/2026", to: "01/11/2026", name: "X" }));
    expect(set.issues[0]).toMatchObject({ code: "END_BEFORE_START", message: "La fecha Hasta no puede ser anterior a Desde." });
  });
  it("INVALID_ID, UNKNOWN_ID y DUPLICATE_ID", () => {
    const base = { from: "10/11/2026", to: "12/11/2026", name: "X" };
    expect(codes(run(rowsOf({ ...base, id: "abc" })))).toEqual(["INVALID_ID"]);
    expect(codes(run(rowsOf({ ...base, id: 99 })))).toEqual(["UNKNOWN_ID"]);
    const duplicate = run(rowsOf({ ...base, id: 1 }, { ...base, id: 1 }), snapshotOf([existing(1)]));
    expect(duplicate.issues.find((issue) => issue.code === "DUPLICATE_ID")).toMatchObject({ rows: ["2-3"], count: 2 });
  });
});

describe("celdas vacías", () => {
  it("en una fila con Identificador, una celda opcional vacía borra el dato", () => {
    const snapshot = snapshotOf([existing(1, { venue: "Hotel", notes: "n" })]);
    const set = run(rowsOf({ from: "10/11/2026", to: "12/11/2026", name: "Congreso 1", venue: "", id: 1 }), snapshot);
    expect(set.changes[0].fields).toEqual([{ field: "venue", label: "Lugar", from: "Hotel", to: null }]);
    expect(set.writes.updates[0].values).toMatchObject({ venue: null, notes: "n" });
  });
  it("las columnas ausentes no cambian", () => {
    const snapshot = snapshotOf([existing(1, { venue: "Hotel" })]);
    const set = run(rowsOf({ from: "10/11/2026", to: "13/11/2026", name: "Congreso 1", id: 1 }), snapshot);
    expect(set.writes.updates[0].values.venue).toBe("Hotel");
    expect(set.changes[0].fields.map((field) => field.field)).toEqual(["to"]);
  });
});

describe("advertencias", () => {
  it("POSSIBLE_DUPLICATE contra congresos existentes y del archivo", () => {
    const snapshot = snapshotOf([existing(7, { name: "Congreso de Cardiología", startDate: "2026-11-20", endDate: "2026-11-21" })]);
    const set = run(
      rowsOf(
        { from: "20/11/2026", to: "21/11/2026", name: "congreso de cardiologia" },
        { from: "05/12/2026", to: "06/12/2026", name: "Otro" },
        { from: "05/12/2026", to: "07/12/2026", name: "OTRO" },
      ),
      snapshot,
    );
    expect(set.issues.filter((issue) => issue.code === "POSSIBLE_DUPLICATE").map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Parece repetido: mismo nombre y fecha de inicio que congreso #7.",
        "Parece repetido: mismo nombre y fecha de inicio que la fila 3.",
      ]),
    );
    expect(set.status).toBe("ready");
  });
  it("LONG_EVENT con más de 31 días y ALREADY_ENDED", () => {
    const set = run(rowsOf({ from: "01/11/2026", to: "05/12/2026", name: "Largo" }, { from: "01/09/2026", to: "02/09/2026", name: "Pasado" }));
    expect(set.issues.find((issue) => issue.code === "LONG_EVENT")?.message).toBe("El congreso dura 35 días. Revisa las fechas.");
    expect(codes(set)).toContain("ALREADY_ENDED");
  });
  it("NEW_VALUE en la especialidad y MODIFIED_AFTER_DOWNLOAD", () => {
    const snapshot = snapshotOf([existing(1, { specialty: "Mastología" })]);
    const nuevo = run(rowsOf({ from: "10/11/2026", to: "12/11/2026", name: "A", specialty: "mastologia" }, { from: "10/11/2026", to: "12/11/2026", name: "B", specialty: "Cirugía" }), snapshot);
    expect(nuevo.issues.filter((issue) => issue.code === "NEW_VALUE")).toHaveLength(1);
    expect(nuevo.writes.creates[0].values.specialty).toBe("Mastología");
    const edited = rowsOf({ from: "10/11/2026", to: "13/11/2026", name: "Congreso 1", id: 1 });
    expect(codes(run(edited, snapshot, new Date("2026-10-09T00:00:00Z")))).toContain("MODIFIED_AFTER_DOWNLOAD");
    expect(codes(run(edited, snapshot, new Date("2026-10-11T00:00:00Z")))).not.toContain("MODIFIED_AFTER_DOWNLOAD");
  });
});

describe("resultado", () => {
  it("la etiqueta, la línea base y la idempotencia", () => {
    const snapshot = snapshotOf([existing(1)]);
    const rows = () => rowsOf({ from: "30/10/2026", to: "01/11/2026", name: "Nuevo", specialty: "Mastología" }, { from: "10/11/2026", to: "12/11/2026", name: "Congreso 1", venue: "Hotel", id: 1 });
    const first = run(rows(), snapshot);
    expect(first.changes[0].label).toBe("Nuevo · 30/10/2026 – 01/11/2026");
    expect(first.baseline).toMatch(/^[0-9a-f]{64}$/);
    expect(first.baseline).not.toBe(run(rows(), snapshotOf([existing(1), existing(2)])).baseline);

    const updated = snapshot.congresses.map((item) => {
      const write = first.writes.updates.find((update) => update.ref === item.ref);
      return write ? { ...item, ...write.values, updatedAt: new Date("2026-10-18T00:00:00Z") } : item;
    });
    const created = first.writes.creates.map((write, index) => ({ id: `n${index}`, ref: 10 + index, ...write.values, updatedAt: new Date("2026-10-18T00:00:00Z") }));
    const second = run(rows(), snapshotOf([...updated, ...created]));
    // La fila sin Identificador crea otro congreso con el mismo nombre: solo la editada queda sin cambios.
    expect(second.counts.unchanged).toBe(1);
    expect(second.writes.updates).toHaveLength(0);
  });
});
