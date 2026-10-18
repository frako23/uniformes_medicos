import { describe, expect, it } from "vitest";
import { buildReferenceIndex, canonicalize, type ReferenceRow } from "../../src/server/reference/values";

const rows: ReferenceRow[] = [
  { field: "hospital", value: "Los Magallanes", count: 3 },
  { field: "hospital", value: "los magallanes", count: 1 },
  { field: "hospital", value: "  ", count: 4 },
  { field: "city", value: "Valencia", count: 2 },
  { field: "city", value: "Maracay", count: 2 },
  { field: "city", value: "maracay", count: 2 },
  { field: "size", value: "M", count: 5 },
  { field: "size", value: "m", count: 1 },
  { field: "specialty", value: "Pediatría", count: 2 },
  { field: "specialty", value: "Pediatria", count: 1 },
];

describe("buildReferenceIndex y canonicalize", () => {
  const index = buildReferenceIndex(rows);

  it("agrupa por clave normalizada e ignora los vacíos", () => {
    expect(index.hospital.size).toBe(1);
    expect(index.hospital.get("los magallanes")).toBe("Los Magallanes");
  });
  it("elige la escritura más usada y, en empate, la primera alfabéticamente", () => {
    expect(index.city.get("maracay")).toBe("Maracay");
    expect(index.size.get("m")).toBe("M");
    expect(index.specialty.get("pediatria")).toBe("Pediatría");
  });
  it("usa la escritura canónica para valores existentes", () => {
    expect(canonicalize(index, "hospital", "los magallanes")).toEqual({ value: "Los Magallanes", isNew: false });
  });
  it("conserva recortado un valor nuevo", () => {
    expect(canonicalize(index, "hospital", "  Clínica Nueva ")).toEqual({ value: "Clínica Nueva", isNew: true });
  });
  it("las tallas combinan clientes y variantes del catálogo", () => {
    const merged = buildReferenceIndex([
      { field: "size", value: "L", count: 1 },
      { field: "size", value: "l", count: 3 },
    ]);
    expect(merged.size.get("l")).toBe("l");
  });
  it("las especialidades combinan clientes y congresos", () => {
    const merged = buildReferenceIndex([
      { field: "specialty", value: "Cardiología", count: 1 },
      { field: "specialty", value: "cardiologia", count: 1 },
    ]);
    expect(merged.specialty.get("cardiologia")).toBe("Cardiología");
  });
});
