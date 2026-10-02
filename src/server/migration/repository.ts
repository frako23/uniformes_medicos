import { and, eq, sql } from "drizzle-orm";
import { migrationItems, migrationRuns } from "../../db/schema";
import { db } from "../db";

export async function createMigrationRun(input: {
  mode: "dry_run" | "import" | "verify";
  sourceUrl: string;
  expectedProducts?: number;
  expectedImages?: number;
}) {
  const [run] = await db().insert(migrationRuns).values({
    mode: input.mode,
    sourceUrl: input.sourceUrl,
    expectedProducts: input.expectedProducts,
    expectedImages: input.expectedImages,
    status: "pending",
  }).returning();
  return run;
}

export async function getMigrationRun(id: string) {
  return db().query.migrationRuns.findFirst({ where: eq(migrationRuns.id, id) });
}

export async function updateMigrationRun(
  id: string,
  values: Partial<typeof migrationRuns.$inferInsert>,
) {
  const [run] = await db().update(migrationRuns)
    .set(values)
    .where(eq(migrationRuns.id, id))
    .returning();
  return run;
}

export async function incrementMigrationRun(
  id: string,
  values: { importedProducts?: number; importedImages?: number; errorCount?: number },
) {
  const [run] = await db().update(migrationRuns)
    .set({
      importedProducts: values.importedProducts === undefined
        ? undefined
        : sql`${migrationRuns.importedProducts} + ${values.importedProducts}`,
      importedImages: values.importedImages === undefined
        ? undefined
        : sql`${migrationRuns.importedImages} + ${values.importedImages}`,
      errorCount: values.errorCount === undefined
        ? undefined
        : sql`${migrationRuns.errorCount} + ${values.errorCount}`,
    })
    .where(eq(migrationRuns.id, id))
    .returning();
  return run;
}

export async function recordMigrationItem(input: {
  runId: string;
  entityType: string;
  sourceId: string;
  targetId?: string | null;
  status: "imported" | "skipped" | "error" | "verified";
  sourceChecksum?: string | null;
  message?: string | null;
}) {
  const [item] = await db().insert(migrationItems).values({
    runId: input.runId,
    entityType: input.entityType,
    sourceId: input.sourceId,
    targetId: input.targetId ?? null,
    status: input.status,
    sourceChecksum: input.sourceChecksum ?? null,
    message: input.message ?? null,
  }).returning();
  return item;
}

export async function clearRunItems(runId: string) {
  await db().delete(migrationItems).where(and(eq(migrationItems.runId, runId)));
}
