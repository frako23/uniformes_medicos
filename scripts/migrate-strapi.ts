import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createStrapiClient } from "../src/server/migration/strapi-client";
import { executeImport } from "../src/server/migration/run";
import { writeMigrationReport } from "../src/server/migration/report";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sourceConfig() {
  const url = process.env.STRAPI_URL?.trim();
  const token = process.env.STRAPI_TOKEN?.trim();
  if (!url || !token) throw new Error("STRAPI_URL y STRAPI_TOKEN son obligatorios para la migración.");
  return { url, token };
}

function safeSourceUrl(value: string) {
  const parsed = new URL(value);
  return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
}

const { url, token } = sourceConfig();
const client = createStrapiClient({ baseUrl: url, token });
const sourceProducts = await client.products();
const sourceImages = sourceProducts.reduce((total, product) => total + product.images.length, 0);
const sourceVariants = sourceProducts.reduce((total, product) => total + product.variants.length, 0);

if (process.argv.includes("--dry-run")) {
  const runId = randomUUID();
  const paths = await writeMigrationReport({
    runId,
    status: "validated",
    source: { products: sourceProducts.length, variants: sourceVariants, images: sourceImages },
    target: { products: 0, variants: 0, images: 0 },
    missing: [],
    mismatches: [],
    errors: [],
    legacyUrls: { checked: 0, requiresCompatibilityDecision: 0 },
    readyForCutover: false,
  });
  console.log(`Dry run completado. Reporte: ${paths.jsonPath}`);
} else {
  const result = await executeImport({
    client,
    sourceProducts,
    sourceUrl: safeSourceUrl(url),
    runId: argument("--run-id"),
  });
  console.log(`Importación ${result.runId} finalizada con ${result.errors.length} error(es).`);
  if (result.errors.length) process.exitCode = 1;
}
