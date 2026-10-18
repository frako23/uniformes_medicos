import { createHash } from "node:crypto";
import { formatPhone } from "../../../utils/phone";
import { normalizeKey } from "../../../utils/text-keys";
import { groupIssues, type ValidationIssue } from "../../bulk/issues";
import type { BulkChange } from "../../bulk/response";
import type { ReferenceField, ReferenceIndex } from "../../reference/values";
import { createClientIssue, type ClientIssueCode, type ClientRawIssue } from "./format";
import type { ClientValueKey, ParsedClientRow } from "./rows";

export type Sex = "Mujer" | "Hombre";

export interface ClientFields {
  name: string;
  phoneE164: string;
  sex: Sex | null;
  size: string | null;
  city: string | null;
  hospital: string | null;
  clinic: string | null;
  specialty: string | null;
  notes: string | null;
}

export interface SnapshotClient extends ClientFields {
  id: string;
  ref: number;
  updatedAt: Date;
}

export interface ClientSnapshot {
  clients: SnapshotClient[];
  byRef: Map<number, SnapshotClient>;
  byPhone: Map<string, SnapshotClient>;
  reference: ReferenceIndex;
  marker: { count: number; maxRef: number };
}

export function createClientSnapshot(clients: SnapshotClient[], reference: ReferenceIndex): ClientSnapshot {
  return {
    clients,
    byRef: new Map(clients.map((client) => [client.ref, client])),
    byPhone: new Map(clients.map((client) => [client.phoneE164, client])),
    reference,
    marker: { count: clients.length, maxRef: clients.reduce((max, client) => Math.max(max, client.ref), 0) },
  };
}

export interface ClientWriteValues extends ClientFields {
  searchText: string;
}

export interface ClientCreateWrite {
  excelRow: number;
  label: string;
  values: ClientWriteValues;
}

export interface ClientUpdateWrite {
  excelRow: number;
  id: string;
  ref: number;
  label: string;
  values: ClientWriteValues;
}

export interface ClientChangeSet {
  status: "ready" | "invalid" | "no_changes";
  counts: { created: number; updated: number; unchanged: number };
  issues: ValidationIssue<ClientIssueCode>[];
  changes: BulkChange[];
  writes: { creates: ClientCreateWrite[]; updates: ClientUpdateWrite[] };
  baseline: string;
}

const FIELD_LABELS: Array<{ key: ClientValueKey; prop: keyof ClientFields; label: string }> = [
  { key: "name", prop: "name", label: "Nombre" },
  { key: "phone", prop: "phoneE164", label: "Celular" },
  { key: "sex", prop: "sex", label: "Sexo" },
  { key: "size", prop: "size", label: "Talla" },
  { key: "city", prop: "city", label: "Ciudad" },
  { key: "hospital", prop: "hospital", label: "Hospital" },
  { key: "clinic", prop: "clinic", label: "Clínica" },
  { key: "specialty", prop: "specialty", label: "Especialidad" },
  { key: "notes", prop: "notes", label: "Notas" },
];

const CANONICAL: ReferenceField[] = ["size", "city", "hospital", "clinic", "specialty"];

const display = (prop: keyof ClientFields, value: string | null) =>
  value !== null && prop === "phoneE164" ? formatPhone(value) : value;

const labelFor = (fields: Pick<ClientFields, "name" | "phoneE164">) => `${fields.name} · ${formatPhone(fields.phoneE164)}`;

/** Refs y celulares que menciona el archivo, para bloquear esos clientes antes de leer la instantánea. */
export function collectReferences(rows: ParsedClientRow[]) {
  const refs = new Set<number>();
  const phones = new Set<string>();
  for (const row of rows) {
    if (row.ref !== null) refs.add(row.ref);
    const phone = row.values.phone?.value;
    if (phone) phones.add(phone);
  }
  return { refs: [...refs], phones: [...phones] };
}

type Resolved =
  | { row: ParsedClientRow; client: SnapshotClient; matchedBy: "identificador" | "celular" }
  | { row: ParsedClientRow; client: null; matchedBy: null };

interface WorkingIndex {
  index: Map<string, string>;
  created: Set<string>;
}

export function buildClientChangeSet(input: {
  rows: ParsedClientRow[];
  workbook: { generatedAt: Date | null };
  snapshot: ClientSnapshot;
  today?: string;
}): ClientChangeSet {
  const { rows, snapshot, workbook } = input;
  const issues: ClientRawIssue[] = rows.flatMap((row) => row.issues);
  const warnings: Array<{ row: ParsedClientRow; code: ClientIssueCode; params?: Parameters<typeof createClientIssue>[1] }> = [];
  const blocked = new Set<ParsedClientRow>();
  const rowsWithNewValue = new Set<ParsedClientRow>();
  const addError = (row: ParsedClientRow, code: ClientIssueCode, params: Parameters<typeof createClientIssue>[1] = {}) => {
    issues.push(createClientIssue(code, { row: row.excelRow, ...params }));
  };

  // Filas con errores de celda quedan fuera de la resolución.
  const active = rows.filter((row) => row.issues.every((issue) => issue.severity !== "error"));

  // Identificadores repetidos.
  const byRefRows = new Map<number, ParsedClientRow[]>();
  for (const row of active) {
    if (row.ref === null) continue;
    byRefRows.set(row.ref, [...(byRefRows.get(row.ref) ?? []), row]);
  }
  for (const group of byRefRows.values()) {
    if (group.length < 2) continue;
    for (const row of group) {
      addError(row, "DUPLICATE_ID", { column: "Identificador" });
      blocked.add(row);
    }
  }

  // Resolución: por identificador, por celular o alta.
  const resolved: Resolved[] = [];
  for (const row of active) {
    if (blocked.has(row)) continue;
    if (row.ref !== null) {
      const client = snapshot.byRef.get(row.ref);
      if (!client) {
        addError(row, "UNKNOWN_ID", { column: "Identificador" });
        blocked.add(row);
        continue;
      }
      resolved.push({ row, client, matchedBy: "identificador" });
      continue;
    }
    const phone = row.values.phone?.value ?? null;
    const client = phone ? snapshot.byPhone.get(phone) : undefined;
    resolved.push(client ? { row, client, matchedBy: "celular" } : { row, client: null, matchedBy: null });
  }

  // Una fila por identificador y otra por celular que apuntan al mismo cliente.
  const byTarget = new Map<number, Resolved[]>();
  for (const entry of resolved) {
    if (!entry.client) continue;
    byTarget.set(entry.client.ref, [...(byTarget.get(entry.client.ref) ?? []), entry]);
  }
  const live = new Set(resolved);
  for (const group of byTarget.values()) {
    if (group.length < 2 || group.every((entry) => entry.matchedBy === "celular")) continue;
    for (const entry of group) {
      const other = group.find((candidate) => candidate !== entry)!;
      addError(entry.row, "DUPLICATE_TARGET", { n: other.row.excelRow });
      live.delete(entry);
    }
  }
  const entries = resolved.filter((entry) => live.has(entry));

  // Valores finales de cada fila.
  const working = Object.fromEntries(
    CANONICAL.map((field) => [field, { index: new Map(snapshot.reference[field]), created: new Set<string>() } satisfies WorkingIndex]),
  ) as Record<ReferenceField, WorkingIndex>;

  interface Final {
    entry: Resolved;
    fields: ClientFields;
  }
  const finals: Final[] = entries.map((entry) => {
    const { row, client, matchedBy } = entry;
    const fields: ClientFields = client
      ? {
          name: client.name,
          phoneE164: client.phoneE164,
          sex: client.sex,
          size: client.size,
          city: client.city,
          hospital: client.hospital,
          clinic: client.clinic,
          specialty: client.specialty,
          notes: client.notes,
        }
      : { name: "", phoneE164: "", sex: null, size: null, city: null, hospital: null, clinic: null, specialty: null, notes: null };
    for (const { key, prop } of FIELD_LABELS) {
      const state = row.values[key];
      if (!state) continue;
      if (matchedBy === "celular" && state.empty) continue;
      (fields as unknown as Record<string, string | null>)[prop] = state.value;
    }
    for (const field of CANONICAL) {
      const value = fields[field];
      if (!value) continue;
      const key = normalizeKey(value);
      const slot = working[field];
      const existing = slot.index.get(key);
      if (existing) {
        fields[field] = existing;
        if (slot.created.has(key)) {
          warnings.push({ row, code: "NEW_VALUE", params: { column: headerFor(field), value: existing } });
          rowsWithNewValue.add(row);
        }
      } else {
        slot.index.set(key, value);
        slot.created.add(key);
        warnings.push({ row, code: "NEW_VALUE", params: { column: headerFor(field), value } });
        rowsWithNewValue.add(row);
      }
    }
    return { entry, fields };
  });

  // Unicidad del celular sobre el resultado final.
  const targeted = new Set(finals.flatMap(({ entry }) => (entry.client ? [entry.client.ref] : [])));
  const phoneGroups = new Map<string, Final[]>();
  for (const final of finals) {
    phoneGroups.set(final.fields.phoneE164, [...(phoneGroups.get(final.fields.phoneE164) ?? []), final]);
  }
  for (const group of phoneGroups.values()) {
    if (group.length > 1) for (const final of group) addError(final.entry.row, "PHONE_REPEATED", { column: "Celular" });
  }
  for (const final of finals) {
    const owner = snapshot.byPhone.get(final.fields.phoneE164);
    if (owner && owner !== final.entry.client && !targeted.has(owner.ref)) {
      addError(final.entry.row, "PHONE_IN_USE", { column: "Celular", id: owner.ref });
    }
  }

  // Diferencias, avisos y escrituras.
  const nameOwners = new Map<string, Array<{ ref?: number; row?: number; self: Final | null }>>();
  const addOwner = (name: string, owner: { ref?: number; row?: number; self: Final | null }) => {
    const key = normalizeKey(name);
    nameOwners.set(key, [...(nameOwners.get(key) ?? []), owner]);
  };
  for (const client of snapshot.clients) {
    if (!targeted.has(client.ref)) addOwner(client.name, { ref: client.ref, self: null });
  }
  for (const final of finals) {
    addOwner(final.fields.name, { ref: final.entry.client?.ref, row: final.entry.row.excelRow, self: final });
  }

  const changes: BulkChange[] = [];
  const creates: ClientCreateWrite[] = [];
  const updates: ClientUpdateWrite[] = [];
  let unchanged = 0;
  for (const final of finals) {
    const { entry, fields } = final;
    const { row, client } = entry;
    const diffs = client
      ? FIELD_LABELS.filter(({ prop }) => fields[prop] !== client[prop]).map(({ key, prop, label }) => ({
          field: key,
          label,
          from: display(prop, client[prop]),
          to: display(prop, fields[prop]),
        }))
      : FIELD_LABELS.filter(({ prop }) => fields[prop] !== null).map(({ key, prop, label }) => ({
          field: key,
          label,
          from: null,
          to: display(prop, fields[prop]),
        }));
    if (client && diffs.length === 0) {
      unchanged += 1;
      continue;
    }

    const rowWarnings: ClientIssueCode[] = [];
    if (rowsWithNewValue.has(row)) rowWarnings.push("NEW_VALUE");
    const peers = (nameOwners.get(normalizeKey(fields.name)) ?? []).filter((owner) => owner.self !== final);
    if (peers.length) {
      const existing = peers.find((owner) => owner.self === null);
      const reference = existing ? `#${existing.ref}` : `la fila ${peers[0].row}`;
      warnings.push({ row, code: "SAME_NAME", params: { reference } });
      rowWarnings.push("SAME_NAME");
    }
    if (client && workbook.generatedAt && client.updatedAt.getTime() > workbook.generatedAt.getTime()) {
      warnings.push({ row, code: "MODIFIED_AFTER_DOWNLOAD" });
      rowWarnings.push("MODIFIED_AFTER_DOWNLOAD");
    }

    const label = labelFor(fields);
    const values: ClientWriteValues = { ...fields, searchText: normalizeKey(fields.name) };
    changes.push({
      excelRow: row.excelRow,
      action: client ? "update" : "create",
      ref: client?.ref ?? null,
      matchedBy: entry.matchedBy,
      label,
      fields: diffs,
      warnings: [...new Set(rowWarnings)],
    });
    if (client) updates.push({ excelRow: row.excelRow, id: client.id, ref: client.ref, label, values });
    else creates.push({ excelRow: row.excelRow, label, values });
  }

  const allIssues = [
    ...issues,
    ...warnings.map((warning) => createClientIssue(warning.code, { row: warning.row.excelRow, ...warning.params })),
  ];
  const grouped = groupIssues(allIssues);
  const hasErrors = allIssues.some((issue) => issue.severity === "error");
  const counts = { created: creates.length, updated: updates.length, unchanged };
  const status = hasErrors ? "invalid" : creates.length + updates.length === 0 ? "no_changes" : "ready";

  // Línea base: los clientes referenciados y el marcador de la tabla.
  const referenced = new Map<number, SnapshotClient>();
  for (const row of rows) {
    if (row.ref !== null) {
      const client = snapshot.byRef.get(row.ref);
      if (client) referenced.set(client.ref, client);
    }
    const phone = row.values.phone?.value;
    const byPhone = phone ? snapshot.byPhone.get(phone) : undefined;
    if (byPhone) referenced.set(byPhone.ref, byPhone);
  }
  for (const final of finals) {
    const owner = snapshot.byPhone.get(final.fields.phoneE164);
    if (owner) referenced.set(owner.ref, owner);
  }
  const baseline = createHash("sha256")
    .update(
      JSON.stringify([
        "clientes-v1",
        snapshot.marker.count,
        snapshot.marker.maxRef,
        [...referenced.values()]
          .sort((left, right) => left.ref - right.ref)
          .map((client) => [
            client.ref,
            client.name,
            client.phoneE164,
            client.sex,
            client.size,
            client.city,
            client.hospital,
            client.clinic,
            client.specialty,
            client.notes,
            client.updatedAt.toISOString(),
          ]),
      ]),
    )
    .digest("hex");

  return { status, counts, issues: grouped, changes, writes: { creates, updates }, baseline };
}

function headerFor(field: ReferenceField) {
  return { size: "Talla", city: "Ciudad", hospital: "Hospital", clinic: "Clínica", specialty: "Especialidad" }[field];
}
