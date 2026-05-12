import Link from "next/link";
import { listPendingRequests, type PendingRequest } from "@/lib/admin-data";
import { PageHeader, EmptyState } from "@/components/admin/ui";
import RequestActions from "./request-actions";
import BulkActions from "./bulk-actions";

export const dynamic = "force-dynamic";

function formatDateLong(iso: string | null): string {
  if (!iso) return "未設定";
  const [y, m, d] = iso.split("-");
  return `${y}年${Number(m)}月${Number(d)}日`;
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = Math.floor((now - t) / 1000);
  if (diff < 60) return "たった今";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 時間前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 日前`;
  return new Date(iso).toLocaleDateString("ja-JP");
}

type Grouped = {
  orderId: string;
  orderNumber: string;
  siteName: string | null;
  companyName: string;
  contactName: string;
  items: PendingRequest[];
};

function groupByOrder(items: PendingRequest[]): Grouped[] {
  const map = new Map<string, Grouped>();
  for (const it of items) {
    let g = map.get(it.order_id);
    if (!g) {
      g = {
        orderId: it.order_id,
        orderNumber: it.order_number,
        siteName: it.site_name,
        companyName: it.company_name,
        contactName: it.contact_name,
        items: [],
      };
      map.set(it.order_id, g);
    }
    g.items.push(it);
  }
  return Array.from(map.values());
}

export default async function AdminRequestsPage() {
  const requests = await listPendingRequests();
  const grouped = groupByOrder(requests);

  return (
    <main className="flex-1 overflow-y-auto px-6 sm:px-10 py-8">
      <div className="max-w-5xl mx-auto">
        <PageHeader
          eyebrow="REQUESTS"
          title="返却・延長申請"
          description="顧客から届いている未処理の申請を確認し、承認または却下します。"
        />

        {grouped.length === 0 ? (
          <EmptyState
            title="未処理の申請はありません"
            description="新しい申請が届くと、ここに表示されます。"
          />
        ) : (
          <div className="space-y-4">
            {grouped.map((g) => (
              <section
                key={g.orderId}
                className="border border-rule rounded-[var(--radius-lg)] bg-surface overflow-hidden"
              >
                <header className="px-5 py-4 border-b border-rule flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-[family-name:var(--font-mono)] text-xs text-subtle">
                      {g.orderNumber}
                    </p>
                    <h2 className="text-base font-semibold text-foreground truncate mt-0.5">
                      {g.siteName ?? "（現場未設定）"}
                    </h2>
                    <p className="text-xs text-muted mt-0.5">
                      {g.companyName} ／ {g.contactName}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Link
                      href={`/admin/orders/${g.orderId}`}
                      className="text-xs text-accent hover:underline whitespace-nowrap"
                    >
                      発注詳細 →
                    </Link>
                    <BulkActions
                      orderId={g.orderId}
                      returnCount={g.items.filter((it) => it.type === "return").length}
                      extensionCount={g.items.filter((it) => it.type === "extension").length}
                    />
                  </div>
                </header>
                <ul className="divide-y divide-rule">
                  {g.items.map((r) => (
                    <li key={`${r.type}-${r.id}`} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span
                              className={`inline-flex items-center px-2 h-5 rounded-full text-[11px] font-semibold ${
                                r.type === "return"
                                  ? "bg-info-soft text-info"
                                  : "bg-[var(--color-status-pending-bg)] text-[var(--color-status-pending-fg)]"
                              }`}
                            >
                              {r.type === "return" ? "返却" : "延長"}
                            </span>
                            <span className="text-sm font-medium text-foreground">
                              {r.material_name}
                            </span>
                            {r.type === "return" ? (
                              <span className="text-sm text-foreground tabular-nums">
                                × {r.requested_quantity_delta}
                              </span>
                            ) : (
                              <span className="text-sm text-foreground tabular-nums">
                                {formatDateLong(r.previous_end_date)} → {formatDateLong(r.new_end_date)}
                              </span>
                            )}
                          </div>
                          {r.reason && (
                            <p className="text-xs text-muted mt-1">理由: {r.reason}</p>
                          )}
                          <p className="text-xs text-subtle mt-1">
                            {formatRelative(r.requested_at)}
                          </p>
                        </div>
                        <RequestActions
                          requestId={r.id}
                          type={r.type}
                          label={
                            r.type === "return"
                              ? `${r.material_name} ×${r.requested_quantity_delta} の返却`
                              : `${r.material_name} の期限延長`
                          }
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
