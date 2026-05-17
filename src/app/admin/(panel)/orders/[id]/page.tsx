import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrder } from "@/lib/admin-data";
import {
  PageHeader,
  SectionRule,
  MetaList,
  StatusBadge,
  DataTable,
  type Column,
  type MetaItem,
} from "@/components/admin/ui";
import OrderActions from "./order-actions";
import MapView from "@/components/map/map-view";
import CompletedReturnsSection from "./completed-returns-section";

type OrderDetailItem = NonNullable<Awaited<ReturnType<typeof getOrder>>>["items"][number];

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();

  const totalQty = order.items.reduce((sum, it) => sum + it.quantity, 0);
  const approvedTotalQty = order.items.reduce(
    (sum, it) => sum + (it.approved_quantity ?? it.quantity),
    0
  );

  const fmtDate = (s: string | null) =>
    s ? new Date(s).toLocaleString("ja-JP") : "—";

  const timelineItems: MetaItem[] = [
    { label: "受付", value: fmtDate(order.created_at), mono: true },
    {
      label: "承認",
      value: order.approved_by ? (
        <span>
          {fmtDate(order.approved_at)}
          <span className="text-subtle ml-2 text-xs">by {order.approved_by}</span>
        </span>
      ) : (
        fmtDate(order.approved_at)
      ),
      mono: true,
    },
    { label: "出荷", value: fmtDate(order.shipped_at), mono: true },
    { label: "完了", value: fmtDate(order.completed_at), mono: true },
    { label: "却下", value: fmtDate(order.rejected_at), mono: true },
  ];

  const customerItems: MetaItem[] = [
    { label: "会社名", value: order.company_name },
    { label: "担当者", value: order.contact_name },
  ];
  if (order.phone) {
    customerItems.push({
      label: "電話番号",
      value: (
        <a href={`tel:${order.phone}`} className="text-accent underline">
          {order.phone}
        </a>
      ),
      mono: true,
    });
  }
  if (order.email) {
    customerItems.push({ label: "メール", value: order.email, mono: true });
  }

  const deliveryItems: MetaItem[] = [
    {
      label: "受取方法",
      value: order.delivery_method === "delivery" ? "配送" : "引取",
    },
  ];
  if (order.delivery_method === "delivery" && order.delivery_address) {
    deliveryItems.push({
      label: "現場住所",
      value: <span className="whitespace-pre-wrap">{order.delivery_address}</span>,
    });
  }
  if (order.delivery_method === "pickup" && order.pickup_office) {
    deliveryItems.push({
      label: "引取営業所",
      value: (
        <span>
          {order.pickup_office.name}
          {order.pickup_office.address && (
            <span className="block text-xs text-subtle font-normal mt-0.5">
              {order.pickup_office.address}
            </span>
          )}
        </span>
      ),
    });
  }
  deliveryItems.push({
    label: "リース期間",
    value: formatLeasePeriod(order.lease_start_date, order.lease_end_date),
    mono: true,
  });

  const itemColumns: Column<OrderDetailItem>[] = [
    {
      key: "material",
      header: "資材",
      width: "minmax(200px, 1fr)",
      cell: (it) => (
        <span className="min-w-0">
          <span className="text-foreground font-medium">{it.material_name}</span>
          {it.spec_selections.length > 0 && (
            <span className="text-subtle ml-2 text-xs">
              ／ {it.spec_selections.map((s) => `${s.group_name}: ${s.option_label}`).join(" / ")}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "qty",
      header: "発注",
      width: "100px",
      align: "right",
      mono: true,
      cell: (it) => it.quantity,
    },
    {
      key: "approved",
      header: "承認",
      width: "120px",
      align: "right",
      mono: true,
      cell: (it) => {
        const approved = it.approved_quantity;
        if (approved === null) return <span className="text-subtle">—</span>;
        const isModified = approved !== it.quantity;
        return isModified ? (
          <span>
            <span className="text-subtle line-through mr-1.5">{it.quantity}</span>
            <span className="text-foreground font-semibold">{approved}</span>
          </span>
        ) : (
          <span>{approved}</span>
        );
      },
    },
  ];

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-1 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wider text-subtle hover:text-foreground transition-colors mb-5"
      >
        <span aria-hidden>←</span> 発注管理に戻る
      </Link>

      <PageHeader
        eyebrow={
          <span className="font-[family-name:var(--font-mono)] tabular-nums">
            {order.order_number}
          </span>
        }
        title="発注詳細"
        description={new Date(order.created_at).toLocaleString("ja-JP")}
        actions={<StatusBadge status={order.status} />}
      />

      <Link
        href={`/admin/messages?orderId=${order.id}`}
        className="-mt-2 mb-8 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
        </svg>
        この発注について顧客に連絡する
      </Link>

      <section className="mb-10">
        <SectionRule label="ステータス履歴" className="mb-3" />
        <MetaList items={timelineItems} columns={2} />
        {order.reject_reason && (
          <div className="mt-4 px-4 py-3 bg-[var(--color-status-rejected-bg)] border-l-2 border-[var(--color-status-rejected-fg)]">
            <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wider text-[var(--color-status-rejected-fg)] mb-1">
              却下理由
            </p>
            <p className="text-sm text-[var(--color-status-rejected-fg)] whitespace-pre-wrap">
              {order.reject_reason}
            </p>
          </div>
        )}
      </section>

      <section className="mb-10">
        <SectionRule label="発注者情報" className="mb-3" />
        <MetaList items={customerItems} columns={2} />
        {order.note && (
          <div className="mt-4 px-4 py-3 bg-surface-muted border-l-2 border-[var(--color-rule-strong)]">
            <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wider text-subtle mb-1">
              備考
            </p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{order.note}</p>
          </div>
        )}
      </section>

      <section className="mb-10">
        <SectionRule label="配送・リース" className="mb-3" />
        <MetaList items={deliveryItems} columns={2} />
        {order.delivery_method === "delivery" &&
          order.delivery_lat !== null &&
          order.delivery_lng !== null && (
            <div className="mt-4">
              <MapView
                lat={order.delivery_lat}
                lng={order.delivery_lng}
                height={260}
                markerLabel={order.delivery_address ?? "現場"}
              />
            </div>
          )}
        {order.delivery_method === "pickup" &&
          order.pickup_office?.lat != null &&
          order.pickup_office?.lng != null && (
            <div className="mt-4">
              <MapView
                lat={order.pickup_office.lat}
                lng={order.pickup_office.lng}
                height={260}
                markerLabel={order.pickup_office.name}
              />
            </div>
          )}
      </section>

      <section className="mb-10">
        <SectionRule
          label="注文明細"
          right={
            <span className="font-[family-name:var(--font-mono)] tabular-nums text-[11px] text-subtle">
              {order.items.length} 品目 / {totalQty} 点
              {order.status !== "pending" && approvedTotalQty !== totalQty && (
                <span className="ml-2 text-foreground">→ 承認 {approvedTotalQty}</span>
              )}
            </span>
          }
          className="mb-3"
        />
        <DataTable
          columns={itemColumns}
          rows={order.items}
          rowKey={(it) => it.id}
          density="compact"
          caption="注文明細"
        />
      </section>

      <CompletedReturnsSection orderId={order.id} />

      <section>
        <SectionRule label="操作" className="mb-4" />
        <OrderActions order={order} />
      </section>
    </main>
  );
}

function formatLeasePeriod(start: string | null, end: string | null): string {
  const fmt = (d: string) => new Date(d).toLocaleDateString("ja-JP");
  if (start && end) return `${fmt(start)} ～ ${fmt(end)}`;
  if (start) return `${fmt(start)} ～`;
  if (end) return `～ ${fmt(end)}`;
  return "—";
}
