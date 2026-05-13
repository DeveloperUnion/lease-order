import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { CalendarRange, CalendarView } from "./types";

const WEEK_OPTS = { weekStartsOn: 1 as const }; // Monday

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function safeParseMonth(ym: string | undefined): Date {
  if (ym && /^\d{4}-\d{2}$/.test(ym)) {
    const d = parseISO(`${ym}-01`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return startOfMonth(new Date());
}

function safeParseWeek(wk: string | undefined): Date {
  if (wk && /^\d{4}-\d{2}-\d{2}$/.test(wk)) {
    const d = parseISO(wk);
    if (!Number.isNaN(d.getTime())) return startOfWeek(d, WEEK_OPTS);
  }
  return startOfWeek(new Date(), WEEK_OPTS);
}

export function computeRange(
  view: CalendarView,
  ym: string | undefined,
  wk: string | undefined,
): CalendarRange {
  if (view === "week") {
    const start = safeParseWeek(wk);
    const end = endOfWeek(start, WEEK_OPTS);
    return {
      from: format(start, "yyyy-MM-dd"),
      to: format(end, "yyyy-MM-dd"),
      anchor: format(start, "yyyy-MM-dd"),
    };
  }
  const monthAnchor = safeParseMonth(ym);
  const gridFrom = startOfWeek(startOfMonth(monthAnchor), WEEK_OPTS);
  const gridTo = endOfWeek(endOfMonth(monthAnchor), WEEK_OPTS);
  return {
    from: format(gridFrom, "yyyy-MM-dd"),
    to: format(gridTo, "yyyy-MM-dd"),
    anchor: format(monthAnchor, "yyyy-MM-dd"),
  };
}

export function shiftMonth(anchorISO: string, delta: number): string {
  return format(addMonths(parseISO(anchorISO), delta), "yyyy-MM");
}

export function shiftWeek(anchorISO: string, deltaDays: number): string {
  const d = parseISO(anchorISO);
  d.setDate(d.getDate() + deltaDays);
  return format(d, "yyyy-MM-dd");
}
