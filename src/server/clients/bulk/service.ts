import { todayInCaracas } from "../../../utils/dates";
import { BulkFileError, groupIssues, type ValidationIssue } from "../../bulk/issues";
import { assertApplicableToken, signBulkPreviewToken } from "../../bulk/preview-token";
import {
  toBulkApplyResponse,
  toBulkPreviewResponse,
  type BulkApplyResponse,
  type BulkPreviewResponse,
} from "../../bulk/response";
import { readSectionSheet, type ReadSectionResult } from "../../bulk/sheet";
import { translateApplyError } from "../../bulk/transaction";
import { db } from "../../db";
import { HttpError } from "../../http/errors";
import { clientsExportFileName } from "./format";
import {
  buildClientChangeSet,
  collectReferences,
  type ClientChangeSet,
  type ClientSnapshot,
} from "./changes";
import {
  CLIENTS_LABEL,
  CLIENTS_MAX_ROWS,
  CLIENTS_PURPOSE,
  CLIENTS_SECTION,
  CLIENTS_TEMPLATE_FILE,
  CLIENT_COLUMNS,
  type ClientColumnKey,
  type ClientIssueCode,
} from "./format";
import { insertClients, loadClientSnapshot, updateClients, withClientsBulkLock } from "./repository";
import { parseClientRow, type ParsedClientRow } from "./rows";
import { buildClientsWorkbook } from "./workbook";

export interface DownloadFile {
  fileName: string;
  bytes: Buffer;
}

const CONFLICT_CHANGED =
  "Los clientes cambiaron desde la vista previa. No se aplicó ningún cambio; valida el archivo de nuevo.";

export async function buildClientsTemplate(now: Date = new Date()): Promise<DownloadFile> {
  const snapshot = await loadClientSnapshot(db());
  const bytes = await buildClientsWorkbook({ kind: "plantilla", clients: [], reference: snapshot.reference, generatedAt: now });
  return { fileName: CLIENTS_TEMPLATE_FILE, bytes };
}

export async function buildClientsExport(now: Date = new Date()): Promise<DownloadFile> {
  const snapshot = await loadClientSnapshot(db());
  const bytes = await buildClientsWorkbook({
    kind: "datos",
    clients: snapshot.clients,
    reference: snapshot.reference,
    generatedAt: now,
  });
  return { fileName: clientsExportFileName(todayInCaracas(now)), bytes };
}

type Read = ReadSectionResult<ClientColumnKey>;

function readClientsFile(input: { fileName: string; bytes: Uint8Array }): Promise<Read> {
  return readSectionSheet<ClientColumnKey>({
    fileName: input.fileName,
    bytes: input.bytes,
    sectionLabel: CLIENTS_LABEL,
    columns: CLIENT_COLUMNS,
    idKey: "id",
    maxRows: CLIENTS_MAX_ROWS,
  });
}

interface Analysis {
  rows: ParsedClientRow[];
  changeSet: ClientChangeSet;
  issues: ValidationIssue<ClientIssueCode>[];
  status: ClientChangeSet["status"];
}

const SEVERITY_ORDER = { error: 0, warning: 1, notice: 2 } as const;

function parseRows(read: Read) {
  return read.rows.map((row) => parseClientRow(row.cells, read.columns, row.excelRow));
}

function analyze(read: Read, rows: ParsedClientRow[], snapshot: ClientSnapshot, now: Date): Analysis {
  const changeSet = buildClientChangeSet({
    rows,
    workbook: { generatedAt: read.workbook.generatedAt },
    snapshot,
    today: todayInCaracas(now),
  });
  const fileIssues = read.issues;
  const issues = [...groupIssues(fileIssues), ...changeSet.issues].sort(
    (left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity],
  );
  const hasFileErrors = fileIssues.some((issue) => issue.severity === "error");
  return { rows, changeSet, issues, status: hasFileErrors ? "invalid" : changeSet.status };
}

export async function previewClientsFile(input: {
  fileName: string;
  bytes: Uint8Array;
  sessionToken: string;
  now?: Date;
}): Promise<BulkPreviewResponse> {
  const startedAt = Date.now();
  const now = input.now ?? new Date();
  const read = await readClientsFile(input);
  const rows = parseRows(read);
  const hasFileErrors = read.issues.some((issue) => issue.severity === "error");
  const snapshot = hasFileErrors ? null : await loadClientSnapshot(db());
  const analysis = snapshot
    ? analyze(read, rows, snapshot, now)
    : ({
        rows,
        changeSet: { status: "invalid", counts: { created: 0, updated: 0, unchanged: 0 }, issues: [], changes: [], writes: { creates: [], updates: [] }, baseline: "" },
        issues: groupIssues(read.issues),
        status: "invalid",
      } satisfies Analysis);

  const token =
    analysis.status === "ready"
      ? (() => {
          const signed = signBulkPreviewToken(
            { section: CLIENTS_SECTION, fileSha256: read.workbook.sha256, baseline: analysis.changeSet.baseline },
            input.sessionToken,
            CLIENTS_PURPOSE,
            now.getTime(),
          );
          return { token: signed.token, expiresAt: signed.payload.expiresAt };
        })()
      : null;
  console.info("clients.bulk.preview", { status: analysis.status, rows: read.rows.length, durationMs: Date.now() - startedAt });
  return toBulkPreviewResponse({
    section: CLIENTS_SECTION,
    status: analysis.status,
    fileName: input.fileName,
    workbook: read.workbook,
    rowCount: read.rows.length,
    counts: analysis.changeSet.counts,
    issues: analysis.issues,
    changes: analysis.changeSet.changes,
    token,
  });
}

export async function applyClientsFile(input: {
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
    section: CLIENTS_SECTION,
    bytes: input.bytes,
    now: now.getTime(),
  });

  const read = await readClientsFile(input);
  const rows = parseRows(read);
  const { refs, phones } = collectReferences(rows);
  const changed = () => new HttpError(409, "CONFLICT", CONFLICT_CHANGED);

  try {
    const result = await withClientsBulkLock({ refs, phones, lockTimeoutMs: input.lockTimeoutMs }, async (transaction, snapshot) => {
      const analysis = analyze(read, rows, snapshot, now);
      if (analysis.status !== "ready" || analysis.changeSet.baseline !== payload.baseline) throw changed();
      const { creates, updates } = analysis.changeSet.writes;
      await updateClients(transaction, updates, now);
      const refsByPhone = await insertClients(transaction, creates, now);
      return {
        created: creates.map((write) => ({ ref: refsByPhone.get(write.values.phoneE164) ?? 0, label: write.label })),
        updated: updates.map((write) => ({ ref: write.ref, label: write.label })),
      };
    });
    console.info("clients.bulk.apply", {
      created: result.created.length,
      updated: result.updated.length,
      durationMs: Date.now() - startedAt,
    });
    const withUrl = (record: { ref: number; label: string }) => ({ ...record, url: `/admin/clientes/${record.ref}` });
    return toBulkApplyResponse({
      section: CLIENTS_SECTION,
      appliedAt: now,
      summary: { created: result.created.length, updated: result.updated.length },
      created: result.created.map(withUrl),
      updated: result.updated.map(withUrl),
    });
  } catch (error) {
    if (error instanceof BulkFileError) throw error;
    const translated = translateApplyError(error, { changedMessage: CONFLICT_CHANGED });
    if (!(error instanceof HttpError)) {
      console.error("clients.bulk.apply failed", { status: translated.status, durationMs: Date.now() - startedAt });
    }
    throw translated;
  }
}
