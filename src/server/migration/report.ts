import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface MigrationReport {
  runId: string;
  status: "validated" | "failed";
  source: { products: number; variants: number; images: number };
  target: { products: number; variants: number; images: number };
  missing: string[];
  mismatches: string[];
  errors: string[];
  legacyUrls: { checked: number; requiresCompatibilityDecision: number };
  readyForCutover: boolean;
}

function reportDirectory() {
  return process.env.MIGRATION_REPORT_DIR || ".local/migration-reports";
}

export async function writeMigrationReport(report: MigrationReport) {
  const directory = path.resolve(reportDirectory());
  await mkdir(directory, { recursive: true });
  const jsonPath = path.join(directory, `migration-${report.runId}.json`);
  const summaryPath = path.join(directory, `migration-${report.runId}.summary.txt`);
  const summary = [
    `Migración ${report.runId}`,
    `Estado: ${report.status}`,
    `Productos: ${report.target.products}/${report.source.products}`,
    `Variantes: ${report.target.variants}/${report.source.variants}`,
    `Imágenes: ${report.target.images}/${report.source.images}`,
    `URLs comprobadas: ${report.legacyUrls.checked}`,
    `Errores: ${report.errors.length}`,
    `Lista para corte: ${report.readyForCutover ? "sí" : "no"}`,
  ].join("\n");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(summaryPath, `${summary}\n`, "utf8");
  return { jsonPath, summaryPath };
}
