import { createHash } from "node:crypto";
import { compareSizeLabels } from "../../utils/catalog-filters";
import { normalizeAdminProductFilterValues } from "../catalog/admin-products";
import { createIssue, groupIssues, type IssueCode, type RawIssue, type ValidationIssue } from "./issues";
import type { Gender, ParsedProductRow, ParsedValues } from "./rows";
import { normalizeHeader, normalizeSizeKey, type WorkbookColumn } from "./workbook-format";

export type ProductFieldKey =
  | "type"
  | "manufacturer"
  | "brand"
  | "gender"
  | "price"
  | "sku"
  | "color"
  | "isPublished"
  | "isActive";

export const FIELD_LABELS: Record<ProductFieldKey, string> = {
  type: "Tipo",
  manufacturer: "Fabricante",
  brand: "Marca",
  gender: "Género",
  price: "Precio",
  sku: "SKU",
  color: "Color",
  isPublished: "Publicado",
  isActive: "Activo",
};

const FIELD_ORDER = Object.keys(FIELD_LABELS) as ProductFieldKey[];

export interface SnapshotVariant {
  id: string;
  sizeLabel: string;
  quantity: number;
}

export interface SnapshotProduct {
  id: string;
  legacyId: number;
  legacyDocumentId: string;
  type: string;
  manufacturer: string;
  brand: string;
  gender: Gender;
  /** Precio con dos decimales: "50.00". */
  price: string;
  sku: string | null;
  color: string;
  isPublished: boolean;
  isActive: boolean;
  updatedAt: Date;
  imageCount: number;
  variants: SnapshotVariant[];
}

export interface CatalogSnapshot {
  products: SnapshotProduct[];
  distinctValues: {
    types: string[];
    manufacturers: string[];
    brands: string[];
    colors: string[];
    sizes: string[];
  };
  /** sizeKey → etiqueta canónica del catálogo. */
  canonicalSizes: Record<string, string>;
  /** SKU → legacyId del producto que lo usa. */
  skuOwners: Record<string, number>;
  marker: { productCount: number; maxLegacyId: number };
}

export type ChangeSetStatus = "ready" | "invalid" | "no_changes";

export interface FieldChange {
  field: ProductFieldKey;
  label: string;
  from: string | null;
  to: string | null;
}

export interface SizeChange {
  label: string;
  from: number | null;
  to: number;
}

export interface ProductChange {
  action: "create" | "update";
  excelRow: number;
  legacyId: number | null;
  label: string;
  fields: FieldChange[];
  sizes: SizeChange[];
  availability: { from: boolean | null; to: boolean };
  warnings: IssueCode[];
}

export interface FinalValues {
  type: string;
  manufacturer: string;
  brand: string;
  gender: Gender;
  price: string;
  sku: string | null;
  color: string;
  isPublished: boolean;
  isActive: boolean;
}

export interface UpdateWrite {
  productId: string;
  legacyId: number;
  documentId: string;
  label: string;
  excelRow: number;
  values: FinalValues;
  skuChanged: boolean;
  variants: Array<{ sizeLabel: string; quantity: number }>;
}

export interface CreateWrite {
  excelRow: number;
  label: string;
  values: FinalValues;
  variants: Array<{ sizeLabel: string; quantity: number }>;
}

export interface InventoryChangeSet {
  creates: ProductChange[];
  updates: ProductChange[];
  counts: {
    newProducts: number;
    updatedProducts: number;
    unchangedProducts: number;
    newSizes: number;
    changedStocks: number;
  };
  issues: ValidationIssue[];
  referencedLegacyIds: number[];
  baseline: string;
  status: ChangeSetStatus;
  writes: { updates: UpdateWrite[]; creates: CreateWrite[] };
}

/* ------------------------------------------------------------------ */
/* Fundamentos                                                         */
/* ------------------------------------------------------------------ */

export function formatDisplayValue(field: ProductFieldKey, value: string | boolean | null): string | null {
  if (value === null) return null;
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (field === "price") return Number(value).toFixed(2);
  return value;
}

export function productLabel(product: { type: string; brand: string; color: string; gender: string }) {
  return `${product.type} · ${product.brand} · ${product.color} · ${product.gender}`;
}

export function isAvailable(input: { isPublished: boolean; isActive: boolean; quantities: number[] }) {
  return input.isPublished && input.isActive && input.quantities.some((quantity) => quantity > 0);
}

export function buildCanonicalSizes(products: Array<{ variants: Array<{ sizeLabel: string }> }>) {
  const usage = new Map<string, Map<string, number>>();
  for (const product of products) {
    for (const variant of product.variants) {
      const key = normalizeSizeKey(variant.sizeLabel);
      const spellings = usage.get(key) ?? new Map<string, number>();
      spellings.set(variant.sizeLabel, (spellings.get(variant.sizeLabel) ?? 0) + 1);
      usage.set(key, spellings);
    }
  }
  const canonical: Record<string, string> = {};
  for (const [key, spellings] of usage) {
    canonical[key] = [...spellings.entries()].sort(
      (left, right) => right[1] - left[1] || compareSizeLabels(left[0], right[0]) || compareText(left[0], right[0]),
    )[0][0];
  }
  return canonical;
}

/** Construye la instantánea derivada (valores distintos, tallas canónicas, SKU y marcador). */
export function createSnapshot(products: SnapshotProduct[]): CatalogSnapshot {
  const skuOwners: Record<string, number> = {};
  let maxLegacyId = 0;
  for (const product of products) {
    if (product.sku) skuOwners[product.sku] = product.legacyId;
    maxLegacyId = Math.max(maxLegacyId, product.legacyId);
  }
  const canonicalSizes = buildCanonicalSizes(products);
  return {
    products,
    distinctValues: {
      types: normalizeAdminProductFilterValues(products.map((product) => product.type)),
      manufacturers: normalizeAdminProductFilterValues(products.map((product) => product.manufacturer)),
      brands: normalizeAdminProductFilterValues(products.map((product) => product.brand)),
      colors: normalizeAdminProductFilterValues(products.map((product) => product.color)),
      sizes: Object.values(canonicalSizes).sort(compareSizeLabels),
    },
    canonicalSizes,
    skuOwners,
    marker: { productCount: products.length, maxLegacyId },
  };
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function computeBaseline(snapshot: CatalogSnapshot, referencedLegacyIds: Iterable<number>) {
  const referenced = new Set(referencedLegacyIds);
  const products = snapshot.products
    .filter((product) => referenced.has(product.legacyId))
    .sort((left, right) => left.legacyId - right.legacyId)
    .map((product) => [
      product.legacyId,
      product.type,
      product.manufacturer,
      product.brand,
      product.gender,
      product.price,
      product.sku,
      product.color,
      product.isPublished,
      product.isActive,
      [...product.variants]
        .sort((left, right) => compareText(left.sizeLabel, right.sizeLabel))
        .map((variant) => [variant.sizeLabel, variant.quantity]),
    ]);
  const canonical = JSON.stringify(["v1", snapshot.marker.productCount, snapshot.marker.maxLegacyId, products]);
  return createHash("sha256").update(canonical).digest("hex");
}

/* ------------------------------------------------------------------ */
/* Conjunto de cambios                                                 */
/* ------------------------------------------------------------------ */

export interface BuildChangeSetInput {
  rows: ParsedProductRow[];
  workbook: { generatedAt: Date | null; columns: WorkbookColumn[] };
  snapshot: CatalogSnapshot;
}

function foldKey(text: string) {
  return normalizeHeader(text);
}

interface Resolved {
  row: ParsedProductRow;
  product: SnapshotProduct | null;
  values: FinalValues;
  sizeChanges: SizeChange[];
  writeVariants: Array<{ sizeLabel: string; quantity: number }>;
  fieldChanges: FieldChange[];
  newSizes: number;
  changedStocks: number;
  finalQuantities: number[];
}

function toFinalValues(values: ParsedValues, product: SnapshotProduct | null): FinalValues {
  return {
    type: values.type ?? product?.type ?? "",
    manufacturer: values.manufacturer ?? product?.manufacturer ?? "",
    brand: values.brand ?? product?.brand ?? "",
    gender: values.gender ?? product?.gender ?? "Unisex",
    price: values.price ?? product?.price ?? "0.00",
    sku: values.sku === undefined ? (product?.sku ?? null) : values.sku,
    color: values.color ?? product?.color ?? "",
    isPublished: values.isPublished ?? product?.isPublished ?? false,
    isActive: values.isActive ?? product?.isActive ?? true,
  };
}

function fieldValue(values: FinalValues | SnapshotProduct, field: ProductFieldKey): string | boolean | null {
  return values[field];
}

function describeField(field: ProductFieldKey, value: string | boolean | null) {
  return formatDisplayValue(field, value);
}

export function buildChangeSet({ rows, workbook, snapshot }: BuildChangeSetInput): InventoryChangeSet {
  const issues: RawIssue[] = [];
  const byLegacyId = new Map(snapshot.products.map((product) => [product.legacyId, product]));
  const sizeColumns = workbook.columns.filter((column) => column.key === "size");
  const headerOf = (key: ProductFieldKey | "id") =>
    workbook.columns.find((column) => column.key === key)?.header ?? (key === "id" ? "ID" : FIELD_LABELS[key as ProductFieldKey]);

  for (const row of rows) issues.push(...row.issues);
  const rowsWithErrors = new Set(rows.filter((row) => row.issues.some((issue) => issue.severity === "error")).map((row) => row.excelRow));

  // 1. Identificación.
  const idRows = new Map<number, ParsedProductRow[]>();
  for (const row of rows) {
    if (row.legacyId === null) continue;
    idRows.set(row.legacyId, [...(idRows.get(row.legacyId) ?? []), row]);
  }
  for (const [legacyId, group] of idRows) {
    if (group.length > 1) {
      for (const row of group) {
        issues.push(createIssue("DUPLICATE_ID", { column: headerOf("id"), row: row.excelRow }));
        rowsWithErrors.add(row.excelRow);
      }
    } else if (!byLegacyId.has(legacyId)) {
      issues.push(createIssue("UNKNOWN_ID", { column: headerOf("id"), row: group[0].excelRow }));
      rowsWithErrors.add(group[0].excelRow);
    }
  }

  // 2. Resolución de tallas y comparación de campos, fila por fila.
  const resolved: Resolved[] = [];
  const referencedLegacyIds: number[] = [];
  for (const row of rows) {
    if (rowsWithErrors.has(row.excelRow)) continue;
    const product = row.legacyId === null ? null : (byLegacyId.get(row.legacyId) ?? null);
    if (row.legacyId !== null && !product) continue;
    if (product) referencedLegacyIds.push(product.legacyId);

    const values = toFinalValues(row.values, product);
    const variantsByKey = new Map<string, SnapshotVariant[]>();
    for (const variant of product?.variants ?? []) {
      const key = normalizeSizeKey(variant.sizeLabel);
      variantsByKey.set(key, [...(variantsByKey.get(key) ?? []), variant]);
    }

    const sizeChanges: SizeChange[] = [];
    const writeVariants: Array<{ sizeLabel: string; quantity: number }> = [];
    const finalByLabel = new Map<string, number>(
      (product?.variants ?? []).map((variant) => [variant.sizeLabel, variant.quantity]),
    );
    let newSizes = 0;
    let changedStocks = 0;
    let rowFailed = false;

    for (const column of sizeColumns) {
      const key = column.sizeKey as string;
      const parsed = row.sizes[key];
      if (!parsed) continue;
      const existing = variantsByKey.get(key) ?? [];
      if (existing.length > 1) {
        issues.push(
          createIssue("AMBIGUOUS_SIZES", {
            column: column.header,
            row: row.excelRow,
            list: existing.map((variant) => variant.sizeLabel),
          }),
        );
        rowFailed = true;
        continue;
      }
      if (parsed.quantity === null) {
        if (existing.length === 1) {
          issues.push(createIssue("EXISTING_SIZE_BLANK", { column: column.header, row: row.excelRow }));
          rowFailed = true;
        }
        continue;
      }
      if (existing.length === 1) {
        const current = existing[0];
        if (current.quantity !== parsed.quantity) {
          sizeChanges.push({ label: current.sizeLabel, from: current.quantity, to: parsed.quantity });
          writeVariants.push({ sizeLabel: current.sizeLabel, quantity: parsed.quantity });
          finalByLabel.set(current.sizeLabel, parsed.quantity);
          changedStocks += 1;
        }
      } else {
        const label = (Object.hasOwn(snapshot.canonicalSizes, key) ? snapshot.canonicalSizes[key] : undefined) ?? column.sizeLabel ?? parsed.label;
        sizeChanges.push({ label, from: null, to: parsed.quantity });
        writeVariants.push({ sizeLabel: label, quantity: parsed.quantity });
        finalByLabel.set(label, parsed.quantity);
        newSizes += 1;
      }
    }
    if (rowFailed) {
      rowsWithErrors.add(row.excelRow);
      continue;
    }

    const fieldChanges: FieldChange[] = [];
    for (const field of FIELD_ORDER) {
      const to = fieldValue(values, field);
      const from = product ? fieldValue(product, field) : null;
      if (product && from === to) continue;
      fieldChanges.push({
        field,
        label: FIELD_LABELS[field],
        from: product ? describeField(field, from) : null,
        to: describeField(field, to),
      });
    }

    resolved.push({
      row,
      product,
      values,
      sizeChanges,
      writeVariants,
      fieldChanges,
      newSizes,
      changedStocks,
      finalQuantities: [...finalByLabel.values()],
    });
  }

  // 3. SKU sobre el resultado final.
  const finalSkuRows = new Map<string, Resolved[]>();
  for (const item of resolved) {
    if (!item.values.sku) continue;
    finalSkuRows.set(item.values.sku, [...(finalSkuRows.get(item.values.sku) ?? []), item]);
  }
  for (const [sku, group] of finalSkuRows) {
    if (group.length > 1) {
      for (const item of group) {
        issues.push(createIssue("SKU_REPEATED", { column: headerOf("sku"), row: item.row.excelRow }));
      }
      continue;
    }
    const item = group[0];
    const ownerId = Object.hasOwn(snapshot.skuOwners, sku) ? snapshot.skuOwners[sku] : undefined;
    if (ownerId === undefined || ownerId === item.product?.legacyId) continue;
    const ownerInFile = resolved.find((candidate) => candidate.product?.legacyId === ownerId);
    // Si el dueño actual está en el archivo y cambia de SKU, el intercambio es válido.
    if (ownerInFile && ownerInFile.values.sku !== sku) continue;
    issues.push(createIssue("SKU_IN_USE", { column: headerOf("sku"), row: item.row.excelRow, id: ownerId }));
  }

  // 4. Cambios por producto, conteos y advertencias.
  const creates: ProductChange[] = [];
  const updates: ProductChange[] = [];
  const writes: InventoryChangeSet["writes"] = { updates: [], creates: [] };
  let unchangedProducts = 0;
  let newSizes = 0;
  let changedStocks = 0;

  const normalizedCatalog = {
    type: new Set(snapshot.distinctValues.types.map(foldKey)),
    manufacturer: new Set(snapshot.distinctValues.manufacturers.map(foldKey)),
    brand: new Set(snapshot.distinctValues.brands.map(foldKey)),
    color: new Set(snapshot.distinctValues.colors.map(foldKey)),
  } as const;
  const duplicateKey = (values: { type: string; manufacturer: string; brand: string; gender: string; color: string }) =>
    [values.type, values.manufacturer, values.brand, values.gender, values.color].map(foldKey).join("|");
  const existingByDuplicateKey = new Map<string, SnapshotProduct>();
  for (const product of snapshot.products) {
    const key = duplicateKey(product);
    if (!existingByDuplicateKey.has(key)) existingByDuplicateKey.set(key, product);
  }
  const createdByDuplicateKey = new Map<string, number>();
  const newSizeWarned = new Set<string>();

  for (const item of resolved) {
    const { row, product, values } = item;
    const excelRow = row.excelRow;
    const quantities = item.finalQuantities;
    const toAvailable = isAvailable({ isPublished: values.isPublished, isActive: values.isActive, quantities });
    const fromAvailable = product
      ? isAvailable({
          isPublished: product.isPublished,
          isActive: product.isActive,
          quantities: product.variants.map((variant) => variant.quantity),
        })
      : null;
    const hasChange = product === null || item.fieldChanges.length > 0 || item.sizeChanges.length > 0;
    if (!hasChange) {
      unchangedProducts += 1;
      continue;
    }

    const warnings: IssueCode[] = [];
    const warn = (code: IssueCode, params: Parameters<typeof createIssue>[1] = {}) => {
      const issue = createIssue(code, { row: excelRow, ...params });
      issues.push(issue);
      if (!warnings.includes(code)) warnings.push(code);
    };

    // Valores nuevos de campos abiertos (solo si el valor cambia o es un alta).
    for (const field of ["type", "manufacturer", "brand", "color"] as const) {
      const changed = product === null || product[field] !== values[field];
      if (changed && !normalizedCatalog[field].has(foldKey(values[field]))) {
        warn("NEW_VALUE", { column: headerOf(field), value: values[field] });
      }
    }
    for (const column of sizeColumns) {
      const key = column.sizeKey as string;
      const cell = row.sizes[key];
      if (cell && cell.quantity !== null && !Object.hasOwn(snapshot.canonicalSizes, key) && !newSizeWarned.has(key)) {
        newSizeWarned.add(key);
        issues.push(createIssue("NEW_SIZE", { column: column.header, value: column.sizeLabel }));
      }
    }

    if (product === null) {
      const key = duplicateKey(values);
      const existing = existingByDuplicateKey.get(key);
      const earlierRow = createdByDuplicateKey.get(key);
      if (existing) warn("POSSIBLE_DUPLICATE", { reference: `el producto con ID ${existing.legacyId}` });
      else if (earlierRow !== undefined) warn("POSSIBLE_DUPLICATE", { reference: `la fila ${earlierRow}` });
      if (earlierRow === undefined) createdByDuplicateKey.set(key, excelRow);
    }

    const publishedAndActive = values.isPublished && values.isActive;
    const visibilityTurnedOn =
      product === null || (values.isPublished && !product.isPublished) || (values.isActive && !product.isActive);
    const visibilityChanged =
      product === null || values.isPublished !== product.isPublished || values.isActive !== product.isActive;
    const imageCount = product?.imageCount ?? 0;
    if (publishedAndActive && imageCount === 0 && visibilityTurnedOn) warn("PUBLISHED_WITHOUT_IMAGES");
    if (publishedAndActive && !quantities.some((quantity) => quantity > 0) && (visibilityChanged || item.sizeChanges.length > 0)) {
      warn("PUBLISHED_WITHOUT_STOCK");
    }
    if (fromAvailable !== null && fromAvailable !== toAvailable) {
      warn(toAvailable ? "BECOMES_AVAILABLE" : "BECOMES_UNAVAILABLE");
    }
    if (product && workbook.generatedAt && product.updatedAt.getTime() > workbook.generatedAt.getTime()) {
      warn("MODIFIED_AFTER_DOWNLOAD");
    }

    const label = productLabel(values);
    const change: ProductChange = {
      action: product ? "update" : "create",
      excelRow,
      legacyId: product?.legacyId ?? null,
      label,
      fields: item.fieldChanges,
      sizes: item.sizeChanges,
      availability: { from: fromAvailable, to: toAvailable },
      warnings,
    };
    newSizes += item.newSizes;
    changedStocks += item.changedStocks;

    if (product) {
      updates.push(change);
      writes.updates.push({
        productId: product.id,
        legacyId: product.legacyId,
        documentId: product.legacyDocumentId,
        label,
        excelRow,
        values,
        skuChanged: product.sku !== values.sku,
        variants: item.writeVariants,
      });
    } else {
      creates.push(change);
      writes.creates.push({ excelRow, label, values, variants: item.writeVariants });
    }
  }

  const grouped = groupIssues(issues);
  const hasErrors = grouped.some((issue) => issue.severity === "error");
  const status: ChangeSetStatus = hasErrors
    ? "invalid"
    : creates.length + updates.length === 0
      ? "no_changes"
      : "ready";

  return {
    creates,
    updates,
    counts: {
      newProducts: creates.length,
      updatedProducts: updates.length,
      unchangedProducts,
      newSizes,
      changedStocks,
    },
    issues: grouped,
    referencedLegacyIds: [...new Set(referencedLegacyIds)].sort((left, right) => left - right),
    baseline: computeBaseline(snapshot, referencedLegacyIds),
    status,
    writes,
  };
}
