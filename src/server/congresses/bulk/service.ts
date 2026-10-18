import { todayInCaracas } from "../../../utils/dates";
import { BulkFileError, groupIssues, type ValidationIssue } from "../../bulk/issues";
import { assertApplicableToken, signBulkPreviewToken } from "../../bulk/preview-token";
import { toBulkApplyResponse, toBulkPreviewResponse, type BulkApplyResponse, type BulkPreviewResponse } from "../../bulk/response";
import { readSectionSheet, type ReadSectionResult } from "../../bulk/sheet";
import { translateApplyError } from "../../bulk/transaction";
import { db } from "../../db";
import { HttpError } from "../../http/errors";
import { buildCongressChangeSet, collectRefs, type CongressChangeSet, type CongressSnapshot } from "./changes";
import {
  CONGRESS_COLUMNS,
  CONGRESSES_LABEL,
  CONGRESSES_MAX_ROWS,
  CONGRESSES_PURPOSE,
  CONGRESSES_SECTION,
  CONGRESSES_TEMPLATE_FILE,
  congressesExportFileName,
  type CongressColumnKey,
  type CongressIssueCode,
} from "./format";
import { insertCongresses, loadCongressSnapshot, updateCongresses, withCongressesBulkLock } from "./repository";
import { parseCongressRow, type ParsedCongressRow } from "./rows";
import { buildCongressesWorkbook } from "./workbook";

const CONFLICT_CHANGED =
  "Los congresos cambiaron desde la vista previa. No se aplicó ningún cambio; valida el archivo de nuevo.";

export async function buildCongressesTemplate(now: Date = new Date()) {
  const snapshot = await loadCongressSnapshot(db());
  const bytes = await buildCongressesWorkbook({ kind: "plantilla", congresses: [], reference: snapshot.reference, generatedAt: now });
  return { fileName: CONGRESSES_TEMPLATE_FILE, bytes };
}

export async function buildCongressesExport(now: Date = new Date()) {
  const snapshot = await loadCongressSnapshot(db());
  const bytes = await buildCongressesWorkbook({ kind: "datos", congresses: snapshot.congresses, reference: snapshot.reference, generatedAt: now });
  return { fileName: congressesExportFileName(todayInCaracas(now)), bytes };
}

type Read = ReadSectionResult<CongressColumnKey>;

const readFile = (input: { fileName: string; bytes: Uint8Array }): Promise<Read> =>
  readSectionSheet<CongressColumnKey>({
    fileName: input.fileName,
    bytes: input.bytes,
    sectionLabel: CONGRESSES_LABEL,
    columns: CONGRESS_COLUMNS,
    idKey: "id",
    maxRows: CONGRESSES_MAX_ROWS,
  });

const parseRows = (read: Read) => read.rows.map((row) => parseCongressRow(row.cells, read.columns, row.excelRow));
const SEVERITY_ORDER = { error: 0, warning: 1, notice: 2 } as const;

function analyze(read: Read, rows: ParsedCongressRow[], snapshot: CongressSnapshot, now: Date) {
  const changeSet = buildCongressChangeSet({ rows, workbook: { generatedAt: read.workbook.generatedAt }, snapshot, today: todayInCaracas(now) });
  const issues: ValidationIssue<CongressIssueCode>[] = [...groupIssues(read.issues), ...changeSet.issues].sort(
    (left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity],
  );
  const hasFileErrors = read.issues.some((issue) => issue.severity === "error");
  return { changeSet, issues, status: hasFileErrors ? ("invalid" as const) : changeSet.status };
}

export async function previewCongressesFile(input: {
  fileName: string;
  bytes: Uint8Array;
  sessionToken: string;
  now?: Date;
}): Promise<BulkPreviewResponse> {
  const startedAt = Date.now();
  const now = input.now ?? new Date();
  const read = await readFile(input);
  const rows = parseRows(read);
  const hasFileErrors = read.issues.some((issue) => issue.severity === "error");
  let changeSet: CongressChangeSet | null = null;
  let issues: ValidationIssue<CongressIssueCode>[] = groupIssues(read.issues);
  let status: "ready" | "invalid" | "no_changes" = "invalid";
  if (!hasFileErrors) ({ changeSet, issues, status } = analyze(read, rows, await loadCongressSnapshot(db()), now));
  const token =
    status === "ready" && changeSet
      ? (() => {
          const signed = signBulkPreviewToken(
            { section: CONGRESSES_SECTION, fileSha256: read.workbook.sha256, baseline: changeSet.baseline },
            input.sessionToken,
            CONGRESSES_PURPOSE,
            now.getTime(),
          );
          return { token: signed.token, expiresAt: signed.payload.expiresAt };
        })()
      : null;
  console.info("congresses.bulk.preview", { status, rows: read.rows.length, durationMs: Date.now() - startedAt });
  return toBulkPreviewResponse({
    section: CONGRESSES_SECTION,
    status,
    fileName: input.fileName,
    workbook: read.workbook,
    rowCount: read.rows.length,
    counts: changeSet?.counts ?? { created: 0, updated: 0, unchanged: 0 },
    issues,
    changes: changeSet?.changes ?? [],
    token,
  });
}

export async function applyCongressesFile(input: {
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
    section: CONGRESSES_SECTION,
    bytes: input.bytes,
    now: now.getTime(),
  });
  const read = await readFile(input);
  const rows = parseRows(read);
  try {
    const result = await withCongressesBulkLock({ refs: collectRefs(rows), lockTimeoutMs: input.lockTimeoutMs }, async (transaction, snapshot) => {
      const analysis = analyze(read, rows, snapshot, now);
      if (analysis.status !== "ready" || analysis.changeSet.baseline !== payload.baseline) {
        throw new HttpError(409, "CONFLICT", CONFLICT_CHANGED);
      }
      const { creates, updates } = analysis.changeSet.writes;
      await updateCongresses(transaction, updates, now);
      const created = await insertCongresses(transaction, creates, now);
      return { created, updated: updates.map((write) => ({ ref: write.ref, label: write.label })) };
    });
    console.info("congresses.bulk.apply", { created: result.created.length, updated: result.updated.length, durationMs: Date.now() - startedAt });
    const withUrl = (record: { ref: number; label: string }) => ({ ...record, url: `/admin/congresos/${record.ref}` });
    return toBulkApplyResponse({
      section: CONGRESSES_SECTION,
      appliedAt: now,
      summary: { created: result.created.length, updated: result.updated.length },
      created: result.created.map(withUrl),
      updated: result.updated.map(withUrl),
    });
  } catch (error) {
    if (error instanceof BulkFileError) throw error;
    const translated = translateApplyError(error, { changedMessage: CONFLICT_CHANGED });
    if (!(error instanceof HttpError)) console.error("congresses.bulk.apply failed", { status: translated.status });
    throw translated;
  }
}
