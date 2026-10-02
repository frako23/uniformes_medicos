import { db } from "../db";
import type { SourceProduct } from "./normalize-strapi";
import type { createStrapiClient } from "./strapi-client";
import { getMigrationRun, updateMigrationRun } from "./repository";
import { writeMigrationReport, type MigrationReport } from "./report";

async function reachable(url: string) {
  try {
    const head = await fetch(url, { method: "HEAD" });
    if (head.ok) return true;
    const response = await fetch(url, { headers: { Range: "bytes=0-0" } });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

export async function verifyMigration(input: {
  client: ReturnType<typeof createStrapiClient>;
  sourceProducts: SourceProduct[];
  runId: string;
}) {
  const run = await getMigrationRun(input.runId);
  if (!run) throw new Error(`No existe la ejecución de migración ${input.runId}.`);
  const targetProducts = await db().query.products.findMany({ with: { variants: true, images: true } });
  const sourceVariants = input.sourceProducts.reduce((count, product) => count + product.variants.length, 0);
  const sourceImages = input.sourceProducts.reduce((count, product) => count + product.images.length, 0);
  const targetVariants = targetProducts.reduce((count, product) => count + product.variants.length, 0);
  const targetImages = targetProducts.reduce((count, product) => count + product.images.filter((image) => !image.deletedAt).length, 0);
  const missing: string[] = [];
  const mismatches: string[] = [];
  const errors: string[] = [];
  let checkedUrls = 0;

  for (const source of input.sourceProducts) {
    const target = targetProducts.find((candidate) => candidate.legacyId === source.legacyId);
    if (!target) {
      missing.push(`product:${source.legacyDocumentId}`);
      continue;
    }
    if (target.legacyDocumentId !== source.legacyDocumentId) {
      mismatches.push(`product:${source.legacyDocumentId}:legacy_document_id`);
    }
    if (Number(target.price) !== source.price || target.brand !== source.brand || target.manufacturer !== source.manufacturer || target.isPublished !== source.isPublished) {
      mismatches.push(`product:${source.legacyDocumentId}:fields`);
    }
    for (const variant of source.variants) {
      const targetVariant = target.variants.find((candidate) => candidate.sizeLabel === variant.sizeLabel);
      if (!targetVariant) missing.push(`variant:${source.legacyDocumentId}:${variant.sizeLabel}`);
      else if (targetVariant.quantity !== variant.quantity) mismatches.push(`variant:${source.legacyDocumentId}:${variant.sizeLabel}:quantity`);
    }
    if (target.variants.length !== source.variants.length) {
      mismatches.push(`variants:${source.legacyDocumentId}:count`);
    }
    const activeImages = target.images.filter((image) => !image.deletedAt);
    if (activeImages.length !== source.images.length) {
      mismatches.push(`images:${source.legacyDocumentId}:count`);
    }
    for (const image of activeImages) {
      checkedUrls += 1;
      if (!(await reachable(image.storageUrl))) errors.push(`image:${image.storageUrl}:unreachable`);
    }
    for (const sourceImage of source.images) {
      const legacyUrl = input.client.absoluteUrl(sourceImage.url);
      const targetImage = activeImages.find((image) =>
        image.legacyUrl === legacyUrl || (sourceImage.id !== undefined && image.legacyId === sourceImage.id),
      );
      if (!targetImage) missing.push(`image:${source.legacyDocumentId}:${legacyUrl}`);
    }
  }

  if (targetProducts.length !== input.sourceProducts.length) {
    mismatches.push("products:count");
  }
  const report: MigrationReport = {
    runId: input.runId,
    status: missing.length || mismatches.length || errors.length ? "failed" : "validated",
    source: { products: input.sourceProducts.length, variants: sourceVariants, images: sourceImages },
    target: { products: targetProducts.length, variants: targetVariants, images: targetImages },
    missing,
    mismatches,
    errors,
    legacyUrls: { checked: checkedUrls, requiresCompatibilityDecision: 0 },
    readyForCutover: missing.length === 0 && mismatches.length === 0 && errors.length === 0,
  };
  const paths = await writeMigrationReport(report);
  await updateMigrationRun(input.runId, {
    status: report.status,
    finishedAt: new Date(),
    reportPath: paths.jsonPath,
    errorCount: errors.length + missing.length + mismatches.length,
  });
  return report;
}
