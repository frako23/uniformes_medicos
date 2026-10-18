import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone, phoneSearchDigits } from "../../src/utils/phone";

describe("normalizePhone", () => {
  it.each([
    [4142467789, "+584142467789"],
    ["04142467789", "+584142467789"],
    ["0414-246.77.89", "+584142467789"],
    ["(0414) 246 7789", "+584142467789"],
    ["+58 414 246 7789", "+584142467789"],
    ["584142467789", "+584142467789"],
    ["+57 300 123 4567", "+573001234567"],
    ["+1 305 555 1234", "+13055551234"],
  ])("normaliza %s", (input, e164) => {
    expect(normalizePhone(input)).toEqual({ ok: true, e164 });
  });

  it.each([
    ["414246778"],
    ["14142467789"],
    ["+580414246778"],
    ["+58414246778"],
    ["+5841424677890"],
    ["+1234567"],
    ["+1234567890123456"],
    ["abc"],
    ["0414-abc-7789"],
    [""],
  ])("rechaza %s", (input) => {
    expect(normalizePhone(input).ok).toBe(false);
  });
});

describe("formatPhone", () => {
  it("muestra los números venezolanos en formato local", () => {
    expect(formatPhone("+584142467789")).toBe("0414-246-7789");
  });
  it("deja intactos los de otros países", () => {
    expect(formatPhone("+13055551234")).toBe("+13055551234");
  });
});

describe("phoneSearchDigits", () => {
  it.each([
    ["0414-123", "414123"],
    ["+58 414", "414"],
    ["584142467789", "4142467789"],
    ["4123", "4123"],
    ["12", null],
    ["ab", null],
  ])("%s", (query, digits) => {
    expect(phoneSearchDigits(query)).toBe(digits);
  });
});
