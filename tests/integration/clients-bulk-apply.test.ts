import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../../src/db/client";
import { clients } from "../../src/db/schema";
import { CLIENTS_LOCK_KEY } from "../../src/server/clients/bulk/format";
import * as bulkRepository from "../../src/server/clients/bulk/repository";
import { applyClientsFile, buildClientsExport, buildClientsTemplate, previewClientsFile } from "../../src/server/clients/bulk/service";
import { updateClient } from "../../src/server/clients/service";
import { HttpError } from "../../src/server/http/errors";
import { buildWorkbookBuffer, type RawCell } from "../fixtures/bulk/workbook-builder";
import { hasTestDatabase, resetSections, seedClient, setupTestDatabase, teardownTestDatabase } from "./helpers/test-database";

const SESSION = "token-de-sesion-de-prueba";
const HEADER = ["Nombre", "Celular", "Sexo", "Talla", "Ciudad", "Hospital", "Clínica", "Especialidad", "Notas", "Identificador"];

const workbook = (rows: RawCell[][], header: string[] = HEADER) =>
  buildWorkbookBuffer([{ name: "Clientes", rows: [header, ...rows] }]);

async function previewAndApply(bytes: Uint8Array, fileName = "clientes.xlsx") {
  const preview = await previewClientsFile({ fileName, bytes, sessionToken: SESSION });
  expect(preview.status).toBe("ready");
  return applyClientsFile({ fileName, bytes, previewToken: preview.preview!.token, sessionToken: SESSION });
}

async function expectConflict(promise: Promise<unknown>, message?: string) {
  const error = await promise.then(() => null, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(HttpError);
  expect((error as HttpError).status).toBe(409);
  if (message) expect((error as HttpError).message).toContain(message);
}

const snapshotDb = async () =>
  (await getDb().select().from(clients)).map((row) => ({ ...row })).sort((left, right) => left.ref - right.ref);

describe.skipIf(!hasTestDatabase())("carga masiva de clientes con PostgreSQL", () => {
  beforeAll(setupTestDatabase);
  beforeEach(resetSections);
  afterAll(teardownTestDatabase);

  it("registra altas y ediciones por identificador y por celular, sin eliminar clientes", async () => {
    const ana = await seedClient({ name: "Ana", phone: "0414-111-1111", city: "Caracas", specialty: "Pediatría" });
    const luis = await seedClient({ name: "Luis", phone: "0424-222-2222", city: "Valencia" });
    const bystander = await seedClient({ name: "Ajena", phone: "0412-999-9999" });

    const bytes = await workbook([
      ["Ana María", "04141111111", null, "M", "", null, null, null, null, ana.ref],
      ["Luis Gómez", "0424-222-2222", "hombre", null, "", null, null, null, null, null],
      ["Nueva Cliente", "4143333333", "Mujer", "S", "Maracay", "Los Magallanes", null, "Cirugía", "nota", null],
    ]);
    const result = await previewAndApply(bytes);
    expect(result.summary).toEqual({ created: 1, updated: 2 });
    expect(result.created[0].url).toMatch(/^\/admin\/clientes\/\d+$/);

    const rows = await snapshotDb();
    expect(rows).toHaveLength(4);
    const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
    // Por identificador: las celdas vacías de columnas presentes borran el dato.
    expect(byName["Ana María"]).toMatchObject({ ref: ana.ref, city: null, size: "M", specialty: null, searchText: "ana maria" });
    expect(byName["Ana María"].updatedAt.getTime()).toBeGreaterThan(ana.updatedAt.getTime());
    // Por celular: la celda vacía conserva la ciudad.
    expect(byName["Luis Gómez"]).toMatchObject({ ref: luis.ref, city: "Valencia", sex: "Hombre", searchText: "luis gomez" });
    expect(byName["Nueva Cliente"]).toMatchObject({ phoneE164: "+584143333333", hospital: "Los Magallanes" });
    expect(byName["Ajena"].updatedAt.getTime()).toBe(bystander.updatedAt.getTime());
  });

  it("es atómica: un fallo a mitad de la aplicación deja los clientes como estaban", async () => {
    const ana = await seedClient({ name: "Ana", phone: "0414-111-1111" });
    const bytes = await workbook([
      ["Ana Cambiada", "04141111111", null, null, null, null, null, null, null, ana.ref],
      ["Otra", "4143333333", null, null, null, null, null, null, null, null],
    ]);
    const preview = await previewClientsFile({ fileName: "a.xlsx", bytes, sessionToken: SESSION });
    const before = await snapshotDb();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(bulkRepository, "insertClients").mockRejectedValue(new Error("fallo provocado"));
    const error = await applyClientsFile({ fileName: "a.xlsx", bytes, previewToken: preview.preview!.token, sessionToken: SESSION }).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect((error as HttpError).status).toBe(500);
    expect(await snapshotDb()).toEqual(before);
  });

  it("dos confirmaciones simultáneas con el mismo token: una se aplica y la otra recibe 409", async () => {
    const bytes = await workbook([["Nueva", "4143333333", null, null, null, null, null, null, null, null]]);
    const preview = await previewClientsFile({ fileName: "a.xlsx", bytes, sessionToken: SESSION });
    const input = { fileName: "a.xlsx", bytes, previewToken: preview.preview!.token, sessionToken: SESSION };
    const results = await Promise.allSettled([applyClientsFile(input), applyClientsFile(input)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as HttpError).status).toBe(409);
    expect(await snapshotDb()).toHaveLength(1);
  });

  it("una edición individual entre la vista previa y la confirmación da 409 sin cambios", async () => {
    const ana = await seedClient({ name: "Ana", phone: "0414-111-1111" });
    const bytes = await workbook([["Ana Cambiada", "04141111111", null, null, null, null, null, null, null, ana.ref]]);
    const preview = await previewClientsFile({ fileName: "a.xlsx", bytes, sessionToken: SESSION });
    await updateClient(ana.ref, { name: "Ana editada a mano", phone: "0414-111-1111", expectedUpdatedAt: ana.updatedAt.toISOString() });
    await expectConflict(
      applyClientsFile({ fileName: "a.xlsx", bytes, previewToken: preview.preview!.token, sessionToken: SESSION }),
      "Los clientes cambiaron desde la vista previa",
    );
    expect((await snapshotDb())[0].name).toBe("Ana editada a mano");
  });

  it("dos clientes intercambian su celular con un archivo descargado", async () => {
    await seedClient({ name: "Ana", phone: "0414-111-1111" });
    await seedClient({ name: "Luis", phone: "0424-222-2222" });
    const exported = await buildClientsExport(new Date("2026-10-18T12:00:00Z"));
    const { default: readExcelFile } = await import("read-excel-file/node");
    const sheets = (await readExcelFile(exported.bytes as never)) as unknown as Array<{ sheet: string; data: RawCell[][] }>;
    const [header, ...rows] = sheets[1].data;
    const phones = rows.map((row) => row[1]);
    rows[0][1] = phones[1];
    rows[1][1] = phones[0];
    const result = await previewAndApply(await workbook(rows, header as string[]));
    expect(result.summary.updated).toBe(2);
    const after = Object.fromEntries((await snapshotDb()).map((row) => [row.name, row.phoneE164]));
    expect(after).toEqual({ Ana: "+584242222222", Luis: "+584141111111" });
  });

  it("si otra conexión retiene el bloqueo se responde 409 tras el tiempo de espera", async () => {
    const bytes = await workbook([["Nueva", "4143333333", null, null, null, null, null, null, null, null]]);
    const preview = await previewClientsFile({ fileName: "a.xlsx", bytes, sessionToken: SESSION });
    const holder = postgres(process.env.TEST_DATABASE_URL!, { max: 1, prepare: false });
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await holder.begin(async (transaction) => {
        await transaction`SELECT pg_advisory_xact_lock(${CLIENTS_LOCK_KEY})`;
        await expectConflict(
          applyClientsFile({ fileName: "a.xlsx", bytes, previewToken: preview.preview!.token, sessionToken: SESSION, lockTimeoutMs: 300 }),
          "Otra carga se está aplicando",
        );
      });
    } finally {
      await holder.end({ timeout: 5 });
    }
  });

  it("una nueva vista previa del mismo archivo no encuentra cambios", async () => {
    await seedClient({ name: "Ana", phone: "0414-111-1111" });
    const bytes = await workbook([
      ["Ana", "04141111111", null, null, "", null, null, null, null, null],
      ["Nueva", "4143333333", "Mujer", null, "Maracay", null, null, null, null, null],
    ]);
    await previewAndApply(bytes);
    const again = await previewClientsFile({ fileName: "clientes.xlsx", bytes, sessionToken: SESSION });
    expect(again.status).toBe("no_changes");
    expect(again.summary).toMatchObject({ created: 0, updated: 0, unchanged: 2 });
  });

  it("la plantilla vacía se puede generar", async () => {
    const template = await buildClientsTemplate();
    expect(template.fileName).toBe("plantilla-clientes.xlsx");
  });

  it("rechaza confirmar con un token de otra sección o de otra sesión", async () => {
    const bytes = await workbook([["Nueva", "4143333333", null, null, null, null, null, null, null, null]]);
    const preview = await previewClientsFile({ fileName: "a.xlsx", bytes, sessionToken: SESSION });
    await expectConflict(
      applyClientsFile({ fileName: "a.xlsx", bytes, previewToken: preview.preview!.token, sessionToken: "otra-sesion" }),
      "La vista previa no es válida",
    );
  });
});
