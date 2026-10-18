import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { congresses, type Congress } from "../../db/schema";
import type { DbOrTransaction } from "../db";

export type CongressValues = Omit<typeof congresses.$inferInsert, "id" | "ref" | "createdAt" | "updatedAt">;

/** Congresos que se superponen con el rango: `start_date <= to AND end_date >= from`. */
export async function listCongressesInRange(source: DbOrTransaction, from: string, to: string): Promise<Congress[]> {
  return source
    .select()
    .from(congresses)
    .where(and(lte(congresses.startDate, to), gte(congresses.endDate, from)))
    .orderBy(asc(congresses.startDate), asc(congresses.name), asc(congresses.ref));
}

export async function listUpcoming(source: DbOrTransaction, today: string): Promise<Congress[]> {
  return source
    .select()
    .from(congresses)
    .where(gte(congresses.endDate, today))
    .orderBy(asc(congresses.startDate), asc(congresses.name), asc(congresses.ref));
}

export async function listPast(source: DbOrTransaction, today: string): Promise<Congress[]> {
  return source
    .select()
    .from(congresses)
    .where(sql`${congresses.endDate} < ${today}`)
    .orderBy(desc(congresses.startDate), asc(congresses.name), asc(congresses.ref));
}

/** El primer congreso que empieza después de `date`. */
export async function findNextCongressAfter(source: DbOrTransaction, date: string): Promise<Congress | undefined> {
  const [row] = await source
    .select()
    .from(congresses)
    .where(sql`${congresses.startDate} > ${date}`)
    .orderBy(asc(congresses.startDate), asc(congresses.name), asc(congresses.ref))
    .limit(1);
  return row;
}

export async function getCongressByRef(source: DbOrTransaction, ref: number): Promise<Congress | undefined> {
  const [row] = await source.select().from(congresses).where(eq(congresses.ref, ref)).limit(1);
  return row;
}

export async function insertCongress(source: DbOrTransaction, values: CongressValues): Promise<Congress> {
  const [row] = await source.insert(congresses).values(values).returning();
  return row;
}

const sameVersion = (ref: number, expectedUpdatedAt: string) =>
  sql`${congresses.ref} = ${ref} AND date_trunc('milliseconds', ${congresses.updatedAt}) = ${new Date(expectedUpdatedAt).toISOString()}::timestamptz`;

export async function updateCongressIfUnchanged(
  source: DbOrTransaction,
  ref: number,
  values: CongressValues,
  expectedUpdatedAt: string,
): Promise<Congress | undefined> {
  const [row] = await source
    .update(congresses)
    .set({ ...values, updatedAt: sql`now()` })
    .where(sameVersion(ref, expectedUpdatedAt))
    .returning();
  return row;
}

export async function deleteCongressIfUnchanged(
  source: DbOrTransaction,
  ref: number,
  expectedUpdatedAt: string,
): Promise<boolean> {
  const rows = await source.delete(congresses).where(sameVersion(ref, expectedUpdatedAt)).returning({ id: congresses.id });
  return rows.length > 0;
}
