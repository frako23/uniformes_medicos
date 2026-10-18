import { strFromU8, unzipSync } from "fflate";
import readExcelFile from "read-excel-file/node";
import { describe, expect, it } from "vitest";
import { readSectionSheet } from "../../src/server/bulk/sheet";
import type { SnapshotClient } from "../../src/server/clients/bulk/changes";
import { CLIENT_COLUMNS, CLIENTS_MAX_ROWS, type ClientColumnKey } from "../../src/server/clients/bulk/format";
import { buildClientsWorkbook } from "../../src/server/clients/bulk/workbook";
import { buildReferenceIndex } from "../../src/server/reference/values";
import { buildWorkbookBuffer, medicosWorkbook, sectionMetadataRows, type RawCell } from "../fixtures/bulk/workbook-builder";

const generatedAt = new Date("2026-10-18T14:05:00.000Z");

function client(ref: number, input: Partial<SnapshotClient> = {}): SnapshotClient {
  return {
    id: `id-${ref}`,
    ref,
    name: `Cliente ${ref}`,
    phoneE164: "+584142467789",
    sex: null,
    size: null,
    city: null,
    hospital: null,
    clinic: null,
    specialty: null,
    notes: null,
    updatedAt: generatedAt,
    ...input,
  };
}

const reference = buildReferenceIndex([
  { field: "size", value: "M", count: 2 },
  { field: "city", value: "Caracas", count: 2 },
  { field: "specialty", value: "Pediatría", count: 1 },
]);

const sheets = async (buffer: Buffer) => (await readExcelFile(buffer as never)) as unknown as Array<{ sheet: string; data: unknown[][] }>;
const sheetXml = (buffer: Buffer, name: string) => strFromU8(unzipSync(new Uint8Array(buffer))[name]);

describe("libro de clientes", () => {
  it("la plantilla trae las tres hojas, los metadatos y el encabezado", async () => {
    const buffer = await buildClientsWorkbook({ kind: "plantilla", clients: [], reference, generatedAt });
    const book = await sheets(buffer);
    expect(book.map((sheet) => sheet.sheet)).toEqual(["Instrucciones", "Clientes", "Listas"]);
    const meta = new Map(book[0].data.filter((row) => row[1] !== null && row[1] !== undefined).map((row) => [row[0], String(row[1])]));
    expect(meta.get("Sección")).toBe("Clientes");
    expect(meta.get("Tipo de archivo")).toBe("Plantilla vacía");
    expect(meta.get("Generado (UTC)")).toBe("2026-10-18T14:05:00.000Z");
    expect(meta.get("Versión del formato")).toBe("1");
    expect(book[1].data).toEqual([["Nombre", "Celular", "Sexo", "Talla", "Ciudad", "Hospital", "Clínica", "Especialidad", "Notas", "Identificador"]]);
  });

  it("los datos actuales llevan un cliente por fila, ordenados y con el celular como texto", async () => {
    const buffer = await buildClientsWorkbook({
      kind: "datos",
      clients: [
        client(2, { name: "Álvarez Ruiz", city: "Caracas" }),
        client(3, { name: "Zoe", phoneE164: "+584240000001", notes: "=1+1" }),
        client(1, { name: "alvarez ruiz", sex: "Hombre" }),
      ],
      reference,
      generatedAt,
    });
    const book = await sheets(buffer);
    expect(book[0].data.some((row) => row[1] === "Datos actuales")).toBe(true);
    const rows = book[1].data.slice(1);
    expect(rows.map((row) => row[9])).toEqual([1, 2, 3]);
    expect(rows[0][1]).toBe("0414-246-7789");
    expect(rows[2][1]).toBe("0424-000-0001");
    expect(rows[2][8]).toBe("=1+1");
    expect(sheetXml(buffer, "xl/worksheets/sheet2.xml")).not.toContain("<f>");
  });

  it("incluye las ayudas dentro de Excel en las filas 2 a 10.001", async () => {
    const buffer = await buildClientsWorkbook({ kind: "plantilla", clients: [], reference, generatedAt });
    const xml = sheetXml(buffer, "xl/worksheets/sheet2.xml");
    const last = CLIENTS_MAX_ROWS + 1;
    expect(xml).toContain("<dataValidations");
    // Sexo: lista cerrada (el estilo stop es el predeterminado y no se escribe).
    expect(xml).toMatch(new RegExp(`<dataValidation type="list"[^>]*sqref="C2:C${last}"[^>]*><formula1>"?Mujer,Hombre"?</formula1>`));
    // Talla, Ciudad, Hospital, Clínica y Especialidad: sugerencias hacia Listas que permiten valores nuevos.
    for (const column of ["D", "E", "F", "G", "H"]) {
      expect(xml).toMatch(new RegExp(`errorStyle="information"[^>]*sqref="${column}2:${column}${last}"`));
    }
    expect(xml).toContain("Listas!$A$2");
    // Límites de longitud en Nombre y Notas.
    expect(xml).toMatch(new RegExp(`type="textLength"[^>]*sqref="A2:A${last}"`));
    expect(xml).toMatch(new RegExp(`type="textLength"[^>]*sqref="I2:I${last}"`));
    // Mensajes de ayuda del celular y del identificador.
    expect(xml).toMatch(new RegExp(`promptTitle="Celular"[^>]*sqref="B2:B${last}"`));
    expect(xml).toContain("No modifiques este valor; déjalo vacío para crear un registro nuevo.");
  });
});

describe("lectura de libros subidos", () => {
  const read = (bytes: Uint8Array, fileName = "clientes.xlsx") =>
    readSectionSheet<ClientColumnKey>({
      fileName,
      bytes,
      sectionLabel: "Clientes",
      columns: CLIENT_COLUMNS,
      idKey: "id",
      maxRows: CLIENTS_MAX_ROWS,
    });

  it("procesa un libro con la estructura de “Medicos” y lo informa", async () => {
    const result = await read(await medicosWorkbook([["Ana Pérez", 4142467789, "Mujer", "M", "Caracas", "Los Magallanes", null, "Pediatría"]]));
    expect(result.workbook.sheetName).toBe("Medicos");
    expect(result.rows).toHaveLength(1);
    expect(result.issues).toEqual([]);
  });

  it("detecta una sección distinta", async () => {
    const book = await buildWorkbookBuffer([
      { name: "Instrucciones", rows: sectionMetadataRows({ section: "Congresos", kind: "Datos actuales", generatedAt: generatedAt.toISOString(), version: 1 }) },
      { name: "Clientes", rows: [["Nombre", "Celular"], ["Ana", "4141234567"]] },
    ]);
    expect((await read(book)).issues.map((issue) => issue.code)).toEqual(["WRONG_SECTION"]);
  });

  it("detecta un libro sin Celular", async () => {
    const book = await buildWorkbookBuffer([{ name: "Clientes", rows: [["Nombre"], ["Ana"]] }]);
    const result = await read(book);
    expect(result.issues.find((issue) => issue.code === "MISSING_COLUMNS")?.message).toBe("Faltan columnas obligatorias: Celular.");
  });

  it("rechaza archivos con más de 10.000 filas", async () => {
    const rows: RawCell[][] = [["Nombre", "Celular"]];
    for (let index = 0; index <= CLIENTS_MAX_ROWS; index += 1) rows.push([`Cliente ${index}`, String(4_140_000_000 + index)]);
    const result = await read(await buildWorkbookBuffer([{ name: "Clientes", rows }]));
    expect(result.issues.map((issue) => issue.code)).toContain("TOO_MANY_ROWS");
  }, 30_000);

  it("informa las columnas desconocidas", async () => {
    const book = await buildWorkbookBuffer([{ name: "Clientes", rows: [["Nombre", "Celular", "Apodo"], ["Ana", "4141234567", "A"]] }]);
    const result = await read(book);
    expect(result.issues).toMatchObject([{ code: "IGNORED_COLUMNS", severity: "notice" }]);
    expect(result.workbook.ignoredColumns).toEqual(["Apodo"]);
  });
});
