import { describe, expect, it } from "vitest";
import {
  addDays,
  compareIsoDates,
  daysBetween,
  formatDate,
  formatLongDate,
  formatLongDateRange,
  formatMonthYear,
  isValidIsoDate,
  lastDayOfMonth,
  monthRange,
  todayInCaracas,
} from "../../src/utils/dates";

describe("todayInCaracas", () => {
  it("usa la hora de Venezuela", () => {
    expect(todayInCaracas(new Date("2026-10-19T03:59:59Z"))).toBe("2026-10-18");
    expect(todayInCaracas(new Date("2026-10-19T04:00:00Z"))).toBe("2026-10-19");
  });
});

describe("aritmética", () => {
  it("valida fechas", () => {
    expect(isValidIsoDate("2026-02-31")).toBe(false);
    expect(isValidIsoDate("2026-02-28")).toBe(true);
    expect(isValidIsoDate("2026-2-3")).toBe(false);
  });
  it("suma días cruzando meses y años", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("calcula el último día del mes", () => {
    expect(lastDayOfMonth(2028, 2)).toBe(29);
    expect(lastDayOfMonth(2026, 2)).toBe(28);
  });
  it("cuenta días completos y compara", () => {
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
    expect(daysBetween("2026-10-31", "2026-10-01")).toBe(-30);
    expect(compareIsoDates("2026-10-01", "2026-10-02")).toBeLessThan(0);
  });
});

describe("formatos", () => {
  it("formatea fechas", () => {
    expect(formatDate("2026-10-30")).toBe("30/10/2026");
    expect(formatMonthYear("2026-10")).toBe("octubre de 2026");
    expect(formatLongDate("2026-10-12")).toBe("12 de octubre de 2026");
    expect(formatLongDateRange("2026-10-30", "2026-11-01")).toBe("del 30 de octubre al 1 de noviembre de 2026");
  });
  it("formatea rangos dentro de un mes y de un día", () => {
    expect(formatLongDateRange("2026-10-12", "2026-10-14")).toBe("del 12 al 14 de octubre de 2026");
    expect(formatLongDateRange("2026-10-12", "2026-10-12")).toBe("12 de octubre de 2026");
  });
  it("da el rango de un mes", () => {
    expect(monthRange("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });
});
