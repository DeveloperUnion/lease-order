type Props = {
  startDate: string | null;
  endDate: string | null;
  /** 期限超過の品目があるか（赤罫線を描画するか） */
  overdue?: boolean;
};

function parseLocal(iso: string | null): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatShort(iso: string | null): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function formatLong(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${y}/${Number(m)}/${Number(d)}`;
}

export default function LeaseTimeline({ startDate, endDate, overdue = false }: Props) {
  const start = parseLocal(startDate);
  const end = parseLocal(endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const total = start && end ? end.getTime() - start.getTime() : 0;
  const elapsed = start ? today.getTime() - start.getTime() : 0;

  let pct = 0;
  if (total > 0) {
    pct = Math.max(0, Math.min(100, (elapsed / total) * 100));
  } else if (start && today >= start) {
    pct = 100;
  }

  const todayPastEnd = end ? today > end : false;
  const dayDiff = end
    ? Math.round((end.getTime() - today.getTime()) / (24 * 3600 * 1000))
    : null;

  return (
    <div className="border border-border bg-surface rounded-2xl px-5 py-4">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-sm font-semibold text-foreground">
          リース期間
        </p>
        {dayDiff !== null && (
          <p
            className={`text-xs font-semibold ${
              todayPastEnd
                ? "text-danger"
                : dayDiff <= 3
                ? "text-warning"
                : "text-muted"
            }`}
          >
            {todayPastEnd
              ? `期限を ${Math.abs(dayDiff)} 日 超過`
              : `あと ${dayDiff} 日`}
          </p>
        )}
      </div>

      {/* タイムライン帯 */}
      <div className="relative h-9">
        {/* baseline line */}
        <div className="absolute top-1/2 left-0 right-0 h-px bg-border -translate-y-1/2" />
        {/* progress fill */}
        <div
          className="absolute top-1/2 left-0 h-[3px] bg-accent -translate-y-1/2 rounded-full"
          style={{ width: `${pct}%` }}
        />
        {/* overdue red rule across whole bar */}
        {overdue && (
          <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-danger -translate-y-1/2 mix-blend-multiply" />
        )}
        {/* start tick */}
        <Tick position={0} label="開始" sub={formatShort(startDate)} align="start" />
        {/* today tick (only if within range) */}
        {start && end && today >= start && today <= end && (
          <Tick
            position={pct}
            label="今日"
            sub={formatShort(new Date().toISOString().slice(0, 10))}
            highlight
          />
        )}
        {/* end tick */}
        <Tick
          position={100}
          label="返却"
          sub={formatShort(endDate)}
          align="end"
          danger={todayPastEnd}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-subtle">開始日</p>
          <p className="text-sm font-semibold text-foreground mt-0.5 tabular-nums">
            {formatLong(startDate)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-subtle">返却日</p>
          <p
            className={`text-sm font-semibold mt-0.5 tabular-nums ${
              todayPastEnd ? "text-danger" : "text-foreground"
            }`}
          >
            {formatLong(endDate)}
          </p>
        </div>
      </div>
    </div>
  );
}

function Tick({
  position,
  label,
  sub,
  highlight = false,
  danger = false,
  align = "center",
}: {
  position: number;
  label: string;
  sub: string;
  highlight?: boolean;
  danger?: boolean;
  align?: "start" | "center" | "end";
}) {
  const transform =
    align === "start"
      ? "translateX(0)"
      : align === "end"
      ? "translateX(-100%)"
      : "translateX(-50%)";
  const left =
    align === "start" ? "0%" : align === "end" ? "100%" : `${position}%`;

  return (
    <div
      className="absolute top-0 bottom-0 flex flex-col items-center"
      style={{ left, transform }}
    >
      <span
        className={`block w-[8px] h-[8px] rounded-full mt-[14px] ${
          highlight
            ? "bg-accent ring-2 ring-accent/30"
            : danger
            ? "bg-danger"
            : "bg-foreground/70"
        }`}
      />
      <span
        className={`mt-1 text-[10px] whitespace-nowrap ${
          danger ? "text-danger" : highlight ? "text-foreground font-semibold" : "text-subtle"
        }`}
      >
        {label}
      </span>
      <span
        className={`text-[10px] whitespace-nowrap tabular-nums ${
          danger ? "text-danger" : highlight ? "text-foreground" : "text-subtle"
        }`}
      >
        {sub}
      </span>
    </div>
  );
}
