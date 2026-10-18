import type { InventoryChangeSet, ProductChange } from "./changes";
import { countIssues, type ValidationIssue } from "./issues";
import type { InventoryWorkbookInfo } from "./workbook-reader";

export interface PreviewResponse {
  status: "ready" | "invalid" | "no_changes";
  file: {
    name: string;
    kind: InventoryWorkbookInfo["kind"];
    generatedAt: string | null;
    productRows: number;
  };
  summary: {
    newProducts: number;
    updatedProducts: number;
    unchangedProducts: number;
    newSizes: number;
    changedStocks: number;
    errors: number;
    warnings: number;
  };
  issues: ValidationIssue[];
  changes: Array<{
    row: number;
    action: "create" | "update";
    id: number | null;
    label: string;
    fields: ProductChange["fields"];
    sizes: ProductChange["sizes"];
    availability: ProductChange["availability"];
    warnings: ProductChange["warnings"];
  }>;
  preview: { token: string; expiresAt: string } | null;
}

export interface ApplyResponse {
  status: "applied";
  appliedAt: string;
  summary: {
    createdProducts: number;
    updatedProducts: number;
    createdSizes: number;
    changedStocks: number;
  };
  created: AppliedProduct[];
  updated: AppliedProduct[];
}

export interface AppliedProduct {
  id: number;
  documentId: string;
  label: string;
  editUrl: string;
}

export function toPreviewResponse(input: {
  fileName: string;
  workbook: InventoryWorkbookInfo;
  productRows: number;
  changeSet: InventoryChangeSet;
  issues?: ValidationIssue[];
  token?: { token: string; expiresAt: number } | null;
}): PreviewResponse {
  const { changeSet, workbook } = input;
  const issues = input.issues ?? changeSet.issues;
  const { errors, warnings } = countIssues(issues);
  const changes = [...changeSet.creates, ...changeSet.updates]
    .sort((left, right) => left.excelRow - right.excelRow)
    .map((change) => ({
      row: change.excelRow,
      action: change.action,
      id: change.legacyId,
      label: change.label,
      fields: change.fields,
      sizes: change.sizes,
      availability: change.availability,
      warnings: change.warnings,
    }));
  return {
    status: changeSet.status,
    file: {
      name: input.fileName,
      kind: workbook.kind,
      generatedAt: workbook.generatedAt ? workbook.generatedAt.toISOString() : null,
      productRows: input.productRows,
    },
    summary: { ...changeSet.counts, errors, warnings },
    issues,
    changes: changeSet.status === "invalid" ? [] : changes,
    preview:
      changeSet.status === "ready" && input.token
        ? { token: input.token.token, expiresAt: new Date(input.token.expiresAt).toISOString() }
        : null,
  };
}

const editUrl = (documentId: string) => `/admin/productos/${documentId}`;

export function toApplyResponse(input: {
  appliedAt: Date;
  counts: InventoryChangeSet["counts"];
  created: Array<{ id: number; documentId: string; label: string }>;
  updated: Array<{ id: number; documentId: string; label: string }>;
}): ApplyResponse {
  const toApplied = (product: { id: number; documentId: string; label: string }): AppliedProduct => ({
    id: product.id,
    documentId: product.documentId,
    label: product.label,
    editUrl: editUrl(product.documentId),
  });
  return {
    status: "applied",
    appliedAt: input.appliedAt.toISOString(),
    summary: {
      createdProducts: input.counts.newProducts,
      updatedProducts: input.counts.updatedProducts,
      createdSizes: input.counts.newSizes,
      changedStocks: input.counts.changedStocks,
    },
    created: input.created.map(toApplied),
    updated: input.updated.map(toApplied),
  };
}
