import { describe, expect, it } from "vitest";
import { countIssues, createIssue, groupIssues } from "../../src/server/inventory/issues";

describe("agrupación de incidencias", () => {
  it("agrupa por código y columna, compacta filas en rangos y cuenta ocurrencias", () => {
    const issues = [4, 9, 10, 11, 12, 20].map((row) => createIssue("INVALID_PRICE", { column: "Precio", row }));
    const [group, ...rest] = groupIssues(issues);
    expect(rest).toEqual([]);
    expect(group).toMatchObject({ severity: "error", code: "INVALID_PRICE", column: "Precio", rows: ["4", "9-12", "20"], count: 6 });
  });

  it("separa grupos con distinto mensaje y ordena errores, advertencias y avisos", () => {
    const grouped = groupIssues([
      createIssue("MISSING_METADATA"),
      createIssue("NEW_VALUE", { column: "Marca", row: 3, value: "Nueva" }),
      createIssue("NEW_VALUE", { column: "Marca", row: 4, value: "Otra" }),
      createIssue("REQUIRED", { column: "Color", row: 2 }),
    ]);
    expect(grouped.map((issue) => issue.severity)).toEqual(["error", "warning", "warning", "notice"]);
    expect(grouped[1].message).not.toBe(grouped[2].message);
  });

  it("las incidencias de archivo completo no llevan columna ni filas", () => {
    const [issue] = groupIssues([createIssue("NO_PRODUCTS")]);
    expect(issue).toMatchObject({ column: null, rows: [], count: 1 });
  });

  it("cuenta errores y advertencias por ocurrencias", () => {
    const grouped = groupIssues([
      createIssue("REQUIRED", { column: "Color", row: 2 }),
      createIssue("REQUIRED", { column: "Color", row: 3 }),
      createIssue("BECOMES_AVAILABLE", { row: 2 }),
      createIssue("IGNORED_COLUMNS", { list: ["Notas"] }),
    ]);
    expect(countIssues(grouped)).toEqual({ errors: 2, warnings: 1 });
  });

  it("usa los mensajes literales del contrato", () => {
    expect(createIssue("SHEET_NOT_FOUND", { list: ["A", "B"] }).message).toBe("No se encontró la hoja “Inventario”. Hojas del archivo: A, B.");
    expect(createIssue("REQUIRED", { column: "Marca" }).message).toBe("Marca es obligatorio. La celda está vacía o tiene un error de fórmula.");
    expect(createIssue("SKU_IN_USE", { id: 7 }).message).toBe("El SKU ya pertenece al producto con ID 7.");
    expect(createIssue("PRICE_TOO_HIGH").message).toBe("El precio supera el máximo permitido (99.999.999,99).");
    expect(createIssue("TOO_MANY_PRODUCTS", { n: 5001 }).message).toContain("el máximo es 5.000");
  });
});
