import { strFromU8, unzipSync } from "fflate";
import readExcelFile from "read-excel-file/node";
import { describe, expect, it } from "vitest";
import { createSnapshot } from "../../src/server/inventory/changes";
import { InventoryFileError, type FileRejectionCode } from "../../src/server/inventory/issues";
import { parseInventoryRow } from "../../src/server/inventory/rows";
import { readInventoryWorkbook } from "../../src/server/inventory/workbook-reader";
import { buildInventoryWorkbook } from "../../src/server/inventory/workbook-writer";
import { makeProduct, makeSnapshot } from "../unit/inventory-fixtures";
import {
  FIXED_HEADER,
  buildInventoryBuffer,
  metadataRows,
  oleContainerBytes,
  plainTextBytes,
  truncatedZip,
  zipWithManyEntries,
  zipWithMacros,
  zipWithoutWorkbook,
} from "../fixtures/inventory/workbook-builder";

const generatedAt = new Date("2026-10-17T20:30:00.000Z");

async function sheets(buffer: Buffer) {
  return (await readExcelFile(buffer as never)) as unknown as Array<{ sheet: string; data: unknown[][] }>;
}

function sheetXml(buffer: Buffer, name: string) {
  const files = unzipSync(new Uint8Array(buffer));
  return strFromU8(files[name]);
}

async function rejection(bytes: Uint8Array, fileName = "inventario.xlsx"): Promise<FileRejectionCode | null> {
  try {
    await readInventoryWorkbook({ fileName, bytes });
    return null;
  } catch (error) {
    if (error instanceof InventoryFileError) return error.code;
    throw error;
  }
}

describe("exportación del inventario", () => {
  it("genera las tres hojas, los metadatos y el encabezado en orden de tallas", async () => {
    const buffer = await buildInventoryWorkbook({ kind: "inventario", snapshot: makeSnapshot(), generatedAt });
    const result = await sheets(buffer);
    expect(result.map((sheet) => sheet.sheet)).toEqual(["Instrucciones", "Inventario", "Listas"]);

    const metadata = new Map(result[0].data.filter((row) => row.length >= 2).map((row) => [row[0], row[1]]));
    expect(metadata.get("Tipo de archivo")).toBe("Inventario actual");
    expect(metadata.get("Generado (UTC)")).toBe("2026-10-17T20:30:00.000Z");
    expect(metadata.get("Versión del formato")).toBe("1");

    const header = result[1].data[0];
    expect(header.slice(0, 10)).toEqual(FIXED_HEADER);
    expect(header.slice(10)).toEqual(["Talla XS", "Talla S", "Talla M", "Talla L", "Talla XXL", "Talla 2XL", "Talla Única"]);
  });

  it("escribe una fila por producto, incluidos no publicados e inactivos, con ceros y celdas vacías", async () => {
    const buffer = await buildInventoryWorkbook({ kind: "inventario", snapshot: makeSnapshot(), generatedAt });
    const rows = (await sheets(buffer))[1].data;
    expect(rows).toHaveLength(7);
    const byId = new Map(rows.slice(1).map((row) => [row[0], row]));
    const first = byId.get(1)!;
    expect(first.slice(1, 10)).toEqual(["Bata", "Fab A", "Marca A", "Dama", 50, null, "Blanca", "Sí", "Sí"]);
    // S = 5, M = 5, L = 0 y XS vacío.
    expect(first.slice(10)).toEqual([null, 5, 5, 0, null, null, null]);
    expect(byId.get(3)![8]).toBe("No");
    expect(byId.get(4)![9]).toBe("No");
    // El producto con M y m marca la columna M con “Unificar tallas”.
    expect(byId.get(6)![12]).toBe("Unificar tallas");
  });

  it("ordena por Tipo, Marca, Color, Género e ID", async () => {
    const snapshot = createSnapshot([
      makeProduct({ legacyId: 3, type: "Pantalón", brand: "A" }),
      makeProduct({ legacyId: 2, type: "Bata", brand: "B" }),
      makeProduct({ legacyId: 1, type: "Bata", brand: "A", color: "Verde" }),
      makeProduct({ legacyId: 4, type: "Bata", brand: "A", color: "Azul" }),
    ]);
    const rows = (await sheets(await buildInventoryWorkbook({ kind: "inventario", snapshot, generatedAt })))[1].data;
    expect(rows.slice(1).map((row) => row[0])).toEqual([4, 1, 2, 3]);
  });

  it("no genera fórmulas y declara las validaciones en las filas 2 a 5001", async () => {
    const snapshot = createSnapshot([makeProduct({ legacyId: 1, type: "=SUM(1,2)", variants: [{ id: "a", sizeLabel: "S", quantity: 1 }] })]);
    const buffer = await buildInventoryWorkbook({ kind: "inventario", snapshot, generatedAt });
    const xml = sheetXml(buffer, "xl/worksheets/sheet2.xml");
    expect(xml).not.toContain("<f>");
    expect(xml).not.toContain("<f ");
    expect(xml).toContain("<dataValidations");
    expect(xml).toContain("Dama,Caballero,Unisex");
    expect(xml).toContain("Sí,No");
    expect(xml).toContain("A2:A5001");
    expect(xml).toContain('type="whole"');
    expect(xml).toContain('type="decimal"');
    expect(xml).toContain('errorStyle="information"');
    expect(xml).toContain("Listas!$A$2");
    expect((await sheets(buffer))[1].data[1][1]).toBe("=SUM(1,2)");
  });

  it("la exportación se vuelve a leer sin errores de estructura", async () => {
    const buffer = await buildInventoryWorkbook({ kind: "inventario", snapshot: makeSnapshot(), generatedAt });
    const read = await readInventoryWorkbook({ fileName: "inventario.xlsx", bytes: buffer });
    expect(read.issues).toEqual([]);
    expect(read.workbook).toMatchObject({ kind: "inventario", formatVersion: 1 });
    expect(read.workbook.generatedAt?.toISOString()).toBe(generatedAt.toISOString());
    expect(read.rows).toHaveLength(6);
    expect(read.columns.filter((column) => column.key === "size")).toHaveLength(7);
  });
});

describe("plantilla vacía", () => {
  it("contiene solo el encabezado, las mismas validaciones y las listas del catálogo", async () => {
    const buffer = await buildInventoryWorkbook({ kind: "plantilla", snapshot: makeSnapshot(), generatedAt });
    const result = await sheets(buffer);
    const metadata = new Map(result[0].data.filter((row) => row.length >= 2).map((row) => [row[0], row[1]]));
    expect(metadata.get("Tipo de archivo")).toBe("Plantilla vacía");
    expect(result[1].data).toHaveLength(1);
    expect(result[1].data[0].slice(10)).toHaveLength(7);
    expect(sheetXml(buffer, "xl/worksheets/sheet2.xml")).toContain("A2:A5001");
    expect(result[2].data[0]).toEqual(["Tipos", "Fabricantes", "Marcas", "Colores", "Tallas"]);
    expect(result[2].data[1][0]).toBe("Bata");
  });
});

describe("estructura del archivo subido", () => {
  const read = async (input: Parameters<typeof buildInventoryBuffer>[0]) =>
    readInventoryWorkbook({ fileName: "datos.xlsx", bytes: await buildInventoryBuffer(input) });
  const row = (id: number | null = null): (string | number | null)[] => [id, "Bata", "Fab", "Marca", "Dama", 50, null, "Blanca", "Sí", "Sí"];
  const issueCodes = (result: Awaited<ReturnType<typeof read>>) => result.issues.map((issue) => issue.code);

  it("falta la hoja Inventario", async () => {
    const result = await read({ inventorySheetName: "Otra" });
    expect(issueCodes(result)).toContain("SHEET_NOT_FOUND");
    expect(result.issues.find((issue) => issue.code === "SHEET_NOT_FOUND")?.message).toContain("Otra");
  });

  it("detecta columnas faltantes, duplicadas e inválidas", async () => {
    const renamed = FIXED_HEADER.map((header) => (header === "Color" ? "Colour" : header));
    expect(issueCodes(await read({ header: renamed, rows: [row()] }))).toContain("MISSING_COLUMNS");
    expect(issueCodes(await read({ header: [...FIXED_HEADER, "Precio"], rows: [row()] }))).toContain("DUPLICATE_COLUMN");
    expect(issueCodes(await read({ header: [...FIXED_HEADER, "Talla"], rows: [row()] }))).toContain("INVALID_SIZE_COLUMN");
    expect(issueCodes(await read({ header: [...FIXED_HEADER, "Talla M", "Talla m"], rows: [row()] }))).toContain("DUPLICATE_COLUMN");
  });

  it("detecta archivos sin productos o con demasiados", async () => {
    expect(issueCodes(await read({ rows: [] }))).toContain("NO_PRODUCTS");
    const many = Array.from({ length: 5001 }, (_, index) => row(index + 1));
    expect(issueCodes(await read({ rows: many }))).toContain("TOO_MANY_PRODUCTS");
  });

  it("avisa de columnas desconocidas y de metadatos ausentes sin invalidar el archivo", async () => {
    const result = await read({ header: [...FIXED_HEADER, "Notas"], rows: [row()], instructions: null });
    expect(issueCodes(result)).toEqual(expect.arrayContaining(["IGNORED_COLUMNS", "MISSING_METADATA"]));
    expect(result.issues.every((issue) => issue.severity !== "error")).toBe(true);
    expect(result.workbook.kind).toBe("desconocido");
    expect(result.rows).toHaveLength(1);
  });

  it("reconoce encabezados reordenados y con otra capitalización", async () => {
    const header = ["activo", " GÉNERO ", "id", "tipo", "fabricante", "marca", "precio", "sku", "color", "publicado", "talla  m"];
    const result = await read({ header, rows: [["Sí", "Dama", 4, "Bata", "Fab", "Marca", 50, null, "Blanca", "Sí", 7]] });
    expect(result.issues).toEqual([]);
    const parsed = parseInventoryRow(result.rows[0].cells, result.columns, result.rows[0].excelRow);
    expect(parsed.issues).toEqual([]);
    expect(parsed.legacyId).toBe(4);
    expect(parsed.sizes.M).toEqual({ label: "m", quantity: 7 });
  });

  it("el número de fila coincide con la fila de Excel aunque haya filas vacías", async () => {
    const result = await read({ rows: [row(1), [], [null], row(2)] });
    expect(result.rows.map((candidate) => candidate.excelRow)).toEqual([2, 5]);
  });
});

describe("rechazos de archivo", () => {
  it.each([
    ["contenedor OLE", () => oleContainerBytes(), "inventario.xlsx", "FILE_PROTECTED_OR_XLS"],
    ["texto plano", () => plainTextBytes(), "inventario.xlsx", "FILE_NOT_XLSX"],
    ["zip sin xl/workbook.xml", () => zipWithoutWorkbook(), "inventario.xlsx", "FILE_NOT_XLSX"],
    ["extensión .csv", () => Buffer.from("a,b"), "inventario.csv", "FILE_NOT_XLSX"],
    ["macros", () => zipWithMacros(), "inventario.xlsx", "FILE_HAS_MACROS"],
    ["201 entradas", () => zipWithManyEntries(201), "inventario.xlsx", "FILE_UNREADABLE"],
    ["más de 4 MB", () => Buffer.alloc(4 * 1024 * 1024 + 1, 1), "inventario.xlsx", "FILE_TOO_LARGE"],
    ["0 bytes", () => Buffer.alloc(0), "inventario.xlsx", "FILE_REQUIRED"],
  ] as const)("%s", async (_name, bytes, fileName, expected) => {
    expect(await rejection(bytes(), fileName)).toBe(expected);
  });

  it("un zip truncado no se puede leer", async () => {
    expect(await rejection(await truncatedZip())).toBe("FILE_UNREADABLE");
  });

  it("usa el mensaje del contrato", async () => {
    await expect(readInventoryWorkbook({ fileName: "x.xlsx", bytes: zipWithMacros() })).rejects.toThrow(
      "El archivo contiene macros. Guárdalo como Excel (.xlsx) sin macros.",
    );
  });

  it("los metadatos de ejemplo siguen siendo válidos", () => {
    expect(metadataRows()[0]).toEqual(["Tipo de archivo", "Inventario actual"]);
  });
});
