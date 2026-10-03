import type { Genero, Producto, TallaStock } from "./types";

export type GuidedGender = Exclude<Genero, "Unisex">;
export type GuidedStep = "gender" | "sizes" | "garment" | "results";
export type GuidedView = "guided" | "all";
export type GarmentGroup = "uniformes" | "batas";

export interface GuidedCatalogSelection {
  step: GuidedStep;
  view: GuidedView;
  gender: GuidedGender | null;
  sizeLabels: string[];
  typeLabel: string | null;
}

export interface CatalogFilterRecord {
  productId: number | string;
  gender: Genero;
  typeLabel: string;
  positiveSizeLabels: string[];
}

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL"] as const;
const SIZE_RANK = new Map<string, number>(SIZE_ORDER.map((label, index) => [label, index]));

function uniqueLabels(labels: string[]) {
  return [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
}

export function compareSizeLabels(left: string, right: string) {
  const leftLabel = left.trim().toLocaleUpperCase();
  const rightLabel = right.trim().toLocaleUpperCase();
  const leftRank = SIZE_RANK.get(leftLabel);
  const rightRank = SIZE_RANK.get(rightLabel);

  if (leftRank !== undefined && rightRank !== undefined) return leftRank - rightRank;
  if (leftRank !== undefined) return -1;
  if (rightRank !== undefined) return 1;

  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

export function sortSizeLabels(labels: string[]) {
  return [...labels].sort(compareSizeLabels);
}

export function normalizeTypeLabel(typeLabel: string) {
  return typeLabel
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

export function getGarmentGroup(typeLabel: string): GarmentGroup {
  return normalizeTypeLabel(typeLabel).includes("bata") ? "batas" : "uniformes";
}

export function getPositiveSizeLabels(variants: Pick<TallaStock, "Talla" | "cantidad_actual">[]) {
  return uniqueLabels(
    variants
      .filter((variant) => variant.cantidad_actual > 0)
      .map((variant) => variant.Talla),
  );
}

export function toCatalogFilterRecord(product: Producto): CatalogFilterRecord {
  return {
    productId: product.id,
    gender: product.Genero,
    typeLabel: product.Tipo,
    positiveSizeLabels: getPositiveSizeLabels(product.Talla),
  };
}

export function isCompatibleGender(productGender: Genero, selectedGender: GuidedGender | null) {
  return selectedGender === null || productGender === selectedGender || productGender === "Unisex";
}

export function getAvailableSizeLabels(
  records: CatalogFilterRecord[],
  selectedGender: GuidedGender | null,
) {
  const labels = records
    .filter((record) => isCompatibleGender(record.gender, selectedGender))
    .flatMap((record) => record.positiveSizeLabels);

  return sortSizeLabels(uniqueLabels(labels));
}

export function getAvailableTypeLabels(
  records: CatalogFilterRecord[],
  selectedGender: GuidedGender | null = null,
  selectedSizeLabels: string[] = [],
) {
  const labels = records
    .filter((record) => {
      if (!record.typeLabel.trim() || !record.positiveSizeLabels.length) return false;
      if (!isCompatibleGender(record.gender, selectedGender)) return false;
      if (!selectedSizeLabels.length) return true;
      return selectedSizeLabels.some((label) => record.positiveSizeLabels.includes(label));
    })
    .map((record) => record.typeLabel.trim());

  return uniqueLabels(labels).sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

export function matchesCatalogRecord(
  record: CatalogFilterRecord,
  selection: Pick<GuidedCatalogSelection, "gender" | "sizeLabels" | "typeLabel">,
) {
  if (!record.positiveSizeLabels.length) return false;
  if (!isCompatibleGender(record.gender, selection.gender)) return false;
  if (selection.typeLabel && record.typeLabel.trim() !== selection.typeLabel.trim()) {
    return false;
  }
  if (!selection.sizeLabels.length) return true;

  return selection.sizeLabels.some((label) => record.positiveSizeLabels.includes(label));
}

export function filterCatalogRecords(
  records: CatalogFilterRecord[],
  selection: Pick<GuidedCatalogSelection, "gender" | "sizeLabels" | "typeLabel">,
) {
  return records.filter((record) => matchesCatalogRecord(record, selection));
}
