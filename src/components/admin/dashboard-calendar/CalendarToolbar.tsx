"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { CalendarView } from "./types";

type Props = {
  view: CalendarView;
  /** Title to show (e.g. "2026年5月" or "5/11 – 5/17") */
  title: string;
  /** Pre-computed query strings to navigate (server gives us these) */
  hrefs: {
    prev: string;
    next: string;
    today: string;
    monthView: string;
    weekView: string;
  };
};

export default function CalendarToolbar({ view, title, hrefs }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const go = (href: string) => {
    startTransition(() => router.push(href));
  };

  const tabBase =
    "h-8 px-3 text-xs font-medium rounded-[var(--radius-sm)] transition-colors";
  const tabActive = "bg-foreground text-[var(--color-primary-foreground)]";
  const tabIdle = "text-muted hover:bg-surface-muted";

  const navBtn =
    "h-8 w-8 inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-rule text-muted hover:bg-surface-muted hover:text-foreground transition-colors";

  return (
    <div
      className={`flex items-center gap-2 flex-wrap ${isPending ? "opacity-70" : ""}`}
      aria-busy={isPending}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => go(hrefs.prev)}
          aria-label={view === "month" ? "前の月" : "前の週"}
          className={navBtn}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => go(hrefs.next)}
          aria-label={view === "month" ? "次の月" : "次の週"}
          className={navBtn}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => go(hrefs.today)}
          className="h-8 px-3 text-xs font-medium rounded-[var(--radius-sm)] border border-rule text-foreground hover:bg-surface-muted transition-colors"
        >
          今日
        </button>
      </div>

      <h2 className="text-base sm:text-lg font-semibold tabular-nums">
        {title}
      </h2>

      <div className="ml-auto flex items-center gap-1 p-0.5 rounded-[var(--radius-md)] bg-surface-muted">
        <button
          type="button"
          onClick={() => go(hrefs.monthView)}
          className={`${tabBase} ${view === "month" ? tabActive : tabIdle}`}
          aria-pressed={view === "month"}
        >
          月
        </button>
        <button
          type="button"
          onClick={() => go(hrefs.weekView)}
          className={`${tabBase} ${view === "week" ? tabActive : tabIdle}`}
          aria-pressed={view === "week"}
        >
          週
        </button>
      </div>
    </div>
  );
}
