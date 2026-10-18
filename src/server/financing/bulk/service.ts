import { todayInCaracas } from "../../../utils/dates";
import { BulkFileError, groupIssues, type ValidationIssue } from "../../bulk/issues";
import { assertApplicableToken, signBulkPreviewToken } from "../../bulk/preview-token";
import { toBulkApplyResponse, toBulkPreviewResponse, type BulkApplyResponse, type BulkPreviewResponse } from "../../bulk/response";
import { readSectionSheet, type ReadSectionResult } from "../../bulk/sheet";
import { translateApplyError } from "../../bulk/transaction";
import { db } from "../../db";
import { HttpError } from "../../http/errors";
import { buildFinancingChangeSet, collectPhones, type FinancingChangeSet, type FinancingSnapshot } from "./changes";
import {
  FINANCING_COLUMNS,
  FINANCINGS_LABEL,
  FINANCINGS_MAX_ROWS,
  FINANCINGS_PURPOSE,
  FINANCINGS_SECTION,
  FINANCINGS_TEMPLATE_FILE,
  type FinancingColumnKey,
  type FinancingIssueCode,
} from "./format";
import { insertFinancingDrafts, loadFinancingSnapshot, withFinancingsBulkLock } from "./repository";
import { parseFinancingRow, type ParsedFinancingRow } from "./rows";
import { buildFinancingsTemplate as buildTemplateWorkbook } from "./workbook";

const CONFLICT_CHANGED =
  "Los financiamientos cambiaron desde la vista previa. No se aplicó ningún cambio; valida el archivo de nuevo.";

export async function buildFinancingsTemplate(now: Date = new Date()): Promise<{ fileName: string; bytes: Buffer }> {
  const snapshot = await loadFinancingSnapshot(db());
  const bytes = await buildTemplateWorkbook({ clients: snapshot.clients, generatedAt: now });
  return { fileName: FINANCINGS_TEMPLATE_FILE, bytes };
}

type Read = ReadSectionResult<FinancingColumnKey>;

const readFile = (input: { fileName: string; bytes: Uint8Array }): Promise<Read> =>
  readSectionSheet<FinancingColumnKey>({
    fileName: input.fileName,
    bytes: input.bytes,
    sectionLabel: FINANCINGS_LABEL,
    columns: FINANCING_COLUMNS,
    maxRows: FINANCINGS_MAX_ROWS,
  });

const parseRows = (read: Read, today: string) =>
  read.rows.map((row) => parseFinancingRow(row.cells, read.columns, row.excelRow, today));

const SEVERITY_ORDER = { error: 0, warning: 1, notice: 2 } as const;

function analyze(read: Read, rows: ParsedFinancingRow[], snapshot: FinancingSnapshot) {
  const changeSet = buildFinancingChangeSet({ rows, workbook: { generatedAt: read.workbook.generatedAt }, snapshot });
  const issues: ValidationIssue<FinancingIssueCode>[] = [...groupIssues(read.issues), ...changeSet.issues].sort(
    (left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity],
  );
  const hasFileErrors = read.issues.some((issue) => issue.severity === "error");
  return { changeSet, issues, status: hasFileErrors ? ("invalid" as const) : changeSet.status };
}

export async function previewFinancingsFile(input: {
  fileName: string;
  bytes: Uint8Array;
  sessionToken: string;
  now?: Date;
}): Promise<BulkPreviewResponse> {
  const startedAt = Date.now();
  const now = input.now ?? new Date();
  const read = await readFile(input);
  const hasFileErrors = read.issues.some((issue) => issue.severity === "error");
  const rows = parseRows(read, todayInCaracas(now));
  let changeSet: FinancingChangeSet | null = null;
  let issues: ValidationIssue<FinancingIssueCode>[] = groupIssues(read.issues);
  let status: "ready" | "invalid" | "no_changes" = "invalid";
  if (!hasFileErrors) {
    const analysis = analyze(read, rows, await loadFinancingSnapshot(db()));
    ({ changeSet, issues, status } = analysis);
  }
  const token =
    status === "ready" && changeSet
      ? (() => {
          const signed = signBulkPreviewToken(
            { section: FINANCINGS_SECTION, fileSha256: read.workbook.sha256, baseline: changeSet.baseline },
            input.sessionToken,
            FINANCINGS_PURPOSE,
            now.getTime(),
          );
          return { token: signed.token, expiresAt: signed.payload.expiresAt };
        })()
      : null;
  console.info("financings.bulk.preview", { status, rows: read.rows.length, durationMs: Date.now() - startedAt });
  return toBulkPreviewResponse({
    section: FINANCINGS_SECTION,
    status,
    fileName: input.fileName,
    workbook: read.workbook,
    rowCount: read.rows.length,
    counts: changeSet?.counts ?? { created: 0, updated: 0, unchanged: 0 },
    extraSummary: changeSet?.extraSummary,
    issues,
    changes: changeSet?.changes ?? [],
    token,
  });
}

export async function applyFinancingsFile(input: {
  fileName: string;
  bytes: Uint8Array;
  previewToken: string;
  sessionToken: string;
  now?: Date;
  lockTimeoutMs?: number;
}): Promise<BulkApplyResponse> {
  const startedAt = Date.now();
  const now = input.now ?? new Date();
  const payload = assertApplicableToken({
    previewToken: input.previewToken,
    sessionToken: input.sessionToken,
    section: FINANCINGS_SECTION,
    bytes: input.bytes,
    now: now.getTime(),
  });
  const read = await readFile(input);
  const rows = parseRows(read, todayInCaracas(now));

  try {
    const created = await withFinancingsBulkLock({ phones: collectPhones(rows), lockTimeoutMs: input.lockTimeoutMs }, async (transaction, snapshot) => {
      const analysis = analyze(read, rows, snapshot);
      if (analysis.status !== "ready" || analysis.changeSet.baseline !== payload.baseline) {
        throw new HttpError(409, "CONFLICT", CONFLICT_CHANGED);
      }
      const inserted = await insertFinancingDrafts(transaction, analysis.changeSet.drafts, now);
      return { inserted, installments: analysis.changeSet.extraSummary.installments };
    });
    console.info("financings.bulk.apply", { created: created.inserted.length, installments: created.installments, durationMs: Date.now() - startedAt });
    return toBulkApplyResponse({
      section: FINANCINGS_SECTION,
      appliedAt: now,
      summary: { created: created.inserted.length, updated: 0, installments: created.installments },
      created: created.inserted.map((item) => ({ ...item, url: `/admin/pagos-financiados/${item.ref}` })),
      updated: [],
    });
  } catch (error) {
    if (error instanceof BulkFileError) throw error;
    const translated = translateApplyError(error, { changedMessage: CONFLICT_CHANGED });
    if (!(error instanceof HttpError)) console.error("financings.bulk.apply failed", { status: translated.status });
    throw translated;
  }
}
