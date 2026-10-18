import { strFromU8, unzipSync } from "fflate";
import readExcelFile from "read-excel-file/node";
import { describe, expect, it } from "vitest";
import { readSectionSheet } from "../../src/server/bulk/sheet";
import {
  FINANCING_COLUMNS,
  FINANCINGS_MAX_ROWS,
  type FinancingColumnKey,
} from "../../src/server/financing/bulk/format";
import { buildFinancingsTemplate } from "../../src/server/financing/bulk/workbook";
import { buildWorkbookBuffer, sectionMetadataRows, type RawCell } from "../fixtures/bulk/workbook-builder";

const generatedAt = new Date("2026-10-18T14:05:00.000Z");
const sheets = async (buffer: Buffer) => (await readExcelFile(buffer as never)) as unknown as Array<{ sheet: string; data: unknown[][] }>;
const xml = (buffer: Buffer) => strFromU8(unzipSync(new Uint8Array(buffer))["xl/worksheets/sheet2.xml"]);

const read = (bytes: Uint8Array) =>
  readSectionSheet<FinancingColumnKey>({
    fileName: "financiamientos.xlsx",
    bytes,
    sectionLabel: "Financiamientos",
    columns: FINANCING_COLUMNS,
    maxRows: FINANCINGS_MAX_ROWS,
  });

describe("plantilla de financiamientos", () => {
  const build = () =>
    buildFinancingsTemplate({
      clients: [
        { name: "Luis Gómez", phoneE164: "+584247654321" },
        { name: "Ana Pérez", phoneE164: "+584141234567" },
      ],
      generatedAt,
    });

  it("trae las hojas, la sección, el encabezado y los clientes en Listas", async () => {
    const book = await sheets(await build());
    expect(book.map((sheet) => sheet.sheet)).toEqual(["Instrucciones", "Financiamientos", "Listas"]);
    expect(book[0].data.find((row) => row[0] === "Sección")?.[1]).toBe("Financiamientos");
    expect(book[1].data).toEqual([
      ["Celular del cliente", "Cliente", "Descripción", "Fecha de compra", "Monto total", "Inicial", "Número de cuotas", "Frecuencia", "Fecha de la primera cuota", "Cuotas pagadas"],
    ]);
    expect(book[2].data).toEqual([["Cliente", "Celular"], ["Ana Pérez", "0414-123-4567"], ["Luis Gómez", "0424-765-4321"]]);
  });

  it("incluye las ayudas de Excel en las filas 2 a 2.001", async () => {
    const sheet = xml(await build());
    const last = FINANCINGS_MAX_ROWS + 1;
    expect(sheet).toMatch(new RegExp(`type="list"[^>]*sqref="H2:H${last}"[^>]*><formula1>"?Semanal,Quincenal,Mensual"?</formula1>`));
    for (const column of ["E", "F"]) expect(sheet).toMatch(new RegExp(`type="decimal"[^>]*sqref="${column}2:${column}${last}"`));
    expect(sheet).toMatch(new RegExp(`type="whole"[^>]*sqref="G2:G${last}"`));
    expect(sheet).toMatch(new RegExp(`type="whole"[^>]*sqref="J2:J${last}"`));
    for (const column of ["D", "I"]) expect(sheet).toMatch(new RegExp(`type="date"[^>]*sqref="${column}2:${column}${last}"`));
    expect(sheet).toContain('errorStyle="warning"');
    expect(sheet).toMatch(new RegExp(`type="textLength"[^>]*sqref="C2:C${last}"`));
    expect(sheet).toMatch(new RegExp(`promptTitle="Celular del cliente"[^>]*sqref="A2:A${last}"`));
  });
});

describe("lectura", () => {
  it("rechaza 2.001 filas", async () => {
    const rows: RawCell[][] = [["Celular del cliente", "Descripción", "Fecha de compra", "Monto total", "Número de cuotas"]];
    for (let index = 0; index <= FINANCINGS_MAX_ROWS; index += 1) rows.push(["4141234567", "x", "18/10/2026", 10, 1]);
    const result = await read(await buildWorkbookBuffer([{ name: "Financiamientos", rows }]));
    expect(result.issues.map((issue) => issue.code)).toContain("TOO_MANY_ROWS");
  }, 30_000);

  it("Sección: Clientes da WRONG_SECTION", async () => {
    const book = await buildWorkbookBuffer([
      { name: "Instrucciones", rows: sectionMetadataRows({ section: "Clientes", kind: "Datos actuales", generatedAt: generatedAt.toISOString(), version: 1 }) },
      { name: "Financiamientos", rows: [["Celular", "Descripción", "Fecha de compra", "Monto total", "Número de cuotas"]] },
    ]);
    expect((await read(book)).issues.map((issue) => issue.code)).toEqual(["WRONG_SECTION"]);
  });

  it("acepta el alias Celular", async () => {
    const book = await buildWorkbookBuffer([
      { name: "Financiamientos", rows: [["Celular", "Descripción", "Fecha de compra", "Monto total", "Número de cuotas"], ["4141234567", "x", "18/10/2026", 10, 1]] },
    ]);
    const result = await read(book);
    expect(result.issues).toEqual([]);
    expect(result.columns[0]).toMatchObject({ key: "phone", header: "Celular" });
  });
});
