import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../../src/db/client";
import { congresses } from "../../src/db/schema";
import * as bulkRepository from "../../src/server/congresses/bulk/repository";
import { applyCongressesFile, buildCongressesExport, previewCongressesFile } from "../../src/server/congresses/bulk/service";
import { updateCongress } from "../../src/server/congresses/service";
import { HttpError } from "../../src/server/http/errors";
import { buildWorkbookBuffer, type RawCell } from "../fixtures/bulk/workbook-builder";
import { hasTestDatabase, resetSections, seedCongress, setupTestDatabase, teardownTestDatabase } from "./helpers/test-database";

const SESSION = "sesion-de-prueba";
const NOW = new Date("2026-10-18T16:00:00Z");
const HEADER = ["Desde", "Hasta", "Especialidad", "Lugar", "Nombre", "Notas", "Identificador"];
const workbook = (rows: RawCell[][]) => buildWorkbookBuffer([{ name: "Congresos", rows: [HEADER, ...rows] }]);
const preview = (bytes: Uint8Array) => previewCongressesFile({ fileName: "c.xlsx", bytes, sessionToken: SESSION, now: NOW });
async function previewAndApply(bytes: Uint8Array) {
  const result = await preview(bytes);
  expect(result.status).toBe("ready");
  return applyCongressesFile({ fileName: "c.xlsx", bytes, previewToken: result.preview!.token, sessionToken: SESSION, now: NOW });
}
const all = async () => (await getDb().select().from(congresses)).sort((a, b) => a.ref - b.ref);

describe.skipIf(!hasTestDatabase())("carga masiva de congresos con PostgreSQL", () => {
  beforeAll(setupTestDatabase);
  beforeEach(async () => {
    await resetSections();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterAll(teardownTestDatabase);

  it("aplica altas y ediciones, borra con celdas vacías y no elimina congresos", async () => {
    const first = await seedCongress({ name: "Uno", startDate: "2026-11-10", endDate: "2026-11-12", venue: "Hotel", notes: "n" });
    const untouched = await seedCongress({ name: "Ajeno", startDate: "2026-12-01", endDate: "2026-12-02" });
    const result = await previewAndApply(
      await workbook([
        ["10/11/2026", "13/11/2026", "Mastología", "", "Uno editado", "", first.ref],
        ["30/10/2026", "01/11/2026", "Cirugía", "Hotel Eurobuilding", "Nuevo", null, null],
      ]),
    );
    expect(result.summary).toEqual({ created: 1, updated: 1 });
    expect(result.created[0].url).toMatch(/^\/admin\/congresos\/\d+$/);
    const rows = await all();
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.ref === first.ref)).toMatchObject({ name: "Uno editado", endDate: "2026-11-13", venue: null, notes: null, specialty: "Mastología" });
    expect(rows.find((row) => row.name === "Nuevo")).toMatchObject({ startDate: "2026-10-30", venue: "Hotel Eurobuilding" });
    expect(rows.find((row) => row.ref === untouched.ref)!.updatedAt.getTime()).toBe(untouched.updatedAt.getTime());
  });

  it("es atómica: un fallo a mitad de la aplicación deja todo como estaba", async () => {
    const first = await seedCongress({ name: "Uno" });
    const bytes = await workbook([
      ["10/11/2026", "13/11/2026", null, null, "Uno editado", null, first.ref],
      ["30/10/2026", "01/11/2026", null, null, "Nuevo", null, null],
    ]);
    const result = await preview(bytes);
    const before = await all();
    vi.spyOn(bulkRepository, "insertCongresses").mockRejectedValue(new Error("fallo provocado"));
    const error = await applyCongressesFile({ fileName: "c.xlsx", bytes, previewToken: result.preview!.token, sessionToken: SESSION, now: NOW }).then(() => null, (reason: unknown) => reason);
    expect((error as HttpError).status).toBe(500);
    expect(await all()).toEqual(before);
  });

  it("una edición individual entre la vista previa y la confirmación da 409", async () => {
    const first = await seedCongress({ name: "Uno" });
    const bytes = await workbook([["10/11/2026", "13/11/2026", null, null, "Uno editado", null, first.ref]]);
    const result = await preview(bytes);
    await updateCongress(first.ref, { name: "Editado a mano", startDate: "2026-10-30", endDate: "2026-11-01", expectedUpdatedAt: first.updatedAt.toISOString() });
    const error = await applyCongressesFile({ fileName: "c.xlsx", bytes, previewToken: result.preview!.token, sessionToken: SESSION, now: NOW }).then(() => null, (reason: unknown) => reason);
    expect((error as HttpError).status).toBe(409);
    expect((error as HttpError).message).toContain("Los congresos cambiaron desde la vista previa");
    expect((await all())[0].name).toBe("Editado a mano");
  });

  it("dos confirmaciones simultáneas: una se aplica y la otra recibe 409", async () => {
    const bytes = await workbook([["30/10/2026", "01/11/2026", null, null, "Nuevo", null, null]]);
    const result = await preview(bytes);
    const input = { fileName: "c.xlsx", bytes, previewToken: result.preview!.token, sessionToken: SESSION, now: NOW };
    const results = await Promise.allSettled([applyCongressesFile(input), applyCongressesFile(input)]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(((results.find((item) => item.status === "rejected") as PromiseRejectedResult).reason as HttpError).status).toBe(409);
    expect(await all()).toHaveLength(1);
  });

  it("volver a subir el archivo descargado ya aplicado da no_changes", async () => {
    await seedCongress({ name: "Uno", venue: "Hotel", specialty: "Mastología" });
    await seedCongress({ name: "Dos" });
    const exported = await buildCongressesExport(NOW);
    const { default: readExcelFile } = await import("read-excel-file/node");
    const book = (await readExcelFile(exported.bytes as never)) as unknown as Array<{ sheet: string; data: RawCell[][] }>;
    const [header, ...rows] = book[1].data;
    rows[0][4] = "Uno cambiado";
    const bytes = await buildWorkbookBuffer([{ name: "Congresos", rows: [header, ...rows] }]);
    await previewAndApply(bytes);
    const again = await preview(bytes);
    expect(again.status).toBe("no_changes");
    expect(again.summary).toMatchObject({ created: 0, updated: 0, unchanged: 2 });
  });
});
