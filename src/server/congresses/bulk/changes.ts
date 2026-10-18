import { createHash } from "node:crypto";
import { daysBetween, formatDate } from "../../../utils/dates";
import { normalizeKey } from "../../../utils/text-keys";
import { groupIssues, type ValidationIssue } from "../../bulk/issues";
import type { BulkChange } from "../../bulk/response";
import type { ReferenceIndex } from "../../reference/values";
import {
  LONG_EVENT_DAYS,
  createCongressIssue,
  type CongressIssueCode,
  type CongressRawIssue,
} from "./format";
import type { CongressValueKey, ParsedCongressRow } from "./rows";

export interface CongressFields {
  name: string;
  startDate: string;
  endDate: string;
  venue: string | null;
  specialty: string | null;
  notes: string | null;
}

export interface SnapshotCongress extends CongressFields {
  id: string;
  ref: number;
  updatedAt: Date;
}

export interface CongressSnapshot {
  congresses: SnapshotCongress[];
  byRef: Map<number, SnapshotCongress>;
  reference: ReferenceIndex;
  marker: { count: number; maxRef: number };
}

export function createCongressSnapshot(congresses: SnapshotCongress[], reference: ReferenceIndex): CongressSnapshot {
  return {
    congresses,
    byRef: new Map(congresses.map((item) => [item.ref, item])),
    reference,
    marker: { count: congresses.length, maxRef: congresses.reduce((max, item) => Math.max(max, item.ref), 0) },
  };
}

export interface CongressCreateWrite {
  excelRow: number;
  label: string;
  values: CongressFields;
}

export interface CongressUpdateWrite {
  excelRow: number;
  id: string;
  ref: number;
  label: string;
  values: CongressFields;
}

export interface CongressChangeSet {
  status: "ready" | "invalid" | "no_changes";
  counts: { created: number; updated: number; unchanged: number };
  issues: ValidationIssue<CongressIssueCode>[];
  changes: BulkChange[];
  writes: { creates: CongressCreateWrite[]; updates: CongressUpdateWrite[] };
  baseline: string;
}

const FIELDS: Array<{ key: CongressValueKey; prop: keyof CongressFields; label: string; date?: boolean }> = [
  { key: "from", prop: "startDate", label: "Desde", date: true },
  { key: "to", prop: "endDate", label: "Hasta", date: true },
  { key: "specialty", prop: "specialty", label: "Especialidad" },
  { key: "venue", prop: "venue", label: "Lugar" },
  { key: "name", prop: "name", label: "Nombre" },
  { key: "notes", prop: "notes", label: "Notas" },
];

const shown = (field: (typeof FIELDS)[number], value: string | null) => (value !== null && field.date ? formatDate(value) : value);

export const congressLabel = (fields: Pick<CongressFields, "name" | "startDate" | "endDate">) =>
  `${fields.name} · ${formatDate(fields.startDate)} – ${formatDate(fields.endDate)}`;

export function collectRefs(rows: ParsedCongressRow[]): number[] {
  return [...new Set(rows.flatMap((row) => (row.ref !== null ? [row.ref] : [])))];
}

export function buildCongressChangeSet(input: {
  rows: ParsedCongressRow[];
  workbook: { generatedAt: Date | null };
  snapshot: CongressSnapshot;
  today: string;
}): CongressChangeSet {
  const { rows, snapshot, workbook, today } = input;
  const issues: CongressRawIssue[] = rows.flatMap((row) => row.issues);
  const warnings: CongressRawIssue[] = [];
  const active = rows.filter((row) => row.issues.every((issue) => issue.severity !== "error"));

  const byRef = new Map<number, ParsedCongressRow[]>();
  for (const row of active) if (row.ref !== null) byRef.set(row.ref, [...(byRef.get(row.ref) ?? []), row]);
  const blocked = new Set<ParsedCongressRow>();
  for (const group of byRef.values()) {
    if (group.length < 2) continue;
    for (const row of group) {
      issues.push(createCongressIssue("DUPLICATE_ID", { column: "Identificador", row: row.excelRow }));
      blocked.add(row);
    }
  }

  const working = { index: new Map(snapshot.reference.specialty), created: new Set<string>() };
  const changes: BulkChange[] = [];
  const creates: CongressCreateWrite[] = [];
  const updates: CongressUpdateWrite[] = [];
  let unchanged = 0;
  const targeted = new Set<number>();

  interface Entry {
    row: ParsedCongressRow;
    target: SnapshotCongress | null;
    fields: CongressFields;
  }
  const entries: Entry[] = [];
  for (const row of active) {
    if (blocked.has(row)) continue;
    let target: SnapshotCongress | null = null;
    if (row.ref !== null) {
      target = snapshot.byRef.get(row.ref) ?? null;
      if (!target) {
        issues.push(createCongressIssue("UNKNOWN_ID", { column: "Identificador", row: row.excelRow }));
        continue;
      }
      targeted.add(target.ref);
    }
    const fields: CongressFields = target
      ? { name: target.name, startDate: target.startDate, endDate: target.endDate, venue: target.venue, specialty: target.specialty, notes: target.notes }
      : { name: "", startDate: "", endDate: "", venue: null, specialty: null, notes: null };
    for (const field of FIELDS) {
      const state = row.values[field.key];
      if (state) (fields as unknown as Record<string, string | null>)[field.prop] = state.value;
    }
    if (fields.endDate < fields.startDate) {
      issues.push(createCongressIssue("END_BEFORE_START", { column: "Hasta", row: row.excelRow }));
      continue;
    }
    if (fields.specialty) {
      const key = normalizeKey(fields.specialty);
      const existing = working.index.get(key);
      if (existing) {
        fields.specialty = existing;
        if (working.created.has(key)) warnings.push(createCongressIssue("NEW_VALUE", { column: "Especialidad", row: row.excelRow, value: existing }));
      } else {
        working.index.set(key, fields.specialty);
        working.created.add(key);
        warnings.push(createCongressIssue("NEW_VALUE", { column: "Especialidad", row: row.excelRow, value: fields.specialty }));
      }
    }
    entries.push({ row, target, fields });
  }

  // Duplicados por nombre normalizado y fecha de inicio: existentes (no modificados por el archivo) y de filas anteriores.
  const seen = new Map<string, number>();
  for (const item of snapshot.congresses) {
    if (targeted.has(item.ref)) continue;
    seen.set(`${normalizeKey(item.name)}|${item.startDate}`, -item.ref);
  }

  for (const { row, target, fields } of entries) {
    const diffs = FIELDS.filter((field) => (target ? fields[field.prop] !== target[field.prop] : fields[field.prop] !== null)).map((field) => ({
      field: field.key,
      label: field.label,
      from: target ? shown(field, target[field.prop]) : null,
      to: shown(field, fields[field.prop]),
    }));
    const key = `${normalizeKey(fields.name)}|${fields.startDate}`;
    const earlier = seen.get(key);
    seen.set(key, earlier ?? row.excelRow);
    if (target && diffs.length === 0) {
      unchanged += 1;
      continue;
    }

    const codes: CongressIssueCode[] = [];
    const warn = (code: CongressIssueCode, params: Parameters<typeof createCongressIssue>[1] = {}) => {
      warnings.push(createCongressIssue(code, { row: row.excelRow, ...params }));
      codes.push(code);
    };
    if (earlier !== undefined) warn("POSSIBLE_DUPLICATE", { reference: earlier < 0 ? `congreso #${-earlier}` : `la fila ${earlier}` });
    const days = daysBetween(fields.startDate, fields.endDate) + 1;
    if (days > LONG_EVENT_DAYS) warn("LONG_EVENT", { n: days });
    if (fields.endDate < today) warn("ALREADY_ENDED");
    if (target && workbook.generatedAt && target.updatedAt.getTime() > workbook.generatedAt.getTime()) warn("MODIFIED_AFTER_DOWNLOAD");
    if (warnings.some((issue) => issue.code === "NEW_VALUE" && issue.row === row.excelRow)) codes.push("NEW_VALUE");

    const label = congressLabel(fields);
    changes.push({
      excelRow: row.excelRow,
      action: target ? "update" : "create",
      ref: target?.ref ?? null,
      matchedBy: null,
      label,
      fields: diffs,
      warnings: [...new Set(codes)],
    });
    if (target) updates.push({ excelRow: row.excelRow, id: target.id, ref: target.ref, label, values: fields });
    else creates.push({ excelRow: row.excelRow, label, values: fields });
  }

  const all = [...issues, ...warnings];
  const hasErrors = all.some((issue) => issue.severity === "error");
  const status = hasErrors ? "invalid" : creates.length + updates.length === 0 ? "no_changes" : "ready";
  const referenced = rows.flatMap((row) => (row.ref !== null && snapshot.byRef.has(row.ref) ? [snapshot.byRef.get(row.ref)!] : []));
  const baseline = createHash("sha256")
    .update(
      JSON.stringify([
        "congresos-v1",
        snapshot.marker.count,
        snapshot.marker.maxRef,
        [...new Map(referenced.map((item) => [item.ref, item])).values()]
          .sort((a, b) => a.ref - b.ref)
          .map((item) => [item.ref, item.name, item.startDate, item.endDate, item.venue, item.specialty, item.notes, item.updatedAt.toISOString()]),
      ]),
    )
    .digest("hex");

  return {
    status,
    counts: { created: creates.length, updated: updates.length, unchanged },
    issues: groupIssues(all),
    changes,
    writes: { creates, updates },
    baseline,
  };
}
