import { strFromU8, unzipSync } from "fflate";
import readExcelFile from "read-excel-file/node";
import { describe, expect, it } from "vitest";
import { readSectionSheet } from "../../src/server/bulk/sheet";
import type { SnapshotCongress } from "../../src/server/congresses/bulk/changes";
import { CONGRESS_COLUMNS, CONGRESSES_MAX_ROWS, type CongressColumnKey } from "../../src/server/congresses/bulk/format";
import { parseCongressRow } from "../../src/server/congresses/bulk/rows";
import { buildCongressesWorkbook } from "../../src/server/congresses/bulk/workbook";
import { buildReferenceIndex } from "../../src/server/reference/values";
import { buildWorkbookBuffer, medicosWorkbook, type RawCell } from "../fixtures/bulk/workbook-builder";

const generatedAt = new Date("2026-10-18T14:05:00.000Z");
const reference = buildReferenceIndex([{ field: "specialty", value: "Mastología", count: 1 }]);
const sheets = async (buffer: Buffer) => (await readExcelFile(buffer as never)) as unknown as Array<{ sheet: string; data: unknown[][] }>;
const xml = (buffer: Buffer) => strFromU8(unzipSync(new Uint8Array(buffer))["xl/worksheets/sheet2.xml"]);

function congress(ref: number, input: Partial<SnapshotCongress> = {}): SnapshotCongress {
  return { id: `id-${ref}`, ref, name: `Congreso ${ref}`, startDate: "2026-11-10", endDate: "2026-11-12", venue: null, specialty: null, notes: null, updatedAt: generatedAt, ...input };
}

describe("libro de congresos", () => {
  it("la plantilla trae las tres hojas, la sección y el encabezado", async () => {
    const book = await sheets(await buildCongressesWorkbook({ kind: "plantilla", congresses: [], reference, generatedAt }));
    expect(book.map((sheet) => sheet.sheet)).toEqual(["Instrucciones", "Congresos", "Listas"]);
    expect(book[0].data.find((row) => row[0] === "Sección")?.[1]).toBe("Congresos");
    expect(book[0].data.find((row) => row[0] === "Tipo de archivo")?.[1]).toBe("Plantilla vacía");
    expect(book[1].data).toEqual([["Desde", "Hasta", "Especialidad", "Lugar", "Nombre", "Notas", "Identificador"]]);
    expect(book[2].data).toEqual([["Especialidades"], ["Mastología"]]);
  });

  it("los datos actuales van ordenados por Desde, Nombre e Identificador con fechas de Excel", async () => {
    const buffer = await buildCongressesWorkbook({
      kind: "datos",
      congresses: [
        congress(3, { name: "Beta", startDate: "2026-11-10" }),
        congress(1, { name: "Zeta", startDate: "2026-10-30", endDate: "2026-11-01", specialty: "Mastología" }),
        congress(2, { name: "alfa", startDate: "2026-11-10" }),
      ],
      reference,
      generatedAt,
    });
    const book = await sheets(buffer);
    const rows = book[1].data.slice(1);
    expect(rows.map((row) => row[6])).toEqual([1, 2, 3]);
    expect(rows[0][0]).toBeInstanceOf(Date);
    expect((rows[0][0] as Date).toISOString()).toBe("2026-10-30T00:00:00.000Z");
    expect((rows[0][1] as Date).toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(book[0].data.some((row) => row[1] === "Datos actuales")).toBe(true);
  });

  it("incluye las validaciones en las filas 2 a 10.001", async () => {
    const sheet = xml(await buildCongressesWorkbook({ kind: "plantilla", congresses: [], reference, generatedAt }));
    const last = CONGRESSES_MAX_ROWS + 1;
    for (const column of ["A", "B"]) expect(sheet).toMatch(new RegExp(`type="date"[^>]*sqref="${column}2:${column}${last}"`));
    expect(sheet).toContain('errorStyle="warning"');
    expect(sheet).toMatch(new RegExp(`errorStyle="information"[^>]*sqref="C2:C${last}"`));
    expect(sheet).toMatch(new RegExp(`type="textLength"[^>]*sqref="D2:D${last}"`));
    expect(sheet).toMatch(new RegExp(`type="textLength"[^>]*sqref="E2:E${last}"`));
  });

  it("las filas de la hoja Eventos copiadas en la plantilla se leen con sus fechas UTC", async () => {
    const eventos = [
      [new Date("2026-10-30T00:00:00Z"), new Date("2026-11-01T00:00:00Z"), "Mastología", "Hotel Eurobuilding", "Congreso de Mastología"],
      [null, null, "Medicina Estética", null, null],
    ];
    const source = await medicosWorkbook([], eventos);
    const read = (await readExcelFile(source as never)) as unknown as Array<{ sheet: string; data: unknown[][] }>;
    const rows = read.find((item) => item.sheet === "Eventos")!.data.slice(1) as RawCell[][];

    const result = await readSectionSheet<CongressColumnKey>({
      fileName: "congresos.xlsx",
      bytes: await buildWorkbookBuffer([{ name: "Congresos", rows: [["Desde", "Hasta", "Especialidad", "Lugar", "Nombre"], ...rows] }]),
      sectionLabel: "Congresos",
      columns: CONGRESS_COLUMNS,
      idKey: "id",
      maxRows: CONGRESSES_MAX_ROWS,
    });
    const parsed = result.rows.map((row) => parseCongressRow(row.cells, result.columns, row.excelRow));
    expect(parsed[0].issues).toEqual([]);
    expect(parsed[0].values.from?.value).toBe("2026-10-30");
    expect(parsed[0].values.to?.value).toBe("2026-11-01");
    expect(parsed[1].issues.map((issue) => issue.code).sort()).toEqual(["REQUIRED", "REQUIRED", "REQUIRED"]);
  });
});
