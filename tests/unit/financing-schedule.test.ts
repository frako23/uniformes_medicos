import { describe, expect, it } from "vitest";
import {
  defaultFirstDueDate,
  generateSchedule,
  nextDueDate,
  validateSchedule,
} from "../../src/utils/financing-schedule";

describe("defaultFirstDueDate", () => {
  it("quincenal: el siguiente 15 o último día, estrictamente después de la compra", () => {
    expect(defaultFirstDueDate("2026-10-18", "quincenal")).toBe("2026-10-31");
    expect(defaultFirstDueDate("2026-10-15", "quincenal")).toBe("2026-10-31");
    expect(defaultFirstDueDate("2026-10-31", "quincenal")).toBe("2026-11-15");
    expect(defaultFirstDueDate("2026-10-01", "quincenal")).toBe("2026-10-15");
    expect(defaultFirstDueDate("2026-12-20", "quincenal")).toBe("2026-12-31");
  });
  it("mensual: el mismo día del mes siguiente o el último", () => {
    expect(defaultFirstDueDate("2026-10-18", "mensual")).toBe("2026-11-18");
    expect(defaultFirstDueDate("2026-01-31", "mensual")).toBe("2026-02-28");
    expect(defaultFirstDueDate("2027-12-10", "mensual")).toBe("2028-01-10");
  });
  it("semanal: la compra más 7 días", () => {
    expect(defaultFirstDueDate("2026-10-28", "semanal")).toBe("2026-11-04");
  });
});

describe("nextDueDate", () => {
  it("quincenal", () => {
    expect(nextDueDate("2026-10-20", "quincenal", 20)).toBe("2026-10-31");
    expect(nextDueDate("2026-10-31", "quincenal", 31)).toBe("2026-11-15");
    expect(nextDueDate("2026-11-15", "quincenal", 15)).toBe("2026-11-30");
    expect(nextDueDate("2026-12-31", "quincenal", 31)).toBe("2027-01-15");
  });
  it("mensual con día ancla 31", () => {
    expect(nextDueDate("2026-01-31", "mensual", 31)).toBe("2026-02-28");
    expect(nextDueDate("2028-01-31", "mensual", 31)).toBe("2028-02-29");
    expect(nextDueDate("2026-02-28", "mensual", 31)).toBe("2026-03-31");
    expect(nextDueDate("2026-12-15", "mensual", 15)).toBe("2027-01-15");
  });
  it("semanal suma 7 días", () => {
    expect(nextDueDate("2026-10-30", "semanal", 30)).toBe("2026-11-06");
  });
});

describe("generateSchedule", () => {
  const base = { purchaseDate: "2026-10-18", initialCents: 0, frequency: "quincenal" as const, firstDueDate: "2026-10-31" };

  it("reproduce el ejemplo del modelo de datos", () => {
    const schedule = generateSchedule({ ...base, totalCents: 10_000, count: 4 });
    expect(schedule).toEqual([
      { isInitial: false, dueDate: "2026-10-31", amountCents: 2500 },
      { isInitial: false, dueDate: "2026-11-15", amountCents: 2500 },
      { isInitial: false, dueDate: "2026-11-30", amountCents: 2500 },
      { isInitial: false, dueDate: "2026-12-15", amountCents: 2500 },
    ]);
  });

  it("$100,00 en 3 cuotas da 33,33, 33,33 y 33,34", () => {
    const schedule = generateSchedule({ ...base, totalCents: 10_000, count: 3 });
    expect(schedule.map((item) => item.amountCents)).toEqual([3333, 3333, 3334]);
  });

  it("la inicial vence en la fecha de compra y el resto se reparte", () => {
    const schedule = generateSchedule({ ...base, purchaseDate: "2026-09-01", firstDueDate: "2026-09-15", totalCents: 12_000, initialCents: 2000, count: 4 });
    expect(schedule[0]).toEqual({ isInitial: true, dueDate: "2026-09-01", amountCents: 2000 });
    expect(schedule.slice(1).map((item) => [item.dueDate, item.amountCents])).toEqual([
      ["2026-09-15", 2500],
      ["2026-09-30", 2500],
      ["2026-10-15", 2500],
      ["2026-10-31", 2500],
    ]);
    expect(schedule.reduce((sum, item) => sum + item.amountCents, 0)).toBe(12_000);
  });

  it("admite de 1 a 48 cuotas", () => {
    expect(generateSchedule({ ...base, totalCents: 10_000, count: 1 })).toHaveLength(1);
    const many = generateSchedule({ ...base, totalCents: 48_000, count: 48 });
    expect(many).toHaveLength(48);
    expect(many.every((item) => item.amountCents === 1000)).toBe(true);
  });

  it("el día ancla mensual conserva el día de la compra aunque la primera cuota se haya ajustado", () => {
    const schedule = generateSchedule({
      purchaseDate: "2026-01-31",
      totalCents: 9000,
      initialCents: 0,
      count: 3,
      frequency: "mensual",
      firstDueDate: "2026-02-28",
    });
    expect(schedule.map((item) => item.dueDate)).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
  });
});

describe("validateSchedule", () => {
  const ok = [{ isInitial: false, dueDate: "2026-10-31", amountCents: 2500 }];

  it("acepta un calendario válido", () => {
    expect(validateSchedule({ purchaseDate: "2026-10-18", today: "2026-10-18", installments: ok })).toEqual([]);
  });
  it("marca la cuota que vence antes de la compra", () => {
    const errors = validateSchedule({
      purchaseDate: "2026-10-18",
      today: "2026-10-18",
      installments: [ok[0], { isInitial: false, dueDate: "2026-10-01", amountCents: 100 }],
    });
    expect(errors).toEqual([{ index: 1, field: "dueDate", message: "La cuota no puede vencer antes de la fecha de compra." }]);
  });
  it("marca un monto menor o igual a 0", () => {
    const errors = validateSchedule({
      purchaseDate: "2026-10-18",
      today: "2026-10-18",
      installments: [{ isInitial: false, dueDate: "2026-10-31", amountCents: 0 }],
    });
    expect(errors).toEqual([{ index: 0, field: "amount", message: "El monto debe ser mayor que 0." }]);
  });
  it("marca una compra futura", () => {
    const errors = validateSchedule({ purchaseDate: "2026-10-19", today: "2026-10-18", installments: ok });
    expect(errors).toEqual([{ index: -1, field: "purchaseDate", message: "La fecha de compra no puede ser posterior a hoy." }]);
  });
});
