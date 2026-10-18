import { eq, sql } from "drizzle-orm";
import { products, productVariants } from "../../db/schema";
import { db } from "../db";

export interface InventoryStatsRow {
  type: string;
  size: string;
  units: number;
  value: number;
}

export interface InventoryStatsGroup {
  label: string;
  units: number;
  value: number;
}

export interface InventoryStats {
  totalUnits: number;
  totalValue: number;
  byType: InventoryStatsGroup[];
  bySize: InventoryStatsGroup[];
}

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

export function compareSizes(left: string, right: string) {
  const leftIndex = SIZE_ORDER.indexOf(left.trim().toUpperCase());
  const rightIndex = SIZE_ORDER.indexOf(right.trim().toUpperCase());
  if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
  if (leftIndex !== -1) return -1;
  if (rightIndex !== -1) return 1;
  return left.localeCompare(right, "es", { numeric: true, sensitivity: "base" });
}

function addTo(map: Map<string, InventoryStatsGroup>, label: string, units: number, value: number) {
  const group = map.get(label) ?? { label, units: 0, value: 0 };
  group.units += units;
  group.value += value;
  map.set(label, group);
}

/** Agrupa filas (tipo, talla) en totales por tipo, por talla y globales. */
export function buildInventoryStats(rows: InventoryStatsRow[]): InventoryStats {
  const byType = new Map<string, InventoryStatsGroup>();
  const bySize = new Map<string, InventoryStatsGroup>();
  let totalUnits = 0;
  let totalValue = 0;
  for (const row of rows) {
    totalUnits += row.units;
    totalValue += row.value;
    addTo(byType, row.type.trim() || "Sin tipo", row.units, row.value);
    addTo(bySize, row.size.trim() || "Sin talla", row.units, row.value);
  }
  return {
    totalUnits,
    totalValue,
    byType: [...byType.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "es")),
    bySize: [...bySize.values()].sort((a, b) => compareSizes(a.label, b.label)),
  };
}

/** Existencias y valor (cantidad × precio) de todos los productos con stock positivo. */
export async function getInventoryStats(): Promise<InventoryStats> {
  const rows = await db()
    .select({
      type: products.legacyTypeLabel,
      size: productVariants.sizeLabel,
      units: sql<string>`sum(${productVariants.quantity})`,
      value: sql<string>`sum(${productVariants.quantity} * ${products.price})`,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(sql`${productVariants.quantity} > 0`)
    .groupBy(products.legacyTypeLabel, productVariants.sizeLabel);
  return buildInventoryStats(
    rows.map((row) => ({
      type: row.type,
      size: row.size,
      units: Number(row.units),
      value: Number(row.value),
    })),
  );
}
