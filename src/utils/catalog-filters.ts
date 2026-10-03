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
  garmentGroup: GarmentGroup | null;
}

export interface CatalogFilterRecord {
  productId: number | string;
  gender: Genero;
  typeLabel: string;
  positiveSizeLabels: string[];
}

function uniqueLabels(labels: string[]) {
  return [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
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

  return uniqueLabels(labels).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

export function matchesCatalogRecord(
  record: CatalogFilterRecord,
  selection: Pick<GuidedCatalogSelection, "gender" | "sizeLabels" | "garmentGroup">,
) {
  if (!record.positiveSizeLabels.length) return false;
  if (!isCompatibleGender(record.gender, selection.gender)) return false;
  if (selection.garmentGroup && getGarmentGroup(record.typeLabel) !== selection.garmentGroup) {
    return false;
  }
  if (!selection.sizeLabels.length) return true;

  return selection.sizeLabels.some((label) => record.positiveSizeLabels.includes(label));
}

export function filterCatalogRecords(
  records: CatalogFilterRecord[],
  selection: Pick<GuidedCatalogSelection, "gender" | "sizeLabels" | "garmentGroup">,
) {
  return records.filter((record) => matchesCatalogRecord(record, selection));
}
