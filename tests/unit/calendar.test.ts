import { describe, expect, it } from "vitest";
import { buildMonthView, CONGRESS_COLORS, congressColor } from "../../src/utils/calendar";

const congress = (ref: number, startDate: string, endDate: string, name = `Congreso ${ref}`) => ({ ref, name, startDate, endDate });
const view = (month: string, congresses: ReturnType<typeof congress>[], extra: { today?: string; maxLanes?: number } = {}) =>
  buildMonthView({ month, today: extra.today ?? "2026-10-18", congresses, maxLanes: extra.maxLanes ?? 3 });

/** Fechas en las que aparece cada congreso, según los tramos de las semanas. */
function paintedDays(result: ReturnType<typeof view>, ref: number) {
  const days: string[] = [];
  for (const week of result.weeks) {
    for (const segment of week.segments.filter((item) => item.ref === ref)) {
      for (let offset = 0; offset < segment.span; offset += 1) days.push(week.days[segment.startColumn + offset].date);
    }
  }
  return days;
}

describe("semanas", () => {
  it("van de domingo a sábado, con los días vecinos y hoy marcados", () => {
    const result = view("2026-10", []);
    expect(result.weeks).toHaveLength(5);
    for (const week of result.weeks) expect(week.days).toHaveLength(7);
    expect(result.weeks[0].days[0]).toMatchObject({ date: "2026-09-27", inMonth: false });
    expect(result.weeks[0].days[4]).toMatchObject({ date: "2026-10-01", inMonth: true });
    expect(result.weeks[4].days[6]).toMatchObject({ date: "2026-10-31", inMonth: true });
    const today = result.weeks.flatMap((week) => week.days).filter((day) => day.isToday);
    expect(today.map((day) => day.date)).toEqual(["2026-10-18"]);
  });

  it("noviembre de 2026 empieza en domingo", () => {
    const result = view("2026-11", []);
    expect(result.weeks[0].days[0]).toMatchObject({ date: "2026-11-01", inMonth: true });
    expect(result.weeks.at(-1)!.days.at(-1)!.date).toBe("2026-12-05");
  });

  it("un mes sin congresos es isEmpty", () => {
    expect(view("2026-10", []).isEmpty).toBe(true);
    expect(view("2026-10", [congress(1, "2026-11-10", "2026-11-12")]).isEmpty).toBe(true);
    expect(view("2026-10", [congress(1, "2026-10-10", "2026-10-12")]).isEmpty).toBe(false);
  });
});

describe("congresos", () => {
  const long = congress(1, "2026-10-30", "2026-11-01");

  it("uno del 30/10 al 01/11 aparece en octubre y en noviembre exactamente en sus días", () => {
    const october = view("2026-10", [long]);
    expect(paintedDays(october, 1)).toEqual(["2026-10-30", "2026-10-31"]);
    const novemberView = view("2026-11", [long]);
    expect(paintedDays(novemberView, 1)).toEqual(["2026-11-01"]);
    const lastWeekOct = october.weeks.at(-1)!;
    expect(lastWeekOct.segments[0]).toMatchObject({ continuesBefore: false, continuesAfter: true, startColumn: 5, span: 2 });
    const firstWeekNov = novemberView.weeks[0];
    expect(firstWeekNov.segments[0]).toMatchObject({ continuesBefore: true, continuesAfter: false, startColumn: 0, span: 1 });
  });

  it("uno de un solo día", () => {
    const result = view("2026-10", [congress(2, "2026-10-31", "2026-10-31")]);
    expect(paintedDays(result, 2)).toEqual(["2026-10-31"]);
    expect(result.weeks.at(-1)!.segments[0]).toMatchObject({ span: 1, continuesBefore: false, continuesAfter: false });
  });

  it("uno que cruza semanas se divide en tramos", () => {
    const result = view("2026-10", [congress(3, "2026-10-08", "2026-10-14")]);
    const segments = result.weeks.flatMap((week) => week.segments);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ startColumn: 4, span: 3, continuesAfter: true });
    expect(segments[1]).toMatchObject({ startColumn: 0, span: 4, continuesBefore: true });
    expect(paintedDays(result, 3)).toHaveLength(7);
  });
});

describe("superposiciones y color", () => {
  const three = [congress(1, "2026-10-12", "2026-10-14"), congress(2, "2026-10-12", "2026-10-13"), congress(3, "2026-10-13", "2026-10-13")];

  it("tres congresos superpuestos ocupan carriles distintos", () => {
    const result = view("2026-10", three);
    const lanes = result.weeks.flatMap((week) => week.segments).map((segment) => [segment.ref, segment.lane]);
    expect(lanes).toEqual(expect.arrayContaining([[1, 0], [2, 1], [3, 2]]));
  });

  it("con maxLanes = 2 el día indica +1 más y no pinta el tercer carril", () => {
    const result = view("2026-10", three, { maxLanes: 2 });
    const days = result.weeks.flatMap((week) => week.days);
    expect(days.find((day) => day.date === "2026-10-13")).toMatchObject({ hiddenCount: 1 });
    expect(days.find((day) => day.date === "2026-10-12")).toMatchObject({ hiddenCount: 0 });
    expect(result.weeks.flatMap((week) => week.segments).some((segment) => segment.ref === 3)).toBe(false);
    expect(days.find((day) => day.date === "2026-10-13")!.congresses.map((item) => item.ref).sort()).toEqual([1, 2, 3]);
  });

  it("el color es estable por ref con una paleta de 8", () => {
    expect(CONGRESS_COLORS).toHaveLength(8);
    expect(congressColor(5)).toBe(congressColor(13));
    expect(congressColor(5)).not.toBe(congressColor(6));
    const result = view("2026-10", [congress(5, "2026-10-08", "2026-10-14")]);
    const segments = result.weeks.flatMap((week) => week.segments);
    expect(new Set(segments.map((segment) => segment.color)).size).toBe(1);
  });
});
