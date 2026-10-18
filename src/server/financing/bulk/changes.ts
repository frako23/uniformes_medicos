import { createHash } from "node:crypto";
import { formatDate } from "../../../utils/dates";
import { generateSchedule, type Frequency, type ScheduleItem } from "../../../utils/financing-schedule";
import { formatPhone } from "../../../utils/phone";
import { normalizeKey } from "../../../utils/text-keys";
import { groupIssues, type ValidationIssue } from "../../bulk/issues";
import type { BulkChange, FinancingScheduleSummary } from "../../bulk/response";
import { fromCents } from "../summary";
import { FREQUENCY_LABELS, createFinancingIssue, type FinancingIssueCode, type FinancingRawIssue } from "./format";
import type { ParsedFinancingRow } from "./rows";

export interface SnapshotFinancingClient {
  id: string;
  ref: number;
  name: string;
  phoneE164: string;
}

export interface SnapshotFinancing {
  ref: number;
  clientId: string;
  purchaseDate: string;
  totalCents: number;
}

export interface FinancingSnapshot {
  clients: SnapshotFinancingClient[];
  byPhone: Map<string, SnapshotFinancingClient>;
  financings: SnapshotFinancing[];
  marker: { count: number; maxRef: number };
}

export function createFinancingSnapshot(
  clients: SnapshotFinancingClient[],
  financings: SnapshotFinancing[],
): FinancingSnapshot {
  return {
    clients,
    byPhone: new Map(clients.map((client) => [client.phoneE164, client])),
    financings,
    marker: { count: financings.length, maxRef: financings.reduce((max, item) => Math.max(max, item.ref), 0) },
  };
}

export interface FinancingDraftInstallment extends ScheduleItem {
  paid: boolean;
}

export interface FinancingDraft {
  excelRow: number;
  clientId: string;
  clientRef: number;
  label: string;
  description: string;
  purchaseDate: string;
  frequency: Frequency;
  installments: FinancingDraftInstallment[];
  summary: FinancingScheduleSummary;
}

export interface FinancingChangeSet {
  status: "ready" | "invalid" | "no_changes";
  counts: { created: number; updated: number; unchanged: number };
  extraSummary: { installments: number; financedUsd: string; outstandingUsd: string };
  issues: ValidationIssue<FinancingIssueCode>[];
  changes: BulkChange[];
  drafts: FinancingDraft[];
  baseline: string;
}

export function summarize(
  purchaseDate: string,
  frequency: Frequency,
  items: FinancingDraftInstallment[],
): FinancingScheduleSummary {
  const initial = items.find((item) => item.isInitial) ?? null;
  const regular = items.filter((item) => !item.isInitial);
  return {
    purchaseDate,
    frequency,
    totalUsd: fromCents(items.reduce((sum, item) => sum + item.amountCents, 0)),
    initial: initial ? { amountUsd: fromCents(initial.amountCents), dueDate: initial.dueDate, paid: initial.paid } : null,
    installments: {
      count: regular.length,
      regularAmountUsd: fromCents(regular[0]?.amountCents ?? 0),
      lastAmountUsd: fromCents(regular[regular.length - 1]?.amountCents ?? 0),
      firstDue: regular[0]?.dueDate ?? purchaseDate,
      lastDue: regular[regular.length - 1]?.dueDate ?? purchaseDate,
      paidCount: regular.filter((item) => item.paid).length,
    },
  };
}

/** Celulares que menciona el archivo, para bloquear esos clientes antes de leer la instantánea. */
export function collectPhones(rows: ParsedFinancingRow[]): string[] {
  return [...new Set(rows.flatMap((row) => (row.clientPhoneE164 ? [row.clientPhoneE164] : [])))];
}

export function buildFinancingChangeSet(input: {
  rows: ParsedFinancingRow[];
  workbook?: { generatedAt: Date | null };
  snapshot: FinancingSnapshot;
}): FinancingChangeSet {
  const { rows, snapshot } = input;
  const issues: FinancingRawIssue[] = rows.flatMap((row) => row.issues);
  const warnings: FinancingRawIssue[] = [];
  const drafts: FinancingDraft[] = [];
  const changes: BulkChange[] = [];
  const referenced = new Map<number, SnapshotFinancingClient>();
  const seen = new Map<string, number>();

  for (const row of rows) {
    if (row.issues.some((issue) => issue.severity === "error")) continue;
    const client = snapshot.byPhone.get(row.clientPhoneE164!);
    if (!client) {
      issues.push(createFinancingIssue("CLIENT_NOT_FOUND", { column: "Celular del cliente", row: row.excelRow }));
      continue;
    }
    referenced.set(client.ref, client);
    const rowWarnings: FinancingIssueCode[] = [];
    if (row.clientNameWritten && normalizeKey(row.clientNameWritten) !== normalizeKey(client.name)) {
      warnings.push(createFinancingIssue("CLIENT_NAME_MISMATCH", { column: "Cliente", row: row.excelRow, value: client.name, extra: row.clientNameWritten }));
      rowWarnings.push("CLIENT_NAME_MISMATCH");
    }

    const schedule = generateSchedule({
      purchaseDate: row.purchaseDate!,
      totalCents: row.totalCents!,
      initialCents: row.initialCents,
      count: row.count!,
      frequency: row.frequency,
      firstDueDate: row.firstDueDate!,
    });
    const items: FinancingDraftInstallment[] = schedule.map((item, index) => ({ ...item, paid: index < row.paidCount }));

    const key = `${client.id}|${row.purchaseDate}|${row.totalCents}`;
    const existing = snapshot.financings.find(
      (item) => item.clientId === client.id && item.purchaseDate === row.purchaseDate && item.totalCents === row.totalCents,
    );
    const earlier = seen.get(key);
    if (existing || earlier !== undefined) {
      const reference = existing ? `financiamiento #${existing.ref}` : `la fila ${earlier}`;
      warnings.push(createFinancingIssue("POSSIBLE_DUPLICATE", { row: row.excelRow, reference }));
      rowWarnings.push("POSSIBLE_DUPLICATE");
    }
    if (earlier === undefined) seen.set(key, row.excelRow);

    const summary = summarize(row.purchaseDate!, row.frequency, items);
    drafts.push({
      excelRow: row.excelRow,
      clientId: client.id,
      clientRef: client.ref,
      label: `${client.name} · ${row.description}`,
      description: row.description!,
      purchaseDate: row.purchaseDate!,
      frequency: row.frequency,
      installments: items,
      summary,
    });
    changes.push({
      excelRow: row.excelRow,
      action: "create",
      ref: null,
      matchedBy: null,
      label: `${client.name} · ${formatPhone(client.phoneE164)}`,
      fields: [
        { field: "description", label: "Descripción", from: null, to: row.description! },
        { field: "purchaseDate", label: "Fecha de compra", from: null, to: formatDate(row.purchaseDate!) },
        { field: "frequency", label: "Frecuencia", from: null, to: FREQUENCY_LABELS[row.frequency] },
      ],
      schedule: summary,
      warnings: rowWarnings,
    });
  }

  const allIssues = [...issues, ...warnings];
  const hasErrors = allIssues.some((issue) => issue.severity === "error");
  const status = hasErrors ? "invalid" : drafts.length === 0 ? "no_changes" : "ready";
  const installmentsCount = drafts.reduce((sum, draft) => sum + draft.installments.length, 0);
  const financed = drafts.reduce((sum, draft) => sum + draft.installments.reduce((s, item) => s + item.amountCents, 0), 0);
  const outstanding = drafts.reduce(
    (sum, draft) => sum + draft.installments.filter((item) => !item.paid).reduce((s, item) => s + item.amountCents, 0),
    0,
  );

  const baseline = createHash("sha256")
    .update(
      JSON.stringify([
        "financiamientos-v1",
        snapshot.marker.count,
        snapshot.marker.maxRef,
        [...referenced.values()].sort((a, b) => a.ref - b.ref).map((client) => [client.ref, client.phoneE164]),
      ]),
    )
    .digest("hex");

  return {
    status,
    counts: { created: drafts.length, updated: 0, unchanged: 0 },
    extraSummary: { installments: installmentsCount, financedUsd: fromCents(financed), outstandingUsd: fromCents(outstanding) },
    issues: groupIssues(allIssues),
    changes,
    drafts,
    baseline,
  };
}
