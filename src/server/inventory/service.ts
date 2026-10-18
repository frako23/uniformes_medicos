import { createHash } from "node:crypto";
import { db } from "../db";
import { HttpError } from "../http/errors";
import { buildChangeSet, type CatalogSnapshot, type InventoryChangeSet } from "./changes";
import { groupIssues, type RawIssue, type ValidationIssue } from "./issues";
import { signPreviewToken, verifyPreviewToken } from "./preview-token";
import {
  applyProductUpdates,
  insertNewProducts,
  loadCatalogSnapshot,
  pgErrorCode,
  withInventoryLock,
} from "./repository";
import { toApplyResponse, toPreviewResponse, type ApplyResponse, type PreviewResponse } from "./response";
import { parseInventoryRow } from "./rows";
import { buildInventoryWorkbook } from "./workbook-writer";
import { inventoryFileName, TEMPLATE_FILE_NAME } from "./workbook-format";
import { readInventoryWorkbook, type ReadInventoryResult } from "./workbook-reader";

export interface DownloadFile {
  fileName: string;
  bytes: Buffer;
}

const CONFLICT_CHANGED = "El inventario cambió desde la vista previa. No se aplicó ningún cambio; valida el archivo de nuevo.";

export async function buildInventoryExport(now: Date = new Date()): Promise<DownloadFile> {
  const snapshot = await loadCatalogSnapshot(db());
  const bytes = await buildInventoryWorkbook({ kind: "inventario", snapshot, generatedAt: now });
  return { fileName: inventoryFileName(now), bytes };
}

export async function buildInventoryTemplate(now: Date = new Date()): Promise<DownloadFile> {
  const snapshot = await loadCatalogSnapshot(db());
  const bytes = await buildInventoryWorkbook({ kind: "plantilla", snapshot, generatedAt: now });
  return { fileName: TEMPLATE_FILE_NAME, bytes };
}

interface Analysis {
  read: ReadInventoryResult;
  changeSet: InventoryChangeSet;
  issues: ValidationIssue[];
  /** Los errores del archivo completo también invalidan el conjunto de cambios. */
  status: InventoryChangeSet["status"];
}

const SEVERITY_ORDER = { error: 0, warning: 1, notice: 2 } as const;

function analyze(read: ReadInventoryResult, snapshot: CatalogSnapshot): Analysis {
  const rows = read.rows.map((row) => parseInventoryRow(row.cells, read.columns, row.excelRow));
  const changeSet = buildChangeSet({
    rows,
    workbook: { generatedAt: read.workbook.generatedAt, columns: read.columns },
    snapshot,
  });
  const fileIssues: RawIssue[] = read.issues;
  const issues = [...groupIssues(fileIssues), ...changeSet.issues].sort(
    (left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity],
  );
  const hasFileErrors = fileIssues.some((issue) => issue.severity === "error");
  return { read, changeSet, issues, status: hasFileErrors ? "invalid" : changeSet.status };
}

export async function previewInventoryFile(input: {
  fileName: string;
  bytes: Uint8Array;
  sessionToken: string;
  now?: Date;
}): Promise<PreviewResponse> {
  const now = input.now ?? new Date();
  const read = await readInventoryWorkbook({ fileName: input.fileName, bytes: input.bytes });
  const snapshot = await loadCatalogSnapshot(db());
  const analysis = analyze(read, snapshot);
  const changeSet = { ...analysis.changeSet, status: analysis.status };
  const token =
    analysis.status === "ready"
      ? (() => {
          const signed = signPreviewToken(
            { fileSha256: read.workbook.sha256, baseline: changeSet.baseline },
            input.sessionToken,
            now.getTime(),
          );
          return { token: signed.token, expiresAt: signed.payload.expiresAt };
        })()
      : null;
  return toPreviewResponse({
    fileName: input.fileName,
    workbook: read.workbook,
    productRows: read.rows.length,
    changeSet,
    issues: analysis.issues,
    token,
  });
}

function conflict(message: string, field?: "previewToken" | "file") {
  return new HttpError(409, "CONFLICT", message, field ? { [field]: message } : undefined);
}

export async function applyInventoryFile(input: {
  fileName: string;
  bytes: Uint8Array;
  previewToken: string;
  sessionToken: string;
  now?: Date;
  lockTimeoutMs?: number;
}): Promise<ApplyResponse> {
  const startedAt = Date.now();
  const now = input.now ?? new Date();

  const verification = verifyPreviewToken(input.previewToken, input.sessionToken, now.getTime());
  if (!verification.ok) {
    throw conflict(
      verification.reason === "expired"
        ? "La vista previa venció. Valida el archivo de nuevo."
        : "La vista previa no es válida. Valida el archivo de nuevo.",
      "previewToken",
    );
  }
  const { payload } = verification;
  const fileSha256 = createHash("sha256").update(input.bytes).digest("hex");
  if (fileSha256 !== payload.fileSha256) throw conflict("El archivo no coincide con el de la vista previa.", "file");

  const read = await readInventoryWorkbook({ fileName: input.fileName, bytes: input.bytes });
  const referencedLegacyIds = [
    ...new Set(
      read.rows
        .map((row) => parseInventoryRow(row.cells, read.columns, row.excelRow).legacyId)
        .filter((id): id is number => id !== null),
    ),
  ];

  try {
    const result = await withInventoryLock({ referencedLegacyIds, lockTimeoutMs: input.lockTimeoutMs }, async (transaction, snapshot) => {
      const analysis = analyze(read, snapshot);
      if (analysis.status !== "ready" || analysis.changeSet.baseline !== payload.baseline) throw conflict(CONFLICT_CHANGED);
      const { writes, counts } = analysis.changeSet;
      await applyProductUpdates(transaction, writes.updates, now);
      const inserted = await insertNewProducts(transaction, writes.creates, now);
      return {
        counts,
        created: inserted.map((product) => ({ id: product.legacyId, documentId: product.documentId, label: product.label })),
        updated: writes.updates.map((update) => ({ id: update.legacyId, documentId: update.documentId, label: update.label })),
      };
    });
    console.info("inventory.apply", { ...result.counts, durationMs: Date.now() - startedAt });
    return toApplyResponse({ appliedAt: now, ...result });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const code = pgErrorCode(error);
    console.error("inventory.apply failed", { code: code ?? "unknown", durationMs: Date.now() - startedAt });
    if (code === "55P03") throw conflict("Otra carga se está aplicando. Inténtalo de nuevo en unos segundos.");
    if (code === "23505") throw conflict(CONFLICT_CHANGED);
    throw new HttpError(500, "DATABASE_ERROR", "No se aplicó ningún cambio. Inténtalo de nuevo.");
  }
}
