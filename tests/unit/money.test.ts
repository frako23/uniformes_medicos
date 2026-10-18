import { describe, expect, it } from "vitest";
import { formatBolivares, formatEuroRate, formatMoney, usdToVes } from "../../src/utils/money";

describe("formatMoney", () => {
  it("puts $ first, dots for thousands, comma for decimals and 2 decimals", () => {
    expect(formatMoney(0)).toBe("$0,00");
    expect(formatMoney(5)).toBe("$5,00");
    expect(formatMoney(12.5)).toBe("$12,50");
    expect(formatMoney(1234.5)).toBe("$1.234,50");
    expect(formatMoney(1234567.891)).toBe("$1.234.567,89");
  });

  it("accepts numeric strings and tolerates missing values", () => {
    expect(formatMoney("1500.00")).toBe("$1.500,00");
    expect(formatMoney(null)).toBe("$0,00");
    expect(formatMoney(undefined)).toBe("$0,00");
    expect(formatMoney("abc")).toBe("$0,00");
  });

  it("keeps the sign in front of negative amounts", () => {
    expect(formatMoney(-1234.5)).toBe("-$1.234,50");
    expect(formatMoney(-0.001)).toBe("$0,00");
  });
});

describe("formatBolivares y formatEuroRate", () => {
  it("usa el prefijo Bs y el mismo formato numérico", () => {
    expect(formatBolivares(1234.5)).toBe("Bs 1.234,50");
    expect(formatBolivares(0)).toBe("Bs 0,00");
    expect(formatBolivares("24779.00")).toBe("Bs 24.779,00");
    expect(formatEuroRate("985.73")).toBe("Bs 985,73 por €");
  });
});

describe("usdToVes", () => {
  it("multiplica con centavos enteros", () => {
    expect(usdToVes("20.00", "50.00")).toBe("1000.00");
    expect(usdToVes("25.00", "991.16")).toBe("24779.00");
  });
  it("redondea half-up", () => {
    // 0,01 × 0,50 = 0,005 → 0,01
    expect(usdToVes("0.01", "0.50")).toBe("0.01");
    // 33,33 × 991,16 = 33035,3628 → 33035,36
    expect(usdToVes("33.33", "991.16")).toBe("33035.36");
    // 10,01 × 0,45 = 4,5045 → 4,50
    expect(usdToVes("10.01", "0.45")).toBe("4.50");
    expect(usdToVes("0.01", "0.49")).toBe("0.00");
  });
  it("soporta montos máximos sin perder precisión", () => {
    expect(usdToVes("9999999999.99", "99999999999.99")).toBe("999999999998900000000.00");
  });
});
