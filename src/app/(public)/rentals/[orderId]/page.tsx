import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/customer-auth";
import { getRentalOrder } from "@/lib/rentals-data";
import ReturnForm from "./return-form";
import LeaseTimeline from "@/components/ui/lease-timeline";
import StatusBadge from "@/components/ui/status-badge";

export const dynamic = "force-dynamic";

function formatDateLong(iso: string | null): string {
  if (!iso) return "未設定";
  const [y, m, d] = iso.split("-");
  return `${y}年${Number(m)}月${Number(d)}日`;
}

export default async function RentalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const customer = await requireCustomer();
  const { orderId } = await params;
  const { from } = await searchParams;
  const order = await getRentalOrder(orderId, customer.id, customer.tenant_id);
  if (!order) notFound();

  const activeItems = order.items.filter((i) => i.remaining > 0);
  const completedItems = order.items.filter((i) => i.remaining === 0);
  const hasOverdue = activeItems.some((i) => i.is_overdue);
  const isClosed = order.status === "completed" || order.status === "cancelled";
  const isReadOnly = isClosed;

  const backHref = from === "orders" ? "/orders" : "/rentals";
  const backLabel = from === "orders" ? "発注履歴に戻る" : "レンタル一覧に戻る";

  return (
    <main className={`flex-1 max-w-3xl mx-auto w-full px-4 py-7 ${isReadOnly ? "" : "pb-32"}`}>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-xs text-subtle hover:text-accent transition-colors mb-5"
      >
        <span aria-hidden>←</span> {backLabel}
      </Link>

      <p className="text-xs text-subtle">{order.order_number}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {order.site_name ?? "現場未設定"}
        </h1>
        {isClosed && (
          <StatusBadge tone={order.status === "completed" ? "success" : "neutral"}>
            {order.status === "completed" ? "完了" : "キャンセル"}
          </StatusBadge>
        )}
        {hasOverdue && !isClosed && (
          <StatusBadge tone="danger">
            期限超過
          </StatusBadge>
        )}
      </div>

      {/* メタ情報テーブル */}
      <dl className="mt-5 border-t border-border">
        <Row label="受取方法" value={order.delivery_method === "delivery" ? "配送" : "引取"} />
        {order.delivery_method === "delivery" && order.delivery_address && (
          <Row label="配送先" value={order.delivery_address} />
        )}
        {order.delivery_method === "pickup" && order.pickup_office && (
          <Row label="引取営業所" value={order.pickup_office.name} />
        )}
        <Row label="リース開始" value={formatDateLong(order.lease_start_date)} />
      </dl>

      {/* Lease Timeline */}
      <div className="mt-6">
        <LeaseTimeline
          startDate={order.lease_start_date}
          endDate={order.lease_end_date}
          overdue={hasOverdue}
        />
      </div>

      {isClosed && (
        <div
          className={`mt-6 px-5 py-4 rounded-xl border ${
            order.status === "completed"
              ? "bg-success-soft border-success/30 text-success"
              : "bg-surface-muted border-border text-muted"
          }`}
        >
          <p className="text-sm font-semibold">
            {order.status === "completed" ? "この発注は完了しています" : "この発注はキャンセルされました"}
          </p>
          <p className="text-xs mt-0.5 opacity-80">
            参照のみ可能です。返却・延長操作はできません。
          </p>
        </div>
      )}

      {!isReadOnly && activeItems.length === 0 ? (
        <div className="mt-8 border border-border bg-surface rounded-2xl p-8 text-center">
          <p className="text-sm text-muted">すべて返却済みです</p>
        </div>
      ) : null}

      {!isReadOnly && activeItems.length > 0 && (
        <div className="mt-8">
          <SectionLabel label="返却 / 延長" />
          <ReturnForm orderId={order.id} items={activeItems} extensions={order.extensions} />
        </div>
      )}

      {isReadOnly && (
        <section className="mt-8">
          <SectionLabel label="明細" />
          <div className="border border-border bg-surface rounded-xl overflow-hidden">
            {order.items.map((it) => (
              <div
                key={it.id}
                className="px-5 py-3 flex items-center justify-between text-sm border-b border-border last:border-b-0"
              >
                <span className="text-foreground">{it.material_name}</span>
                <span className="text-subtle tabular-nums">
                  × {it.quantity}（返却 {it.returned_quantity}）
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {!isReadOnly && completedItems.length > 0 && (
        <section className="mt-10">
          <SectionLabel label="返却済み" />
          <div className="border border-border bg-surface rounded-xl overflow-hidden">
            {completedItems.map((it) => (
              <div
                key={it.id}
                className="px-5 py-3 flex items-center justify-between text-sm border-b border-border last:border-b-0"
              >
                <span className="text-foreground">{it.material_name}</span>
                <span className="text-success tabular-nums">× {it.quantity} 返却済</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-4 py-2 border-b border-border">
      <dt className="text-xs text-subtle min-w-[6rem]">
        {label}
      </dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <h2 className="text-base font-semibold text-foreground mb-3">
      {label}
    </h2>
  );
}
