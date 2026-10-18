import { describe, expect, it } from "vitest";
import { BulkFileError } from "../../src/server/bulk/issues";
import { readSectionSheet, type SectionColumnDef } from "../../src/server/bulk/sheet";
import {
  buildWorkbookBuffer,
  medicosWorkbook,
  sectionMetadataRows,
  truncatedZip,
  type RawCell,
} from "../fixtures/bulk/workbook-builder";

type Key = "name" | "phone" | "notes" | "id";

const COLUMNS: SectionColumnDef<Key>[] = [
  { key: "name", header: "Nombre", required: true },
  { key: "phone", header: "Celular", aliases: ["Celular del cliente"], required: true },
  { key: "notes", header: "Notas" },
  { key: "id", header: "Identificador" },
];

const read = (bytes: Uint8Array, maxRows = 10_000) =>
  readSectionSheet<Key>({ fileName: "datos.xlsx", bytes, sectionLabel: "Clientes", columns: COLUMNS, idKey: "id", maxRows });

const META_OK = sectionMetadataRows({
  section: "Clientes",
  kind: "Datos actuales",
  generatedAt: "2026-10-18T14:05:00.000Z",
  version: 1,
});

const book = (header: RawCell[], rows: RawCell[][], instructions: RawCell[][] | null = META_OK, sheetName = "Clientes") =>
  buildWorkbookBuffer([
    ...(instructions ? [{ name: "Instrucciones", rows: instructions }] : []),
    { name: sheetName, rows: [header, ...rows] },
    { name: "Listas", rows: [["Tallas"]] },
  ]);

const codes = (result: Awaited<ReturnType<typeof read>>) => result.issues.map((issue) => issue.code);

describe("readSectionSheet", () => {
  it("procesa la hoja de la sección y lee los metadatos", async () => {
    const result = await read(await book(["Nombre", "Celular"], [["Ana", "4141234567"]]));
    expect(result.workbook.sheetName).toBe("Clientes");
    expect(result.workbook).toMatchObject({ declaredSection: "Clientes", kind: "datos", formatVersion: 1 });
    expect(result.workbook.generatedAt?.toISOString()).toBe("2026-10-18T14:05:00.000Z");
    expect(result.rows).toHaveLength(1);
    expect(result.issues).toEqual([]);
  });

  it("reconoce la plantilla y los tipos desconocidos", async () => {
    const template = sectionMetadataRows({ section: "Clientes", kind: "Plantilla vacía", generatedAt: "2026-10-18T14:05:00.000Z", version: 1 });
    expect((await read(await book(["Nombre", "Celular"], [["A", "1"]], template))).workbook.kind).toBe("plantilla");
    const other = sectionMetadataRows({ section: "Clientes", kind: "Otra cosa", generatedAt: "2026-10-18T14:05:00.000Z", version: 1 });
    expect((await read(await book(["Nombre", "Celular"], [["A", "1"]], other))).workbook.kind).toBe("desconocido");
  });

  it("usa la primera hoja si no existe la de la sección", async () => {
    const result = await read(await medicosWorkbook([["Ana", 4141234567, "Mujer", "M", "Caracas", "H", null, "Pediatría"]]));
    expect(result.workbook.sheetName).toBe("Medicos");
    expect(result.rows).toHaveLength(1);
    expect(codes(result)).toEqual(["IGNORED_COLUMNS"]);
  });

  it("detecta una sección distinta y tolera su ausencia", async () => {
    const wrong = sectionMetadataRows({ section: "Congresos", kind: "Datos actuales", generatedAt: "2026-10-18T14:05:00.000Z", version: 1 });
    const result = await read(await book(["Nombre", "Celular"], [["A", "1"]], wrong));
    expect(codes(result)).toEqual(["WRONG_SECTION"]);
    expect(result.issues[0].message).toBe(
      "Este archivo es de la sección Congresos. Súbelo en esa sección o usa la plantilla de Clientes.",
    );
    expect(result.rows).toEqual([]);

    const none = sectionMetadataRows({ kind: "Datos actuales", generatedAt: "2026-10-18T14:05:00.000Z", version: 1 });
    expect(codes(await read(await book(["Nombre", "Celular"], [["A", "1"]], none)))).toEqual([]);
  });

  it("reconoce encabezados en cualquier orden, con otras mayúsculas, tildes y alias", async () => {
    const result = await read(await book([" CELULAR del cliente ", " nombre ", "NOTAS"], [["1", "Ana", "x"]]));
    expect(result.columns.map((column) => [column.key, column.index])).toEqual([
      ["phone", 0],
      ["name", 1],
      ["notes", 2],
    ]);
  });

  it("informa columnas duplicadas, faltantes y desconocidas", async () => {
    const duplicate = await read(await book(["Nombre", "nombre", "Celular"], [["A", "B", "1"]]));
    expect(codes(duplicate)).toContain("DUPLICATE_COLUMN");
    expect(duplicate.rows).toEqual([]);

    const missing = await read(await book(["Notas"], [["x"]]));
    expect(missing.issues.find((issue) => issue.code === "MISSING_COLUMNS")?.message).toBe(
      "Faltan columnas obligatorias: Nombre, Celular.",
    );

    const ignored = await read(await book(["Nombre", "Celular", "Color favorito"], [["A", "1", "azul"]]));
    expect(ignored.issues).toMatchObject([{ code: "IGNORED_COLUMNS", severity: "notice" }]);
    expect(ignored.rows).toHaveLength(1);
  });

  it("informa NO_ROWS y TOO_MANY_ROWS con su límite", async () => {
    expect(codes(await read(await book(["Nombre", "Celular"], [])))).toContain("NO_ROWS");
    const many = await read(await book(["Nombre", "Celular"], [["A", "1"], ["B", "2"], ["C", "3"]]), 2);
    expect(many.issues.find((issue) => issue.code === "TOO_MANY_ROWS")?.message).toBe(
      "El archivo tiene 3 filas; el máximo es 2. Divídelo en varios archivos.",
    );
  });

  it("ignora filas vacías y conserva el número de fila de Excel", async () => {
    const result = await read(await book(["Nombre", "Celular"], [["Ana", "1"], [null, null], ["Luz", "2"]]));
    expect(result.rows.map((row) => row.excelRow)).toEqual([2, 4]);
  });

  it("emite MISSING_METADATA solo si falta la fecha y hay Identificador", async () => {
    const noDate = sectionMetadataRows({ section: "Clientes", kind: "Datos actuales", version: 1 });
    expect(codes(await read(await book(["Nombre", "Celular", "Identificador"], [["A", "1", 5]], noDate)))).toContain("MISSING_METADATA");
    expect(codes(await read(await book(["Nombre", "Celular", "Identificador"], [["A", "1", null]], noDate)))).not.toContain("MISSING_METADATA");
    expect(codes(await read(await book(["Nombre", "Celular"], [["A", "1"]], noDate)))).not.toContain("MISSING_METADATA");
  });

  it("rechaza los archivos ilegibles con BulkFileError", async () => {
    await expect(read(await truncatedZip())).rejects.toBeInstanceOf(BulkFileError);
  });
});
