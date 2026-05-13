"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import OrderBadge from "./OrderBadge";
import DayDrawer from "./DayDrawer";
import type { CalendarRange, CalendarView, DayBucket } from "./types";

type Props = {
  view: CalendarView;
  range: CalendarRange;
  todayISO: string;
  /** Serialized map of date -> events. We avoid passing a Map through RSC boundary. */
  days: DayBucket[];
};

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

export default function CalendarBoard({ view, range, todayISO, days }: Props) {
  const [openDate, setOpenDate] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const m = new Map<string, DayBucket>();
    for (const d of days) m.set(d.date, d);
    return m;
  }, [days]);

  const openEvents = openDate ? byDate.get(openDate)?.events ?? [] : [];

  return (
    <>
      {view === "month" ? (
        <>
          <MonthGrid
            days={days}
            anchorISO={range.anchor}
            todayISO={todayISO}
            onDayClick={(d) => setOpenDate(d)}
          />
          <MobileAgenda
            days={days}
            anchorISO={range.anchor}
            todayISO={todayISO}
            onDayClick={(d) => setOpenDate(d)}
          />
        </>
      ) : (
        <WeekGrid
          days={days}
          todayISO={todayISO}
          onDayClick={(d) => setOpenDate(d)}
        />
      )}

      <DayDrawer
        date={openDate}
        events={openEvents}
        onClose={() => setOpenDate(null)}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Month grid (PC: 7 cols × N rows)                                            */
/* -------------------------------------------------------------------------- */

function MonthGrid({
  days,
  anchorISO,
  todayISO,
  onDayClick,
}: {
  days: DayBucket[];
  anchorISO: string;
  todayISO: string;
  onDayClick: (d: string) => void;
}) {
  const anchorMonth = anchorISO.slice(0, 7); // yyyy-MM
  return (
    <div className="hidden md:block">
      <div className="grid grid-cols-7 border-t border-l border-rule rounded-t-[var(--radius-md)] overflow-hidden">
        {WEEKDAY_LABELS.map((w, i) => (
          <div
            key={w}
            className={`px-2 py-1.5 text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] text-subtle bg-surface-muted border-r border-b border-rule ${
              i === 5 ? "text-info" : i === 6 ? "text-danger" : ""
            }`}
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 border-l border-rule">
        {days.map((d) => (
          <MonthCell
            key={d.date}
            day={d}
            anchorMonth={anchorMonth}
            todayISO={todayISO}
            onClick={() => onDayClick(d.date)}
          />
        ))}
      </div>
    </div>
  );
}

function MonthCell({
  day,
  anchorMonth,
  todayISO,
  onClick,
}: {
  day: DayBucket;
  anchorMonth: string;
  todayISO: string;
  onClick: () => void;
}) {
  const inMonth = day.date.startsWith(anchorMonth);
  const isToday = day.date === todayISO;
  const dayNum = parseInt(day.date.slice(8, 10), 10);
  const MAX = 3;
  const visible = day.events.slice(0, MAX);
  const more = day.events.length - visible.length;
  const dow = (new Date(day.date).getDay() + 6) % 7; // 0=Mon..6=Sun

  return (
    <div
      className={`relative min-h-[110px] p-1.5 border-r border-b border-rule flex flex-col gap-1 ${
        inMonth ? "bg-surface" : "bg-surface-muted/50"
      } ${isToday ? "ring-1 ring-inset ring-accent" : ""}`}
    >
      <button
        type="button"
        onClick={onClick}
        className="absolute inset-0 z-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        aria-label={`${day.date} の発注一覧を開く`}
      />
      <div className="relative z-10 flex items-center gap-1 pointer-events-none">
        <span
          className={`text-xs font-semibold tabular-nums ${
            isToday
              ? "inline-flex items-center justify-center h-5 w-5 rounded-full bg-accent text-accent-ink"
              : inMonth
                ? dow === 5
                  ? "text-info"
                  : dow === 6
                    ? "text-danger"
                    : "text-foreground"
                : "text-subtle"
          }`}
        >
          {dayNum}
        </span>
      </div>
      <div className="relative z-10 flex flex-col gap-0.5">
        {visible.map((e, i) => (
          <OrderBadge key={`${e.kind}-${e.order_id}-${i}`} ev={e} />
        ))}
        {more > 0 && (
          <span className="text-[10px] text-muted px-1 font-medium pointer-events-none">
            +{more} 件
          </span>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Week grid (responsive: 7 cols stacked rows of events under each day)        */
/* -------------------------------------------------------------------------- */

function WeekGrid({
  days,
  todayISO,
  onDayClick,
}: {
  days: DayBucket[];
  todayISO: string;
  onDayClick: (d: string) => void;
}) {
  return (
    <>
      {/* Desktop: 7 columns */}
      <div className="hidden md:grid grid-cols-7 border border-rule rounded-[var(--radius-md)] overflow-hidden">
        {days.map((d) => (
          <WeekCell
            key={d.date}
            day={d}
            todayISO={todayISO}
            onClick={() => onDayClick(d.date)}
          />
        ))}
      </div>
      {/* Mobile: vertical agenda */}
      <div className="md:hidden flex flex-col gap-2">
        {days.map((d) => (
          <AgendaRow
            key={d.date}
            day={d}
            todayISO={todayISO}
            onClick={() => onDayClick(d.date)}
          />
        ))}
      </div>
    </>
  );
}

function WeekCell({
  day,
  todayISO,
  onClick,
}: {
  day: DayBucket;
  todayISO: string;
  onClick: () => void;
}) {
  const d = parseISO(day.date);
  const isToday = day.date === todayISO;
  const dow = (d.getDay() + 6) % 7;
  const dowLabel = WEEKDAY_LABELS[dow];

  return (
    <div
      className={`relative min-h-[260px] flex flex-col border-r last:border-r-0 border-rule ${
        isToday ? "bg-accent-soft/40" : "bg-surface"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className="absolute inset-0 z-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        aria-label={`${day.date} の発注一覧を開く`}
      />
      <div className="relative z-10 px-2 py-1.5 border-b border-rule bg-surface-muted/60 pointer-events-none">
        <div className="flex items-baseline gap-1.5">
          <span
            className={`text-[10px] uppercase font-[family-name:var(--font-mono)] tracking-wider ${
              dow === 5
                ? "text-info"
                : dow === 6
                  ? "text-danger"
                  : "text-subtle"
            }`}
          >
            {dowLabel}
          </span>
          <span
            className={`text-base font-semibold tabular-nums ${
              isToday ? "text-accent" : "text-foreground"
            }`}
          >
            {format(d, "d")}
          </span>
        </div>
      </div>
      <div className="relative z-10 p-1.5 flex flex-col gap-1">
        {day.events.length === 0 ? (
          <span className="text-[11px] text-subtle px-1 pointer-events-none">
            —
          </span>
        ) : (
          day.events.map((e, i) => (
            <OrderBadge key={`${e.kind}-${e.order_id}-${i}`} ev={e} />
          ))
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Mobile agenda (month view fallback on small screens)                        */
/* -------------------------------------------------------------------------- */

function MobileAgenda({
  days,
  anchorISO,
  todayISO,
  onDayClick,
}: {
  days: DayBucket[];
  anchorISO: string;
  todayISO: string;
  onDayClick: (d: string) => void;
}) {
  const anchorMonth = anchorISO.slice(0, 7);
  const visible = days.filter(
    (d) => d.date.startsWith(anchorMonth) && d.events.length > 0,
  );

  return (
    <div className="md:hidden flex flex-col gap-2">
      {visible.length === 0 ? (
        <div className="text-center text-sm text-muted py-12 border border-dashed border-rule rounded-[var(--radius-md)]">
          この月には出荷・返却の予定がありません。
        </div>
      ) : (
        visible.map((d) => (
          <AgendaRow
            key={d.date}
            day={d}
            todayISO={todayISO}
            onClick={() => onDayClick(d.date)}
          />
        ))
      )}
    </div>
  );
}

function AgendaRow({
  day,
  todayISO,
  onClick,
}: {
  day: DayBucket;
  todayISO: string;
  onClick: () => void;
}) {
  const d = parseISO(day.date);
  const isToday = day.date === todayISO;
  const dow = (d.getDay() + 6) % 7;

  return (
    <div
      className={`rounded-[var(--radius-md)] border ${
        isToday ? "border-accent" : "border-rule"
      } bg-surface`}
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center gap-3 px-3 py-2 border-b border-rule hover:bg-surface-muted/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        <span
          className={`text-xl font-semibold tabular-nums ${
            isToday ? "text-accent" : "text-foreground"
          }`}
        >
          {format(d, "d")}
        </span>
        <span
          className={`text-[10px] uppercase font-[family-name:var(--font-mono)] tracking-wider ${
            dow === 5
              ? "text-info"
              : dow === 6
                ? "text-danger"
                : "text-subtle"
          }`}
        >
          {format(d, "E", { locale: ja })}
        </span>
        <span className="ml-auto text-[11px] text-muted tabular-nums">
          {day.events.length} 件
        </span>
      </button>
      <ul className="p-2 flex flex-col gap-1">
        {day.events.map((e, i) => (
          <li key={`${e.kind}-${e.order_id}-${i}`}>
            <OrderBadge ev={e} variant="row" />
          </li>
        ))}
      </ul>
    </div>
  );
}
