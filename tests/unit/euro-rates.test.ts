import { describe, expect, it } from "vitest";
import { parseSourceItems, pickApplicableRate, roundHalfUp2, shouldSync } from "../../src/server/financing/euro-rates";

describe("roundHalfUp2", () => {
  it.each([
    ["991.16445734", "991.16"],
    ["985.729808", "985.73"],
    ["18.735", "18.74"],
    ["5", "5.00"],
    ["0.004", "0.00"],
    ["99.995", "100.00"],
  ])("%s → %s", (input, expected) => {
    expect(roundHalfUp2(input)).toBe(expected);
  });
});

describe("parseSourceItems", () => {
  const ok = { fuente: "oficial", compra: null, venta: null, promedio: 991.16445734, fecha: "2026-10-19", moneda: "EUR" };
  it("conserva los elementos válidos", () => {
    expect(parseSourceItems([ok])).toEqual([{ rateDate: "2026-10-19", value: "991.16", sourceValue: "991.16445734" }]);
  });
  it("descarta uno a uno los elementos inválidos", () => {
    const items = parseSourceItems([
      ok,
      { ...ok, fecha: "19/10/2026" },
      { ...ok, fecha: "2026-02-31" },
      { ...ok, promedio: 0 },
      { ...ok, promedio: -3 },
      { ...ok, promedio: Number.NaN },
      { ...ok, promedio: 1e12 },
      { ...ok, promedio: "12" },
      { ...ok, moneda: "USD" },
      { ...ok, fuente: "paralelo" },
      null,
      "x",
    ]);
    expect(items).toHaveLength(1);
  });
  it("devuelve vacío si no es un arreglo", () => {
    expect(parseSourceItems({ error: true })).toEqual([]);
  });
});

describe("pickApplicableRate", () => {
  const rates = [
    { rateDate: "2026-10-09", value: "980.00" },
    { rateDate: "2026-10-13", value: "982.00" },
    { rateDate: "2026-10-16", value: "985.73" },
    { rateDate: "2026-10-19", value: "991.16" },
  ];
  it("un día hábil usa su propia tasa", () => {
    expect(pickApplicableRate(rates, "2026-10-16")?.value).toBe("985.73");
  });
  it("sábado y domingo usan la del viernes", () => {
    expect(pickApplicableRate(rates, "2026-10-17")?.rateDate).toBe("2026-10-16");
    expect(pickApplicableRate(rates, "2026-10-18")?.rateDate).toBe("2026-10-16");
  });
  it("un feriado usa la del día hábil anterior", () => {
    expect(pickApplicableRate(rates, "2026-10-12")?.rateDate).toBe("2026-10-09");
  });
  it("antes de la primera tasa no hay tasa", () => {
    expect(pickApplicableRate(rates, "2026-10-01")).toBeNull();
  });
});

describe("shouldSync", () => {
  const now = Date.parse("2026-10-18T16:00:00Z");
  it("solo si la última tasa es anterior a hoy y pasaron más de 30 minutos", () => {
    expect(shouldSync({ latestRateDate: "2026-10-16", today: "2026-10-18", lastAttemptAt: null, now })).toBe(true);
    expect(shouldSync({ latestRateDate: null, today: "2026-10-18", lastAttemptAt: null, now })).toBe(true);
    expect(shouldSync({ latestRateDate: "2026-10-18", today: "2026-10-18", lastAttemptAt: null, now })).toBe(false);
    expect(shouldSync({ latestRateDate: "2026-10-19", today: "2026-10-18", lastAttemptAt: null, now })).toBe(false);
    expect(shouldSync({ latestRateDate: "2026-10-16", today: "2026-10-18", lastAttemptAt: now - 29 * 60_000, now })).toBe(false);
    expect(shouldSync({ latestRateDate: "2026-10-16", today: "2026-10-18", lastAttemptAt: now - 30 * 60_000, now })).toBe(false);
    expect(shouldSync({ latestRateDate: "2026-10-16", today: "2026-10-18", lastAttemptAt: now - 30 * 60_000 - 1, now })).toBe(true);
  });
});
