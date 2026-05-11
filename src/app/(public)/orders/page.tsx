import Link from "next/link";
import { requireCustomer } from "@/lib/customer-auth";
import { listAllOrdersByCustomer, type OrderStatusFilter } from "@/lib/rentals-data";
import StatusBadge from "@/components/ui/status-badge";

export const dynamic = "force-dynamic";

const STATUS: Record<
  string,
  { label: string; tone: "neutral" | "accent" | "info" | "success" | "warning" | "danger" }
> = {
  pending: { label: "未確認", tone: "warning" },
  approved: { label: "承認済", tone: "info" },
  rejected: { label: "却下", tone: "danger" },
  renting: { label: "レンタル中", tone: "accent" },
  completed: { label: "完了", tone: "success" },
  cancelled: { label: "キャンセル", tone: "neutral" },
};

const FILTER_TABS: { value: OrderStatusFilter; label: string }[] = [
  { value: "all", label: "全て" },
  { value: "active", label: "進行中" },
  { value: "completed", label: "完了" },
  { value: "cancelled", label: "キャンセル" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${m}/${d}`;
}

function formatDateLong(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${y}/${Number(m)}/${Number(d)}`;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const customer = await requireCustomer();
  const sp = await searchParams;
  const filter: OrderStatusFilter = (
    ["all", "active", "completed", "cancelled"].includes(sp.status ?? "")
      ? sp.status
      : "all"
  ) as OrderStatusFilter;

  const orders = await listAllOrdersByCustomer(customer.id, customer.tenant_id, filter);

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-7">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">発注履歴</h1>

      {/* Filter tabs */}
      <div className="mt-6 flex gap-1 border-b border-border overflow-x-auto">
        {FILTER_TABS.map((tab) => {
          const active = tab.value === filter;
          return (
            <Link
              key={tab.value}
              href={`/orders${tab.value === "all" ? "" : `?status=${tab.value}`}`}
              className={`relative px-4 pt-2 pb-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                active ? "text-accent" : "text-muted hover:text-foreground"
              }`}
            >
              <span>{tab.label}</span>
              {active && (
                <span aria-hidden className="absolute left-0 right-0 -bottom-px h-[2px] bg-accent rounded-full" />
              )}
            </Link>
          );
        })}
      </div>

      {orders.length === 0 ? (
        <div className="mt-8 border border-border bg-surface rounded-2xl p-10 text-center">
          <p className="text-sm text-muted">該当する発注がありません</p>
        </div>
      ) : (
        <div className="mt-6 bg-surface border border-border rounded-xl overflow-hidden">
          {orders.map((o) => {
            const s = STATUS[o.status] ?? { label: o.status, tone: "neutral" as const };
            return (
              <Link
                key={o.id}
                href={`/rentals/${o.id}?from=orders`}
                className="flex items-start gap-4 px-4 py-4 border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {o.site_name ?? "現場未設定"}
                    </span>
                    <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                    {o.overdue_item_count > 0 && (
                      <StatusBadge tone="danger">
                        期限超過 {o.overdue_item_count}
                      </StatusBadge>
                    )}
                  </div>
                  <p className="text-xs text-subtle mt-0.5">{o.order_number}</p>
                  <p className="text-xs text-subtle mt-0.5">
                    {o.item_count} 品目
                    {o.lease_start_date && o.lease_end_date && (
                      <>
                        <span className="mx-1.5 text-subtle">·</span>
                        <span className="text-foreground">
                          {formatDateLong(o.lease_start_date)} 〜 {formatDate(o.lease_end_date)}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <span aria-hidden className="text-sm text-subtle flex-shrink-0 mt-0.5">→</span>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
