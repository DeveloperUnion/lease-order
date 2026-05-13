"use client";

import { useEffect } from "react";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import OrderBadge from "./OrderBadge";
import type { CalendarEvent } from "./types";

type Props = {
  date: string | null;
  events: CalendarEvent[];
  onClose: () => void;
};

export default function DayDrawer({ date, events, onClose }: Props) {
  useEffect(() => {
    if (!date) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [date, onClose]);

  if (!date) return null;

  const d = parseISO(date);
  const heading = format(d, "M月d日 (E)", { locale: ja });
  const shipments = events.filter((e) => e.kind === "shipment");
  const returns = events.filter((e) => e.kind === "return");

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label={`${heading} の発注一覧`}
    >
      <div
        className="absolute inset-0 bg-foreground/30"
        onClick={onClose}
        aria-hidden
      />
      <aside className="ml-auto relative h-full w-full sm:w-[420px] bg-surface shadow-xl flex flex-col">
        <header className="flex items-center gap-3 px-5 h-14 border-b border-rule">
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-[0.18em] text-subtle font-[family-name:var(--font-mono)]">
              {format(d, "yyyy-MM-dd")}
            </p>
            <h3 className="text-base font-semibold">{heading}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="h-9 w-9 inline-flex items-center justify-center rounded-[var(--radius-sm)] text-muted hover:bg-surface-muted hover:text-foreground transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          <Section title="出荷" count={shipments.length}>
            {shipments.length === 0 ? (
              <Empty>この日の出荷予定はありません。</Empty>
            ) : (
              <ul className="space-y-2">
                {shipments.map((e) => (
                  <li key={`s-${e.order_id}`}>
                    <OrderBadge ev={e} variant="row" />
                    <p className="mt-1 text-[11px] text-muted truncate pl-1">
                      {e.site_name ?? "現場名未設定"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="返却" count={returns.length}>
            {returns.length === 0 ? (
              <Empty>この日の返却予定はありません。</Empty>
            ) : (
              <ul className="space-y-2">
                {returns.map((e) => (
                  <li key={`r-${e.order_id}`}>
                    <OrderBadge ev={e} variant="row" />
                    <p className="mt-1 text-[11px] text-muted truncate pl-1">
                      {e.site_name ?? "現場名未設定"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </aside>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-subtle">
          {title}
        </span>
        <span className="text-xs tabular-nums text-muted">{count} 件</span>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-muted px-2 py-3 rounded-[var(--radius-sm)] bg-surface-muted">
      {children}
    </p>
  );
}
