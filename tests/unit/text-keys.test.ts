import { describe, expect, it } from "vitest";
import { normalizeKey } from "../../src/utils/text-keys";
import { normalizeHeader } from "../../src/server/inventory/workbook-format";

describe("normalizeKey", () => {
  it("une espacios y pasa a minúsculas", () => {
    expect(normalizeKey("  Los   Magallanes ")).toBe("los magallanes");
    expect(normalizeKey("los magallanes")).toBe("los magallanes");
  });
  it("ignora tildes y mayúsculas", () => {
    expect(normalizeKey("Clínica")).toBe(normalizeKey("Clinica"));
    expect(normalizeKey("CLÍNICA")).toBe(normalizeKey("Clinica"));
    expect(normalizeKey("Álvarez")).toBe("alvarez");
  });
  it("coincide con normalizeHeader de la 003", () => {
    for (const text of ["  Los   Magallanes ", "Clínica", "CLÍNICA", "Álvarez"]) {
      expect(normalizeHeader(text)).toBe(normalizeKey(text));
    }
  });
});
