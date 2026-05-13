import Link from "next/link";
import type { CalendarEvent } from "./types";

const KIND_LABEL: Record<CalendarEvent["kind"], string> = {
  shipment: "出荷",
  return: "返却",
};

function badgeClass(ev: CalendarEvent): string {
  if (ev.overdue) {
    return "bg-danger-soft text-danger border-l-2 border-danger";
  }
  if (ev.kind === "shipment") {
    return "bg-info-soft text-info border-l-2 border-info";
  }
  // return
  return "bg-warning-soft text-warning border-r-2 border-warning";
}

export default function OrderBadge({
  ev,
  variant = "compact",
}: {
  ev: CalendarEvent;
  variant?: "compact" | "row";
}) {
  const muted = ev.status === "completed";
  const base =
    variant === "compact"
      ? "flex items-center gap-1 px-1.5 h-[18px] text-[10px] rounded-sm truncate"
      : "flex items-center gap-2 px-2 h-7 text-xs rounded-md w-full";
  return (
    <Link
      href={`/admin/orders/${ev.order_id}`}
      className={`${base} ${badgeClass(ev)} ${muted ? "opacity-60" : ""} font-medium transition-colors hover:opacity-100 hover:brightness-95`}
      title={`${KIND_LABEL[ev.kind]} ${ev.order_number} / ${ev.company_name}`}
    >
      <span className="font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-wider shrink-0">
        {ev.overdue ? "遅延" : KIND_LABEL[ev.kind]}
      </span>
      <span className="truncate">{ev.order_number}</span>
      {variant === "row" && (
        <span className="ml-auto truncate text-muted text-[11px]">
          {ev.company_name}
        </span>
      )}
    </Link>
  );
}
