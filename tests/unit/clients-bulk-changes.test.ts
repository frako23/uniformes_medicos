import { describe, expect, it } from "vitest";
import { buildReferenceIndex } from "../../src/server/reference/values";
import {
  buildClientChangeSet,
  createClientSnapshot,
  type ClientChangeSet,
  type ClientSnapshot,
  type ClientWriteValues,
  type SnapshotClient,
} from "../../src/server/clients/bulk/changes";
import { CLIENT_COLUMNS, type ClientColumnKey } from "../../src/server/clients/bulk/format";
import { parseClientRow, type ParsedClientRow } from "../../src/server/clients/bulk/rows";
import type { SheetColumn } from "../../src/server/bulk/sheet";

const UPDATED = new Date("2026-10-10T12:00:00Z");

function client(ref: number, input: Partial<SnapshotClient> = {}): SnapshotClient {
  return {
    id: `id-${ref}`,
    ref,
    name: `Cliente ${ref}`,
    phoneE164: `+58414000000${ref}`,
    sex: null,
    size: null,
    city: null,
    hospital: null,
    clinic: null,
    specialty: null,
    notes: null,
    updatedAt: UPDATED,
    ...input,
  };
}

function snapshotOf(clients: SnapshotClient[]): ClientSnapshot {
  const rows = clients.flatMap((item) =>
    (["size", "city", "hospital", "clinic", "specialty"] as const).flatMap((field) =>
      item[field] ? [{ field, value: item[field]!, count: 1 }] : [],
    ),
  );
  return createClientSnapshot(clients, buildReferenceIndex(rows));
}

const HEADERS = Object.fromEntries(CLIENT_COLUMNS.map((column) => [column.key, column.header])) as Record<ClientColumnKey, string>;

/** Construye filas como las leería el servidor: las columnas son las claves de la primera fila. */
function rowsOf(...inputs: Array<Partial<Record<ClientColumnKey, string | number | null>>>): ParsedClientRow[] {
  const keys = [...new Set(inputs.flatMap((input) => Object.keys(input)))] as ClientColumnKey[];
  const columns: SheetColumn<ClientColumnKey>[] = keys.map((key, index) => ({ key, header: HEADERS[key], index }));
  return inputs.map((input, index) =>
    parseClientRow(
      keys.map((key) => input[key] ?? null),
      columns,
      index + 2,
    ),
  );
}

const run = (rows: ParsedClientRow[], snapshot: ClientSnapshot, generatedAt: Date | null = null): ClientChangeSet =>
  buildClientChangeSet({ rows, workbook: { generatedAt }, snapshot, today: "2026-10-18" });

const codes = (set: ClientChangeSet) => set.issues.map((issue) => issue.code);
const errorRows = (set: ClientChangeSet, code: string) => set.issues.find((issue) => issue.code === code)?.rows;

describe("identificación y celdas vacías", () => {
  const snapshot = snapshotOf([client(1, { city: "Caracas", specialty: "Pediatría" }), client(2)]);

  it("una fila con Identificador edita y una celda vacía borra el dato", () => {
    const set = run(rowsOf({ id: 1, name: "Cliente 1", phone: "+58414 0000001".replace("+58414 ", "414"), city: "" }), snapshot);
    expect(set.status).toBe("ready");
    expect(set.changes).toHaveLength(1);
    expect(set.changes[0]).toMatchObject({ action: "update", ref: 1, matchedBy: "identificador" });
    expect(set.changes[0].fields).toEqual([{ field: "city", label: "Ciudad", from: "Caracas", to: null }]);
  });

  it("una fila sin Identificador con un celular registrado edita y conserva lo guardado", () => {
    const set = run(rowsOf({ name: "Cliente Uno", phone: "4140000001", city: "", specialty: "" }), snapshot);
    expect(set.changes).toHaveLength(1);
    expect(set.changes[0]).toMatchObject({ action: "update", ref: 1, matchedBy: "celular" });
    expect(set.changes[0].fields.map((field) => field.field)).toEqual(["name"]);
    expect(set.writes.updates[0].values).toMatchObject({ city: "Caracas", specialty: "Pediatría", name: "Cliente Uno" });
  });

  it("un celular nuevo crea un cliente", () => {
    const set = run(rowsOf({ name: "Nueva", phone: "4149999999", city: "Valencia" }), snapshot);
    expect(set.changes[0]).toMatchObject({ action: "create", ref: null, matchedBy: null });
    expect(set.writes.creates).toHaveLength(1);
    expect(set.counts).toEqual({ created: 1, updated: 0, unchanged: 0 });
  });

  it("las columnas ausentes nunca cambian", () => {
    const set = run(rowsOf({ id: 1, name: "Otro nombre", phone: "4140000001" }), snapshot);
    expect(set.writes.updates[0].values).toMatchObject({ city: "Caracas", specialty: "Pediatría" });
    expect(set.changes[0].fields.map((field) => field.field)).toEqual(["name"]);
  });

  it("las filas sin diferencias solo se cuentan", () => {
    const set = run(rowsOf({ id: 2, name: "Cliente 2", phone: "4140000002" }), snapshot);
    expect(set.status).toBe("no_changes");
    expect(set.counts).toEqual({ created: 0, updated: 0, unchanged: 1 });
    expect(set.changes).toEqual([]);
  });

  it("usa la escritura canónica", () => {
    const withHospital = snapshotOf([client(1, { hospital: "Los Magallanes" })]);
    const set = run(rowsOf({ name: "Nueva", phone: "4149999999", hospital: "los magallanes" }), withHospital);
    expect(set.writes.creates[0].values.hospital).toBe("Los Magallanes");
    expect(codes(set)).not.toContain("NEW_VALUE");
  });
});

describe("errores", () => {
  const snapshot = snapshotOf([client(1), client(2), client(3)]);

  it("UNKNOWN_ID y DUPLICATE_ID", () => {
    const unknown = run(rowsOf({ id: 99, name: "X", phone: "4149999999" }), snapshot);
    expect(codes(unknown)).toEqual(["UNKNOWN_ID"]);
    const duplicate = run(
      rowsOf({ id: 1, name: "A", phone: "4140000001" }, { id: 1, name: "B", phone: "4140000001" }),
      snapshot,
    );
    expect(duplicate.issues.find((issue) => issue.code === "DUPLICATE_ID")).toMatchObject({ rows: ["2-3"], count: 2 });
    expect(duplicate.status).toBe("invalid");
  });

  it("PHONE_REPEATED cuando dos filas terminan con el mismo celular", () => {
    const set = run(rowsOf({ name: "A", phone: "4149999999" }, { name: "B", phone: "0414-999-9999" }), snapshot);
    expect(errorRows(set, "PHONE_REPEATED")).toEqual(["2-3"]);
    expect(set.status).toBe("invalid");
  });

  it("PHONE_IN_USE sobre el resultado final", () => {
    const set = run(rowsOf({ id: 1, name: "Cliente 1", phone: "4140000002" }), snapshot);
    expect(set.issues.find((issue) => issue.code === "PHONE_IN_USE")?.message).toBe("Este celular ya pertenece al cliente #2.");
  });

  it("DUPLICATE_TARGET cuando una fila por Identificador y otra por celular apuntan al mismo cliente", () => {
    const set = run(
      rowsOf({ id: 1, name: "A", phone: "4149999999" }, { name: "B", phone: "4140000001" }),
      snapshot,
    );
    expect(codes(set)).toContain("DUPLICATE_TARGET");
    expect(set.issues.find((issue) => issue.code === "DUPLICATE_TARGET")?.message).toMatch(/fila [23]/);
  });

  it("el intercambio de celulares entre dos filas es válido", () => {
    const set = run(
      rowsOf({ id: 1, name: "Cliente 1", phone: "4140000002" }, { id: 2, name: "Cliente 2", phone: "4140000001" }),
      snapshot,
    );
    expect(set.status).toBe("ready");
    expect(set.counts.updated).toBe(2);
  });

  it("los errores de celda invalidan el archivo", () => {
    const set = run(rowsOf({ name: "", phone: "123" }), snapshot);
    expect(set.status).toBe("invalid");
    expect(codes(set)).toEqual(expect.arrayContaining(["REQUIRED", "INVALID_PHONE"]));
  });
});

describe("advertencias", () => {
  const snapshot = snapshotOf([client(1, { name: "Ana Pérez" }), client(2)]);

  it("NEW_VALUE una vez por columna y valor, con todas sus filas", () => {
    const set = run(
      rowsOf({ name: "A", phone: "4141111111", city: "Maracay" }, { name: "B", phone: "4142222222", city: "maracay" }, { name: "C", phone: "4143333333", city: "Mérida" }),
      snapshot,
    );
    const warnings = set.issues.filter((issue) => issue.code === "NEW_VALUE");
    expect(warnings).toHaveLength(2);
    expect(warnings.find((issue) => issue.message.includes("Maracay"))).toMatchObject({ rows: ["2-3"], count: 2, severity: "warning" });
    expect(set.status).toBe("ready");
  });

  it("SAME_NAME contra clientes existentes y del archivo", () => {
    const set = run(
      rowsOf({ name: "ana perez", phone: "4141111111" }, { name: "Luis", phone: "4142222222" }, { name: "LUIS", phone: "4143333333" }),
      snapshot,
    );
    const messages = set.issues.filter((issue) => issue.code === "SAME_NAME").map((issue) => issue.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        "Hay otro cliente con el mismo nombre (#1). Revisa que no sea un duplicado.",
        "Hay otro cliente con el mismo nombre (la fila 4). Revisa que no sea un duplicado.",
      ]),
    );
    expect(set.status).toBe("ready");
  });

  it("MODIFIED_AFTER_DOWNLOAD solo con generatedAt, con cambios y con un updatedAt posterior", () => {
    const rows = () => rowsOf({ id: 2, name: "Nuevo nombre", phone: "4140000002" });
    expect(codes(run(rows(), snapshot, new Date("2026-10-09T00:00:00Z")))).toContain("MODIFIED_AFTER_DOWNLOAD");
    expect(codes(run(rows(), snapshot, new Date("2026-10-11T00:00:00Z")))).not.toContain("MODIFIED_AFTER_DOWNLOAD");
    expect(codes(run(rows(), snapshot, null))).not.toContain("MODIFIED_AFTER_DOWNLOAD");
    const unchanged = rowsOf({ id: 2, name: "Cliente 2", phone: "4140000002" });
    expect(codes(run(unchanged, snapshot, new Date("2026-10-09T00:00:00Z")))).not.toContain("MODIFIED_AFTER_DOWNLOAD");
  });
});

describe("línea base e idempotencia", () => {
  const snapshot = snapshotOf([client(1, { city: "Caracas" }), client(2), client(3)]);

  it("no depende del orden de las filas", () => {
    const a = run(rowsOf({ id: 1, name: "Uno", phone: "4140000001" }, { id: 2, name: "Dos", phone: "4140000002" }), snapshot);
    const b = run(rowsOf({ id: 2, name: "Dos", phone: "4140000002" }, { id: 1, name: "Uno", phone: "4140000001" }), snapshot);
    expect(a.baseline).toBe(b.baseline);
  });

  it("cambia si cambia un cliente referenciado o la tabla", () => {
    const rows = () => rowsOf({ id: 1, name: "Uno", phone: "4140000001" });
    const base = run(rows(), snapshot).baseline;
    const edited = snapshotOf([client(1, { city: "Valencia" }), client(2), client(3)]);
    expect(run(rows(), edited).baseline).not.toBe(base);
    const extra = snapshotOf([client(1, { city: "Caracas" }), client(2), client(3), client(4)]);
    expect(run(rows(), extra).baseline).not.toBe(base);
    const untouched = snapshotOf([client(1, { city: "Caracas" }), client(2, { name: "Cambiado" }), client(3)]);
    expect(run(rows(), untouched).baseline).toBe(base);
  });

  it("aplicar el resultado y volver a calcular no produce cambios", () => {
    const rows = () =>
      rowsOf(
        { name: "Nueva Uno", phone: "4141111111", city: "Maracay", sex: "mujer" },
        { name: "Cliente Dos", phone: "4140000002", city: "" },
        { id: 1, name: "Cliente 1", phone: "4140000001", city: "" },
      );
    const first = run(rows(), snapshot);
    expect(first.status).toBe("ready");

    const apply = (values: ClientWriteValues, base: Partial<SnapshotClient>): SnapshotClient =>
      client(base.ref!, { ...base, ...values, phoneE164: values.phoneE164, updatedAt: new Date("2026-10-18T00:00:00Z") });
    const updated = snapshot.clients.map((existing) => {
      const write = first.writes.updates.find((update) => update.ref === existing.ref);
      return write ? apply(write.values, existing) : existing;
    });
    let nextRef = 4;
    const created = first.writes.creates.map((write) => apply(write.values, { ref: nextRef++ }));
    const second = run(rows(), snapshotOf([...updated, ...created]));
    expect(second.status).toBe("no_changes");
    expect(second.counts.unchanged).toBe(3);
  });
});
