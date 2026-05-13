import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import type { CalendarOrderRow } from "@/lib/admin-data";
import { buildDayBuckets } from "./build-events";
import { shiftMonth, shiftWeek, todayISO } from "./range";
import CalendarToolbar from "./CalendarToolbar";
import CalendarBoard from "./CalendarBoard";
import type { CalendarRange, CalendarView } from "./types";

type Props = {
  view: CalendarView;
  range: CalendarRange;
  orders: CalendarOrderRow[];
};

function buildHrefs(view: CalendarView, range: CalendarRange) {
  if (view === "month") {
    const ym = range.anchor.slice(0, 7);
    return {
      prev: `/admin?view=month&ym=${shiftMonth(range.anchor, -1)}`,
      next: `/admin?view=month&ym=${shiftMonth(range.anchor, 1)}`,
      today: `/admin?view=month`,
      monthView: `/admin?view=month&ym=${ym}`,
      weekView: `/admin?view=week&wk=${range.anchor}`,
    };
  }
  // week
  return {
    prev: `/admin?view=week&wk=${shiftWeek(range.anchor, -7)}`,
    next: `/admin?view=week&wk=${shiftWeek(range.anchor, 7)}`,
    today: `/admin?view=week`,
    monthView: `/admin?view=month&ym=${range.anchor.slice(0, 7)}`,
    weekView: `/admin?view=week&wk=${range.anchor}`,
  };
}

function buildTitle(view: CalendarView, range: CalendarRange): string {
  if (view === "month") {
    return format(parseISO(range.anchor), "yyyy年 M月", { locale: ja });
  }
  const start = parseISO(range.from);
  const end = parseISO(range.to);
  const sameYear = format(start, "yyyy") === format(end, "yyyy");
  const startLabel = format(start, sameYear ? "M/d" : "yyyy/M/d");
  const endLabel = format(end, "M/d");
  return `${format(start, "yyyy年")} ${startLabel} – ${endLabel}`;
}

export default function DashboardCalendar({ view, range, orders }: Props) {
  const today = todayISO();
  const bucketMap = buildDayBuckets(orders, range, today);
  const days = Array.from(bucketMap.values());

  return (
    <div className="space-y-4">
      <CalendarToolbar
        view={view}
        title={buildTitle(view, range)}
        hrefs={buildHrefs(view, range)}
      />
      <CalendarBoard
        view={view}
        range={range}
        todayISO={today}
        days={days}
      />
      <Legend />
    </div>
  );
}

function Legend() {
  const item = "inline-flex items-center gap-1.5 text-[11px] text-muted";
  const dot = "inline-block w-2.5 h-2.5 rounded-sm";
  return (
    <div className="flex items-center gap-4 flex-wrap pt-1">
      <span className={item}>
        <span className={`${dot} bg-info`} /> 出荷
      </span>
      <span className={item}>
        <span className={`${dot} bg-warning`} /> 返却
      </span>
      <span className={item}>
        <span className={`${dot} bg-danger`} /> 遅延 (出荷未済)
      </span>
    </div>
  );
}
