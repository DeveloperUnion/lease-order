import type { OrderStatus } from "@/lib/order-status";
import { statusLabels } from "@/lib/order-status";

type Size = "sm" | "md";

const STATUS_CLASSES: Record<OrderStatus, { wrapper: string; dot: string }> = {
  pending: {
    wrapper:
      "bg-[var(--color-status-pending-bg)] text-[var(--color-status-pending-fg)]",
    dot: "bg-[var(--color-status-pending-dot)]",
  },
  approved: {
    wrapper:
      "bg-[var(--color-status-approved-bg)] text-[var(--color-status-approved-fg)]",
    dot: "bg-[var(--color-status-approved-dot)]",
  },
  rejected: {
    wrapper:
      "bg-[var(--color-status-rejected-bg)] text-[var(--color-status-rejected-fg)]",
    dot: "bg-[var(--color-status-rejected-dot)]",
  },
  renting: {
    wrapper:
      "bg-[var(--color-status-shipped-bg)] text-[var(--color-status-shipped-fg)]",
    dot: "bg-[var(--color-status-shipped-dot)]",
  },
  completed: {
    wrapper:
      "bg-[var(--color-status-completed-bg)] text-[var(--color-status-completed-fg)]",
    dot: "bg-[var(--color-status-completed-dot)]",
  },
  cancelled: {
    wrapper:
      "bg-[var(--color-status-cancelled-bg)] text-[var(--color-status-cancelled-fg)]",
    dot: "bg-[var(--color-status-cancelled-dot)]",
  },
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-2 py-0.5 text-[10px] gap-1",
  md: "px-2.5 py-0.5 text-xs gap-1.5",
};

const DOT_SIZE: Record<Size, string> = {
  sm: "h-1 w-1",
  md: "h-1.5 w-1.5",
};

export default function StatusBadge({
  status,
  size = "md",
  label,
}: {
  status: OrderStatus;
  size?: Size;
  label?: string;
}) {
  const text = label ?? statusLabels[status].label;
  const classes = STATUS_CLASSES[status];
  return (
    <span
      aria-label={`ステータス: ${text}`}
      className={`inline-flex items-center font-medium rounded-full ${SIZE_CLASSES[size]} ${classes.wrapper}`}
    >
      <span className={`rounded-full ${DOT_SIZE[size]} ${classes.dot}`} aria-hidden />
      {text}
    </span>
  );
}
