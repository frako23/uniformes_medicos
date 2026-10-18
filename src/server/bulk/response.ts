import { countIssues, type ValidationIssue } from "./issues";
import type { BulkSection } from "./preview-token";
import type { SectionWorkbookKind } from "./sheet";

export interface FieldChange {
  field: string;
  label: string;
  from: string | null;
  /** `null` significa que el dato se borrará. */
  to: string | null;
}

export interface FinancingScheduleSummary {
  purchaseDate: string;
  frequency: "semanal" | "quincenal" | "mensual";
  totalUsd: string;
  initial: { amountUsd: string; dueDate: string; paid: boolean } | null;
  installments: {
    count: number;
    regularAmountUsd: string;
    lastAmountUsd: string;
    firstDue: string;
    lastDue: string;
    paidCount: number;
  };
}

export interface BulkChange {
  /** Número de fila de Excel. */
  excelRow: number;
  action: "create" | "update";
  ref: number | null;
  matchedBy?: "identificador" | "celular" | null;
  label: string;
  fields: FieldChange[];
  schedule?: FinancingScheduleSummary;
  warnings: string[];
}

/** Detalle máximo de cambios en una vista previa, para no superar el límite de 4,5 MB de las respuestas de Vercel. */
export const MAX_DETAILED_CHANGES = 3_000;

export interface BulkPreviewResponse {
  status: "ready" | "invalid" | "no_changes";
  section: BulkSection;
  file: {
    name: string;
    kind: SectionWorkbookKind;
    sheet: string;
    generatedAt: string | null;
    rows: number;
  };
  summary: {
    created: number;
    updated: number;
    unchanged: number;
    errors: number;
    warnings: number;
    installments?: number;
    financedUsd?: string;
    outstandingUsd?: string;
  };
  issues: ValidationIssue[];
  changes: Array<{
    row: number;
    action: "create" | "update";
    ref: number | null;
    matchedBy: "identificador" | "celular" | null;
    label: string;
    fields: FieldChange[];
    schedule?: FinancingScheduleSummary;
    warnings: string[];
  }>;
  /** Cambios que existen pero no se detallan en `changes` (siempre se aplican); 0 si se muestran todos. */
  omittedChanges: number;
  preview: { token: string; expiresAt: string } | null;
}

export interface BulkAppliedRecord {
  ref: number;
  label: string;
  url: string;
}

export interface BulkApplyResponse {
  status: "applied";
  section: BulkSection;
  appliedAt: string;
  summary: { created: number; updated: number; installments?: number };
  created: BulkAppliedRecord[];
  updated: BulkAppliedRecord[];
}

export function toBulkPreviewResponse(input: {
  section: BulkSection;
  status: BulkPreviewResponse["status"];
  fileName: string;
  workbook: { kind: SectionWorkbookKind; sheetName: string; generatedAt: Date | null };
  rowCount: number;
  counts: { created: number; updated: number; unchanged: number };
  extraSummary?: { installments?: number; financedUsd?: string; outstandingUsd?: string };
  issues: ValidationIssue[];
  changes: BulkChange[];
  token?: { token: string; expiresAt: number } | null;
}): BulkPreviewResponse {
  const { errors, warnings } = countIssues(input.issues);
  const changes = [...input.changes]
    .sort((left, right) => left.excelRow - right.excelRow)
    .map((change) => ({
      row: change.excelRow,
      action: change.action,
      ref: change.ref,
      matchedBy: change.matchedBy ?? null,
      label: change.label,
      fields: change.fields,
      ...(change.schedule ? { schedule: change.schedule } : {}),
      warnings: change.warnings,
    }));
  return {
    status: input.status,
    section: input.section,
    file: {
      name: input.fileName,
      kind: input.workbook.kind,
      sheet: input.workbook.sheetName,
      generatedAt: input.workbook.generatedAt ? input.workbook.generatedAt.toISOString() : null,
      rows: input.rowCount,
    },
    summary: { ...input.counts, errors, warnings, ...input.extraSummary },
    issues: input.issues,
    changes: input.status === "invalid" ? [] : changes.slice(0, MAX_DETAILED_CHANGES),
    omittedChanges: input.status === "invalid" ? 0 : Math.max(0, changes.length - MAX_DETAILED_CHANGES),
    preview:
      input.status === "ready" && input.token
        ? { token: input.token.token, expiresAt: new Date(input.token.expiresAt).toISOString() }
        : null,
  };
}

export function toBulkApplyResponse(input: {
  section: BulkSection;
  appliedAt: Date;
  summary: BulkApplyResponse["summary"];
  created: BulkAppliedRecord[];
  updated: BulkAppliedRecord[];
}): BulkApplyResponse {
  return {
    status: "applied",
    section: input.section,
    appliedAt: input.appliedAt.toISOString(),
    summary: input.summary,
    created: input.created,
    updated: input.updated,
  };
}
