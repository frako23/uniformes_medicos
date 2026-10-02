import "dotenv/config";
import { createStrapiClient } from "../src/server/migration/strapi-client";
import { verifyMigration } from "../src/server/migration/verify";

const runIdIndex = process.argv.indexOf("--run-id");
const repeatIndex = process.argv.indexOf("--repeat");
const runId = runIdIndex >= 0 ? process.argv[runIdIndex + 1] : repeatIndex >= 0 ? process.argv[repeatIndex + 1] : undefined;
const url = process.env.STRAPI_URL?.trim();
const token = process.env.STRAPI_TOKEN?.trim();
if (!runId || !url || !token) {
  throw new Error("--run-id (o --repeat), STRAPI_URL y STRAPI_TOKEN son obligatorios para verificar.");
}

const client = createStrapiClient({ baseUrl: url, token });
const sourceProducts = await client.products();
const report = await verifyMigration({ client, sourceProducts, runId });
console.log(`Verificación ${runId}: ${report.readyForCutover ? "lista para corte" : "requiere correcciones"}.`);
if (!report.readyForCutover) process.exitCode = 1;
