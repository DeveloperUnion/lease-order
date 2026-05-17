import type { OrderStatus } from "@/lib/order-status";

type Props = {
  startDate: string | null;
  endDate: string | null;
  status: OrderStatus;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDate(s: string): Date {
  const d = new Date(s);
  d.setHours(0, 0, 0, 0);
  return d;
}

function diffDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

export default function LeasePeriodBar({ startDate, endDate, status }: Props) {
  if (!startDate || !endDate) {
    return (
      <div className="px-4 py-5 bg-surface border border-rule rounded-[var(--radius-lg)]">
        <p className="text-xs uppercase tracking-wider text-muted font-medium mb-2">
          リース期間
        </p>
        <p className="text-base text-foreground tabular-nums font-[family-name:var(--font-mono)]">
          {startDate ? `${fmtDate(toDate(startDate))} ～` : ""}
          {endDate ? ` ～ ${fmtDate(toDate(endDate))}` : ""}
          {!startDate && !endDate && "—"}
        </p>
      </div>
    );
  }

  const start = toDate(startDate);
  const end = toDate(endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalDays = Math.max(1, diffDays(start, end));
  const elapsedDays = diffDays(start, today);

  const isFinished = status === "completed" || status === "cancelled";

  let phase: "before" | "during" | "after";
  let progress: number;
  let caption: string;

  if (isFinished) {
    phase = "after";
    progress = 100;
    caption = status === "cancelled" ? "キャンセル済" : "終了";
  } else if (today < start) {
    phase = "before";
    progress = 0;
    const daysToStart = diffDays(today, start);
    caption = `${totalDays}日間 / 開始まで ${daysToStart}日`;
  } else if (today > end) {
    phase = "after";
    progress = 100;
    const daysSinceEnd = diffDays(end, today);
    caption = `終了から ${daysSinceEnd}日経過`;
  } else {
    phase = "during";
    const pct = Math.round((elapsedDays / totalDays) * 100);
    progress = Math.min(100, Math.max(0, pct));
    const remaining = Math.max(0, diffDays(today, end));
    caption = `${totalDays}日間 / ${progress}% 経過 / 残り ${remaining}日`;
  }

  const fillColor =
    phase === "after" && isFinished
      ? "bg-[var(--color-subtle)]"
      : "bg-accent";

  return (
    <div
      className="px-5 py-5 bg-surface border border-rule rounded-[var(--radius-lg)]"
      aria-label={`リース期間 開始 ${fmtDate(start)} 終了 ${fmtDate(end)} 進捗 ${progress}%`}
    >
      <p className="text-xs uppercase tracking-wider text-muted font-medium mb-3">
        リース期間
      </p>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <span className="text-xl sm:text-2xl font-semibold tabular-nums font-[family-name:var(--font-mono)] text-foreground">
          {fmtDate(start)}
        </span>
        <span aria-hidden className="text-subtle text-sm">
          →
        </span>
        <span className="text-xl sm:text-2xl font-semibold tabular-nums font-[family-name:var(--font-mono)] text-foreground">
          {fmtDate(end)}
        </span>
      </div>
      <div
        className="relative h-3 bg-surface-muted rounded-full overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div
          className={`absolute inset-y-0 left-0 ${fillColor} transition-[width] duration-300`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-muted text-center tabular-nums">
        {caption}
      </p>
    </div>
  );
}
