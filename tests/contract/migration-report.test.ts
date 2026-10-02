import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeMigrationReport } from "../../src/server/migration/report";

describe("migration report contract", () => {
  it("writes counts, cutover gating and no credentials", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "uniformes-report-"));
    process.env.MIGRATION_REPORT_DIR = directory;
    const paths = await writeMigrationReport({
      runId: "run-1",
      status: "failed",
      source: { products: 1, variants: 1, images: 1 },
      target: { products: 0, variants: 0, images: 0 },
      missing: ["product:1"],
      mismatches: [],
      errors: ["No se pudo descargar la imagen"],
      legacyUrls: { checked: 0, requiresCompatibilityDecision: 1 },
      readyForCutover: false,
    });
    const content = await readFile(paths.jsonPath, "utf8");
    expect(JSON.parse(content)).toMatchObject({ runId: "run-1", readyForCutover: false });
    expect(content).not.toContain("STRAPI_TOKEN");
  });
});
