import { addDays, compareIsoDates, daysBetween, lastDayOfMonth } from "./dates";

export interface CalendarCongress {
  ref: number;
  name: string;
  startDate: string;
  endDate: string;
}

/** Fondos suaves de 8 colores que mantienen un contraste de al menos 4.5:1 con texto oscuro (slate-900). */
export const CONGRESS_COLORS = [
  { background: "#bfdbfe", border: "#2563eb" },
  { background: "#bbf7d0", border: "#16a34a" },
  { background: "#fde68a", border: "#d97706" },
  { background: "#fbcfe8", border: "#db2777" },
  { background: "#ddd6fe", border: "#7c3aed" },
  { background: "#fed7aa", border: "#ea580c" },
  { background: "#a5f3fc", border: "#0891b2" },
  { background: "#e9d5ff", border: "#9333ea" },
] as const;

export const congressColor = (ref: number) => CONGRESS_COLORS[Math.abs(ref) % CONGRESS_COLORS.length];

export interface CalendarDay {
  date: string;
  inMonth: boolean;
  isToday: boolean;
  /** Congresos que tocan el día (todos los carriles). */
  congresses: CalendarCongress[];
  /** Congresos que no caben en los carriles visibles. */
  hiddenCount: number;
}

export interface CalendarSegment {
  ref: number;
  name: string;
  startDate: string;
  endDate: string;
  startColumn: number;
  span: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  color: (typeof CONGRESS_COLORS)[number];
}

export interface CalendarWeek {
  days: CalendarDay[];
  segments: CalendarSegment[];
}

export interface MonthView {
  month: string;
  weeks: CalendarWeek[];
  /** No hay congresos que toquen el mes. */
  isEmpty: boolean;
}

const weekday = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

/** Mes en cuadrícula de domingo a sábado, con los tramos de cada congreso por semana. */
export function buildMonthView(input: {
  month: string;
  today: string;
  congresses: CalendarCongress[];
  maxLanes?: number;
}): MonthView {
  const { month, today, congresses } = input;
  const maxLanes = input.maxLanes ?? 3;
  const [year, monthNumber] = month.split("-").map(Number);
  const first = `${month}-01`;
  const last = `${month}-${String(lastDayOfMonth(year, monthNumber)).padStart(2, "0")}`;
  const gridStart = addDays(first, -weekday(first));
  const gridEnd = addDays(last, 6 - weekday(last));

  const inGrid = congresses.filter((item) => item.startDate <= gridEnd && item.endDate >= gridStart);

  // Carriles voraces: por inicio y luego por duración descendente; el mismo carril en todas las semanas.
  const ordered = [...inGrid].sort(
    (left, right) =>
      compareIsoDates(left.startDate, right.startDate) ||
      daysBetween(right.startDate, right.endDate) - daysBetween(left.startDate, left.endDate) ||
      left.name.localeCompare(right.name, "es") ||
      left.ref - right.ref,
  );
  const laneEnds: string[] = [];
  const laneOf = new Map<number, number>();
  for (const item of ordered) {
    let lane = laneEnds.findIndex((end) => end < item.startDate);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = item.endDate;
    laneOf.set(item.ref, lane);
  }

  const weeks: CalendarWeek[] = [];
  for (let weekStart = gridStart; weekStart <= gridEnd; weekStart = addDays(weekStart, 7)) {
    const weekEnd = addDays(weekStart, 6);
    const days: CalendarDay[] = Array.from({ length: 7 }, (_, column) => {
      const date = addDays(weekStart, column);
      const touching = ordered.filter((item) => item.startDate <= date && item.endDate >= date);
      return {
        date,
        inMonth: date >= first && date <= last,
        isToday: date === today,
        congresses: touching,
        hiddenCount: touching.filter((item) => (laneOf.get(item.ref) ?? 0) >= maxLanes).length,
      };
    });
    const segments: CalendarSegment[] = [];
    for (const item of ordered) {
      const lane = laneOf.get(item.ref) ?? 0;
      if (lane >= maxLanes || item.startDate > weekEnd || item.endDate < weekStart) continue;
      const from = item.startDate < weekStart ? weekStart : item.startDate;
      const to = item.endDate > weekEnd ? weekEnd : item.endDate;
      segments.push({
        ref: item.ref,
        name: item.name,
        startDate: item.startDate,
        endDate: item.endDate,
        startColumn: daysBetween(weekStart, from),
        span: daysBetween(from, to) + 1,
        lane,
        continuesBefore: item.startDate < weekStart,
        continuesAfter: item.endDate > weekEnd,
        color: congressColor(item.ref),
      });
    }
    weeks.push({ days, segments });
  }

  return {
    month,
    weeks,
    isEmpty: !congresses.some((item) => item.startDate <= last && item.endDate >= first),
  };
}
