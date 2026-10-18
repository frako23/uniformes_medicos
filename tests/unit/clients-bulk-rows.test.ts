import { describe, expect, it } from "vitest";
import { parseClientRow } from "../../src/server/clients/bulk/rows";
import { CLIENT_COLUMNS } from "../../src/server/clients/bulk/format";
import type { SheetColumn } from "../../src/server/bulk/sheet";
import type { ClientColumnKey } from "../../src/server/clients/bulk/format";

const columnsFor = (keys: ClientColumnKey[]): SheetColumn<ClientColumnKey>[] =>
  keys.map((key, index) => ({ key, header: CLIENT_COLUMNS.find((column) => column.key === key)!.header, index }));

const ALL = columnsFor(["name", "phone", "sex", "size", "city", "hospital", "clinic", "specialty", "notes", "id"]);
const row = (cells: Array<string | number | null>, columns = ALL) => parseClientRow(cells, columns, 7);
const codes = (parsed: ReturnType<typeof row>) => parsed.issues.map((issue) => issue.code);

describe("parseClientRow", () => {
  it("interpreta una fila válida", () => {
    const parsed = row(["Ana Pérez", 4142467789, "mujer", "M", "Caracas", "Los Magallanes", null, "Pediatría", "nota", 15]);
    expect(parsed.issues).toEqual([]);
    expect(parsed.excelRow).toBe(7);
    expect(parsed.ref).toBe(15);
    expect(parsed.values.name).toEqual({ value: "Ana Pérez", empty: false });
    expect(parsed.values.phone).toEqual({ value: "+584142467789", empty: false });
    expect(parsed.values.sex).toEqual({ value: "Mujer", empty: false });
    expect(parsed.values.clinic).toEqual({ value: null, empty: true });
  });

  it("valida el nombre", () => {
    expect(codes(row(["", "4142467789"]))).toEqual(["REQUIRED"]);
    const long = row(["a".repeat(161), "4142467789"]);
    expect(codes(long)).toEqual(["TOO_LONG"]);
    expect(long.issues[0]).toMatchObject({ column: "Nombre", row: 7 });
  });

  it("valida el celular", () => {
    expect(codes(row(["Ana", ""]))).toEqual(["REQUIRED"]);
    expect(codes(row(["Ana", "414246778"]))).toEqual(["INVALID_PHONE"]);
    expect(row(["Ana", "414246778"]).issues[0].column).toBe("Celular");
  });

  it("acepta el sexo sin distinguir mayúsculas ni espacios", () => {
    expect(row(["Ana", "4142467789", " HOMBRE "]).values.sex?.value).toBe("Hombre");
    expect(codes(row(["Ana", "4142467789", "M"]))).toEqual(["INVALID_SEX"]);
  });

  it("respeta los límites de talla y notas", () => {
    expect(codes(row(["Ana", "4142467789", null, "a".repeat(40)]))).toEqual([]);
    expect(codes(row(["Ana", "4142467789", null, "a".repeat(41)]))).toEqual(["TOO_LONG"]);
    expect(codes(row(["Ana", "4142467789", null, null, null, null, null, null, "a".repeat(1000)]))).toEqual([]);
    expect(codes(row(["Ana", "4142467789", null, null, null, null, null, null, "a".repeat(1001)]))).toEqual(["TOO_LONG"]);
  });

  it("valida el identificador", () => {
    expect(codes(row(["Ana", "4142467789", null, null, null, null, null, null, null, "abc"]))).toEqual(["INVALID_ID"]);
    expect(row(["Ana", "4142467789"]).ref).toBeNull();
  });

  it("present refleja solo las columnas del archivo", () => {
    const parsed = row(["Ana", "4142467789", "Mujer"], columnsFor(["name", "phone", "sex"]));
    expect([...parsed.present].sort()).toEqual(["name", "phone", "sex"]);
    expect(parsed.values.city).toBeUndefined();
  });
});
