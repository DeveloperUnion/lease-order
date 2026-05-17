import Link from "next/link";
import type { CalendarEvent } from "./types";

function badgeClass(ev: CalendarEvent): string {
  if (ev.overdue) {
    return "bg-danger-soft text-danger border-l-2 border-danger";
  }
  if (ev.kind === "shipment") {
    return "bg-info-soft text-info border-l-2 border-info";
  }
  // kind === "return-scheduled"
  return "bg-success-soft text-success border-r-2 border-success";
}

function badgeLabel(ev: CalendarEvent): string {
  if (ev.overdue) {
    return ev.kind === "shipment" ? "遅延(出荷未済)" : "遅延(返却未済)";
  }
  if (ev.kind === "shipment") {
    return ev.delivery_method === "delivery" ? "出荷(配送)" : "出荷(来店)";
  }
  // kind === "return-scheduled"
  return ev.transport_method === "pickup" ? "返却(引取)" : "返却(持込)";
}

export default function OrderBadge({
  ev,
  variant = "compact",
}: {
  ev: CalendarEvent;
  variant?: "compact" | "row";
}) {
  const label = ev.site_name
    ? `${ev.company_name} / ${ev.site_name}`
    : ev.company_name;
  const kindLabel = badgeLabel(ev);
  if (variant === "compact") {
    return (
      <Link
        href={`/admin/orders/${ev.order_id}`}
        className={`flex flex-col gap-0.5 px-1.5 py-1 rounded-sm leading-tight ${badgeClass(ev)} font-medium transition-colors hover:brightness-95`}
        title={`${kindLabel} ${ev.order_number} / ${label}`}
      >
        <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-wider truncate">
          {kindLabel}
        </span>
        <span className="text-[11px] truncate">{label}</span>
      </Link>
    );
  }
  return (
    <Link
      href={`/admin/orders/${ev.order_id}`}
      className={`flex items-center gap-2 px-2 h-7 text-xs rounded-md w-full ${badgeClass(ev)} font-medium transition-colors hover:brightness-95`}
      title={`${kindLabel} ${ev.order_number} / ${label}`}
    >
      <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-wider shrink-0">
        {kindLabel}
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );
}
