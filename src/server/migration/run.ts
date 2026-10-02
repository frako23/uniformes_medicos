import { clearRunItems, createMigrationRun, getMigrationRun, incrementMigrationRun, recordMigrationItem, updateMigrationRun } from "./repository";
import { importProduct } from "./import-products";
import type { SourceProduct } from "./normalize-strapi";
import type { createStrapiClient } from "./strapi-client";

export async function executeImport(input: {
  client: ReturnType<typeof createStrapiClient>;
  sourceProducts: SourceProduct[];
  sourceUrl: string;
  runId?: string;
}) {
  const expectedImages = input.sourceProducts.reduce((count, product) => count + product.images.length, 0);
  const run = input.runId
    ? await getMigrationRun(input.runId)
    : await createMigrationRun({
      mode: "import",
      sourceUrl: input.sourceUrl,
      expectedProducts: input.sourceProducts.length,
      expectedImages,
    });
  if (!run) throw new Error(`No existe la ejecución de migración ${input.runId}.`);
  await clearRunItems(run.id);
  await updateMigrationRun(run.id, {
    status: "running",
    expectedProducts: input.sourceProducts.length,
    expectedImages,
    importedProducts: 0,
    importedImages: 0,
    errorCount: 0,
    finishedAt: null,
  });

  const errors: string[] = [];
  const seenLegacyIds = new Set<number>();
  const seenDocumentIds = new Set<string>();
  for (const source of input.sourceProducts) {
    if (seenLegacyIds.has(source.legacyId) || seenDocumentIds.has(source.legacyDocumentId)) {
      const message = `Identificador de producto duplicado en la fuente: ${source.legacyDocumentId}.`;
      errors.push(`${source.legacyDocumentId}: ${message}`);
      await recordMigrationItem({
        runId: run.id,
        entityType: "product",
        sourceId: source.legacyDocumentId,
        status: "error",
        message,
      });
      await incrementMigrationRun(run.id, { errorCount: 1 });
      continue;
    }
    seenLegacyIds.add(source.legacyId);
    seenDocumentIds.add(source.legacyDocumentId);
    try {
      const result = await importProduct(input.client, source);
      await recordMigrationItem({
        runId: run.id,
        entityType: "product",
        sourceId: source.legacyDocumentId,
        targetId: result.product.id,
        status: "imported",
      });
      await incrementMigrationRun(run.id, {
        importedProducts: 1,
        importedImages: result.importedImages,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error de importación desconocido.";
      errors.push(`${source.legacyDocumentId}: ${message}`);
      await recordMigrationItem({
        runId: run.id,
        entityType: "product",
        sourceId: source.legacyDocumentId,
        status: "error",
        message,
      });
      await incrementMigrationRun(run.id, { errorCount: 1 });
    }
  }

  await updateMigrationRun(run.id, {
    status: errors.length ? "failed" : "validated",
    finishedAt: new Date(),
  });
  return { runId: run.id, errors };
}
