import { sql } from "drizzle-orm";
import { normalizeKey } from "../../utils/text-keys";
import type { DbOrTransaction } from "../db";

export const REFERENCE_FIELDS = ["size", "city", "hospital", "clinic", "specialty"] as const;
export type ReferenceField = (typeof REFERENCE_FIELDS)[number];

export interface ReferenceRow {
  field: ReferenceField;
  value: string;
  count: number;
}

/** Por campo: clave normalizada → escritura canónica. */
export type ReferenceIndex = Record<ReferenceField, Map<string, string>>;

export function buildReferenceIndex(rows: ReferenceRow[]): ReferenceIndex {
  const index = Object.fromEntries(REFERENCE_FIELDS.map((field) => [field, new Map<string, string>()])) as ReferenceIndex;
  // clave → escritura → conteo
  const tally = Object.fromEntries(
    REFERENCE_FIELDS.map((field) => [field, new Map<string, Map<string, number>>()]),
  ) as Record<ReferenceField, Map<string, Map<string, number>>>;

  for (const row of rows) {
    const spelling = row.value.trim();
    const key = normalizeKey(spelling);
    if (!key) continue;
    const spellings = tally[row.field].get(key) ?? new Map<string, number>();
    spellings.set(spelling, (spellings.get(spelling) ?? 0) + row.count);
    tally[row.field].set(key, spellings);
  }

  for (const field of REFERENCE_FIELDS) {
    for (const [key, spellings] of tally[field]) {
      const best = [...spellings.entries()].sort((left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : 1))[0];
      index[field].set(key, best[0]);
    }
  }
  return index;
}

/** Devuelve la escritura canónica de un valor o, si es nuevo, el valor recortado. */
export function canonicalize(
  index: ReferenceIndex,
  field: ReferenceField,
  value: string,
): { value: string; isNew: boolean } {
  const trimmed = value.trim();
  const existing = index[field].get(normalizeKey(trimmed));
  return existing ? { value: existing, isNew: false } : { value: trimmed, isNew: true };
}

/** Lista ordenada de escrituras canónicas, para los desplegables. */
export function referenceOptions(index: ReferenceIndex, field: ReferenceField): string[] {
  return [...index[field].values()].sort((left, right) => left.localeCompare(right, "es"));
}

export async function loadReferenceRows(source: DbOrTransaction): Promise<ReferenceRow[]> {
  const result = (await source.execute(sql`
    SELECT field, value, sum(n)::int AS count FROM (
      SELECT 'size' AS field, size AS value, count(*) AS n FROM clients WHERE size IS NOT NULL GROUP BY size
      UNION ALL
      SELECT 'size', size_label, count(*) FROM product_variants GROUP BY size_label
      UNION ALL
      SELECT 'city', city, count(*) FROM clients WHERE city IS NOT NULL GROUP BY city
      UNION ALL
      SELECT 'hospital', hospital, count(*) FROM clients WHERE hospital IS NOT NULL GROUP BY hospital
      UNION ALL
      SELECT 'clinic', clinic, count(*) FROM clients WHERE clinic IS NOT NULL GROUP BY clinic
      UNION ALL
      SELECT 'specialty', specialty, count(*) FROM clients WHERE specialty IS NOT NULL GROUP BY specialty
      UNION ALL
      SELECT 'specialty', specialty, count(*) FROM congresses WHERE specialty IS NOT NULL GROUP BY specialty
    ) AS source
    GROUP BY field, value
  `)) as unknown as Array<{ field: ReferenceField; value: string; count: number }>;
  return result.map((row) => ({ field: row.field, value: row.value, count: Number(row.count) }));
}

export async function loadReferenceValues(source: DbOrTransaction): Promise<ReferenceIndex> {
  return buildReferenceIndex(await loadReferenceRows(source));
}
