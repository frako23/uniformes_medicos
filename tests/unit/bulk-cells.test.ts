import { describe, expect, it } from "vitest";
import {
  parseDateCell,
  parseDecimalCell,
  parseIntegerCell,
  parseOptionCell,
  parseOptionalText,
  parsePhoneCell,
  parseRefCell,
  parseRequiredText,
} from "../../src/server/bulk/cells";

const MONEY = {
  allowZero: false,
  maxIntegerDigits: 10,
  codes: { invalid: "INVALID_AMOUNT", decimals: "AMOUNT_DECIMALS", tooHigh: "AMOUNT_TOO_HIGH" },
} as const;

describe("parseDateCell", () => {
  it("lee un Date por sus componentes UTC", () => {
    expect(parseDateCell(new Date("2026-03-12T00:00:00Z"))).toEqual({ ok: true, value: "2026-03-12" });
  });
  it.each(["12/03/2026", "12-03-2026", "12.3.2026", "2026-03-12", 46093])("acepta %s", (input) => {
    expect(parseDateCell(input)).toEqual({ ok: true, value: "2026-03-12" });
  });
  it.each([36525, 73051, "31/02/2026", "marzo", true])("rechaza %s", (input) => {
    expect(parseDateCell(input)).toEqual({ ok: false, code: "INVALID_DATE" });
  });
  it("una celda vacía es null", () => {
    expect(parseDateCell("  ")).toEqual({ ok: true, value: null });
  });
});

describe("parseDecimalCell", () => {
  it.each([
    ["25", 2500],
    ["25,5", 2550],
    [49.990000000000002, 4999],
  ])("acepta %s", (input, cents) => {
    const result = parseDecimalCell(input, MONEY);
    expect(result.ok && result.cents).toBe(cents);
  });
  it.each([
    ["$50", "INVALID_AMOUNT"],
    [0, "INVALID_AMOUNT"],
    ["1.250", "AMOUNT_DECIMALS"],
    [49.999, "AMOUNT_DECIMALS"],
    [10000000000, "AMOUNT_TOO_HIGH"],
  ])("rechaza %s", (input, code) => {
    expect(parseDecimalCell(input, MONEY)).toEqual({ ok: false, code });
  });
  it("un monto vacío es null", () => {
    expect(parseDecimalCell("", MONEY)).toEqual({ ok: true, value: null, cents: null });
  });
});

describe("parseIntegerCell", () => {
  const options = { min: 1, max: 48, code: "INVALID_INSTALLMENT_COUNT" } as const;
  it("acepta enteros", () => {
    expect(parseIntegerCell("4", options)).toEqual({ ok: true, value: 4 });
    expect(parseIntegerCell(4, options)).toEqual({ ok: true, value: 4 });
  });
  it.each([2.5, -1, "x", 49, 0])("rechaza %s", (input) => {
    expect(parseIntegerCell(input, options)).toEqual({ ok: false, code: "INVALID_INSTALLMENT_COUNT" });
  });
  it("vacío es null", () => {
    expect(parseIntegerCell(null, options)).toEqual({ ok: true, value: null });
  });
});

describe("parseRefCell", () => {
  it("acepta números y textos numéricos", () => {
    expect(parseRefCell(15)).toEqual({ ok: true, value: 15 });
    expect(parseRefCell("15")).toEqual({ ok: true, value: 15 });
    expect(parseRefCell(null)).toEqual({ ok: true, value: null });
  });
  it.each(["abc", 0, 1.5])("rechaza %s", (input) => {
    expect(parseRefCell(input)).toEqual({ ok: false, code: "INVALID_ID" });
  });
});

describe("parseOptionCell", () => {
  const sexes = { mujer: "Mujer", hombre: "Hombre" };
  it("ignora mayúsculas y espacios", () => {
    expect(parseOptionCell("mujer", sexes, "INVALID_SEX")).toEqual({ ok: true, value: "Mujer" });
    expect(parseOptionCell(" HOMBRE ", sexes, "INVALID_SEX")).toEqual({ ok: true, value: "Hombre" });
  });
  it("rechaza otros valores con el código indicado", () => {
    expect(parseOptionCell("M", sexes, "INVALID_SEX")).toEqual({ ok: false, code: "INVALID_SEX" });
  });
  it("vacío es null", () => {
    expect(parseOptionCell("", sexes, "INVALID_SEX")).toEqual({ ok: true, value: null });
  });
});

describe("textos", () => {
  it("un texto obligatorio vacío da REQUIRED", () => {
    expect(parseRequiredText("  ", 160)).toEqual({ ok: false, code: "REQUIRED" });
    expect(parseRequiredText(null, 160)).toEqual({ ok: false, code: "REQUIRED" });
  });
  it("un texto demasiado largo da TOO_LONG con n", () => {
    expect(parseRequiredText("a".repeat(161), 160)).toEqual({ ok: false, code: "TOO_LONG", n: 160 });
    expect(parseOptionalText("a".repeat(41), 40)).toEqual({ ok: false, code: "TOO_LONG", n: 40 });
  });
  it("un Date o un booleano dan INVALID_TYPE", () => {
    expect(parseRequiredText(new Date(), 160)).toEqual({ ok: false, code: "INVALID_TYPE" });
    expect(parseOptionalText(true, 160)).toEqual({ ok: false, code: "INVALID_TYPE" });
  });
  it("un número se convierte a texto y el vacío opcional es null", () => {
    expect(parseRequiredText(42, 160)).toEqual({ ok: true, value: "42" });
    expect(parseOptionalText("", 160)).toEqual({ ok: true, value: null });
    expect(parseOptionalText("  hola  ", 160)).toEqual({ ok: true, value: "hola" });
  });
});

describe("parsePhoneCell", () => {
  it("normaliza celulares numéricos", () => {
    expect(parsePhoneCell(4142467789)).toEqual({ ok: true, value: "+584142467789" });
  });
  it("rechaza los inválidos y exige el celular", () => {
    expect(parsePhoneCell("123")).toEqual({ ok: false, code: "INVALID_PHONE" });
    expect(parsePhoneCell("")).toEqual({ ok: false, code: "REQUIRED" });
  });
});
