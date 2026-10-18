import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../../src/db/client";
import { deleteClient } from "../../src/server/clients/service";
import * as bulkRepository from "../../src/server/financing/bulk/repository";
import { applyFinancingsFile, buildFinancingsTemplate, previewFinancingsFile } from "../../src/server/financing/bulk/service";
import { getFinancingDetail, getInstallmentList } from "../../src/server/financing/service";
import { HttpError } from "../../src/server/http/errors";
import { buildWorkbookBuffer, type RawCell } from "../fixtures/bulk/workbook-builder";
import { hasTestDatabase, resetSections, seedClient, setupTestDatabase, teardownTestDatabase } from "./helpers/test-database";

const SESSION = "sesion-de-prueba";
const NOW = new Date("2026-10-18T16:00:00Z");
const HEADER = ["Celular del cliente", "Cliente", "Descripción", "Fecha de compra", "Monto total", "Inicial", "Número de cuotas", "Frecuencia", "Fecha de la primera cuota", "Cuotas pagadas"];
const workbook = (rows: RawCell[][]) => buildWorkbookBuffer([{ name: "Financiamientos", rows: [HEADER, ...rows] }]);

const preview = (bytes: Uint8Array) => previewFinancingsFile({ fileName: "f.xlsx", bytes, sessionToken: SESSION, now: NOW });
async function previewAndApply(bytes: Uint8Array) {
  const result = await preview(bytes);
  expect(result.status).toBe("ready");
  return applyFinancingsFile({ fileName: "f.xlsx", bytes, previewToken: result.preview!.token, sessionToken: SESSION, now: NOW });
}

describe.skipIf(!hasTestDatabase())("carga masiva de financiamientos con PostgreSQL", () => {
  beforeAll(setupTestDatabase);
  beforeEach(async () => {
    await resetSections();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterAll(teardownTestDatabase);

  const rowFor = (phone: string, extra: Partial<Record<number, RawCell>> = {}): RawCell[] => {
    const row: RawCell[] = [phone, null, "Dos conjuntos", "01/09/2026", 120, 20, 4, "Quincenal", "15/09/2026", 3];
    for (const [index, value] of Object.entries(extra)) row[Number(index)] = value as RawCell;
    return row;
  };

  it("crea los financiamientos con origen carga_masiva y sus cuotas, algunas ya pagadas", async () => {
    const ana = await seedClient({ name: "Ana", phone: "0414-111-1111" });
    const result = await previewAndApply(await workbook([rowFor("04141111111")]));
    expect(result.summary).toEqual({ created: 1, updated: 0, installments: 5 });
    expect(result.created[0].url).toMatch(/^\/admin\/pagos-financiados\/\d+$/);

    const detail = await getFinancingDetail(result.created[0].ref, NOW);
    expect(detail).toMatchObject({ origin: "carga_masiva", totalUsd: "120.00", paidUsd: "70.00", balanceUsd: "50.00", client: { ref: ana.ref } });
    expect(detail.installments.map((item) => [item.label, item.state])).toEqual([
      ["Inicial", "pagada"],
      ["1 de 4", "pagada"],
      ["2 de 4", "pagada"],
      ["3 de 4", "vencida"],
      ["4 de 4", "por_vencer"],
    ]);
    const rows = await getDb().query.installments.findMany();
    for (const row of rows.filter((item) => item.status === "pagada")) {
      expect(row).toMatchObject({ paymentOrigin: "carga_masiva", paidOn: null, paymentCurrency: null, euroRate: null, amountVes: null });
    }
  });

  it("lo cobrado en el mes no cambia con las cuotas pagadas por carga masiva", async () => {
    await seedClient({ name: "Ana", phone: "0414-111-1111" });
    await previewAndApply(await workbook([rowFor("04141111111")]));
    const list = await getInstallmentList({}, { now: NOW, fetchImpl: (async () => new Response("no", { status: 500 })) as never });
    expect(list.summary.collectedThisMonthUsd).toBe("0.00");
  });

  it("una segunda confirmación con el mismo token da 409 y no duplica nada", async () => {
    await seedClient({ name: "Ana", phone: "0414-111-1111" });
    const bytes = await workbook([rowFor("04141111111")]);
    const result = await preview(bytes);
    const input = { fileName: "f.xlsx", bytes, previewToken: result.preview!.token, sessionToken: SESSION, now: NOW };
    await applyFinancingsFile(input);
    const error = await applyFinancingsFile(input).then(() => null, (reason: unknown) => reason);
    expect((error as HttpError).status).toBe(409);
    expect(await getDb().query.financings.findMany()).toHaveLength(1);
  });

  it("un cliente eliminado en paralelo espera por FOR KEY SHARE y luego recibe 409", async () => {
    const ana = await seedClient({ name: "Ana", phone: "0414-111-1111" });
    const bytes = await workbook([rowFor("04141111111")]);
    const result = await preview(bytes);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let entered!: () => void;
    const inside = new Promise<void>((resolve) => (entered = resolve));
    const original = bulkRepository.insertFinancingDrafts;
    vi.spyOn(bulkRepository, "insertFinancingDrafts").mockImplementation(async (...args) => {
      entered();
      await gate;
      return original(...args);
    });

    const applying = applyFinancingsFile({ fileName: "f.xlsx", bytes, previewToken: result.preview!.token, sessionToken: SESSION, now: NOW });
    await inside;
    let deleted = false;
    const deletion = deleteClient(ana.ref).then(
      () => (deleted = true),
      (error: unknown) => error,
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(deleted).toBe(false);
    release();
    const applied = await applying;
    expect(applied.summary.created).toBe(1);
    const outcome = await deletion;
    expect((outcome as HttpError).status).toBe(409);
    expect(await getDb().query.financings.findMany()).toHaveLength(1);
  });

  it("una nueva vista previa del mismo archivo advierte POSSIBLE_DUPLICATE en cada fila", async () => {
    await seedClient({ name: "Ana", phone: "0414-111-1111" });
    await seedClient({ name: "Luis", phone: "0424-222-2222" });
    const bytes = await workbook([rowFor("04141111111"), rowFor("04242222222")]);
    await previewAndApply(bytes);
    const again = await preview(bytes);
    expect(again.status).toBe("ready");
    const duplicates = again.issues.filter((issue) => issue.code === "POSSIBLE_DUPLICATE");
    expect(duplicates.map((issue) => issue.rows)).toEqual([["2"], ["3"]]);
  });

  it("un celular inexistente invalida el archivo y no aplica nada", async () => {
    const result = await preview(await workbook([rowFor("04149999999")]));
    expect(result.status).toBe("invalid");
    expect(result.issues[0].code).toBe("CLIENT_NOT_FOUND");
    expect(result.preview).toBeNull();
  });

  it("la plantilla incluye los clientes registrados", async () => {
    await seedClient({ name: "Ana", phone: "0414-111-1111" });
    const template = await buildFinancingsTemplate(NOW);
    expect(template.fileName).toBe("plantilla-financiamientos.xlsx");
    const { default: readExcelFile } = await import("read-excel-file/node");
    const book = (await readExcelFile(template.bytes as never)) as unknown as Array<{ sheet: string; data: unknown[][] }>;
    expect(book[2].data[1]).toEqual(["Ana", "0414-111-1111"]);
  });
});
