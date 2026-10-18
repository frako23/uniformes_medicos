import { describe, expect, it } from "vitest";
import { formatMoney } from "../../src/utils/money";

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
