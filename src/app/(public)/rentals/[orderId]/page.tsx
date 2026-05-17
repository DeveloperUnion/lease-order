import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/customer-auth";
import { getRentalOrder } from "@/lib/rentals-data";
import { getOffices } from "@/lib/data";
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
  const offices = await getOffices();

  const activeItems = order.items.filter((i) => i.remaining > 0);
  const completedItems = order.items.filter((i) => i.remaining === 0);
  const hasOverdue = activeItems.some((i) => i.is_overdue);
  const isClosed =
    order.status === "completed" ||
    order.status === "cancelled" ||
    order.status === "rejected";
  const isPreShipment = !isClosed && order.status !== "renting";
  const isReadOnly = isClosed || isPreShipment;

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
          <StatusBadge
            tone={
              order.status === "completed"
                ? "success"
                : order.status === "rejected"
                  ? "danger"
                  : "neutral"
            }
          >
            {order.status === "completed"
              ? "完了"
              : order.status === "rejected"
                ? "却下"
                : "キャンセル"}
          </StatusBadge>
        )}
        {hasOverdue && !isClosed && (
          <StatusBadge tone="danger">
            期限超過
          </StatusBadge>
        )}
      </div>

      <Link
        href={`/messages?orderId=${order.id}`}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
        </svg>
        この発注についてチャットで質問する
      </Link>

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
            {order.status === "completed"
              ? "この発注は完了しています"
              : order.status === "rejected"
                ? "この発注は却下されました"
                : "この発注はキャンセルされました"}
          </p>
          <p className="text-xs mt-0.5 opacity-80">
            参照のみ可能です。返却・延長申請はできません。
          </p>
        </div>
      )}

      {isPreShipment && (
        <div className="mt-6 px-5 py-4 rounded-xl border bg-surface-muted border-border text-muted">
          <p className="text-sm font-semibold text-foreground">
            レンタル開始前の発注です
          </p>
          <p className="text-xs mt-0.5">
            返却・延長の申請はレンタル開始後に行えます。
          </p>
        </div>
      )}

      {!isReadOnly && order.scheduled_returns.length > 0 && (
        <section className="mt-8">
          <SectionLabel label="返却予定" />
          <div className="border border-info/30 bg-info-soft rounded-2xl overflow-hidden">
            {order.scheduled_returns.map((s) => (
              <div
                key={s.id}
                className="px-5 py-3 border-b border-info/20 last:border-b-0 flex items-baseline justify-between gap-3 flex-wrap"
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    {s.material_name}{" "}
                    <span className="text-subtle tabular-nums">× {s.requested_quantity_delta}</span>
                  </p>
                  <p className="text-xs text-info mt-0.5">
                    {formatDateLong(s.scheduled_date)} ・{" "}
                    {s.transport_method === "pickup"
                      ? "取りに来てもらう"
                      : `業所に持ち込み${s.dropoff_office_name ? `（${s.dropoff_office_name}）` : ""}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!isReadOnly && activeItems.length === 0 ? (
        <div className="mt-8 border border-border bg-surface rounded-2xl p-8 text-center">
          <p className="text-sm text-muted">すべて返却済みです</p>
        </div>
      ) : null}

      {!isReadOnly && activeItems.length > 0 && (
        <div className="mt-8">
          <SectionLabel label="返却・延長を申請" />
          <ReturnForm
            orderId={order.id}
            items={activeItems}
            extensions={order.extensions}
            offices={offices.map((o) => ({ id: o.id, name: o.name }))}
            defaultDropoffOfficeId={order.pickup_office?.id ?? null}
          />
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
