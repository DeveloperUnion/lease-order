import Link from "next/link";
import { requireCustomer } from "@/lib/customer-auth";
import { listRentalsByCustomer } from "@/lib/rentals-data";
import StatusBadge from "@/components/ui/status-badge";

export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${m}/${d}`;
}

export default async function RentalsPage() {
  const customer = await requireCustomer();
  const { overdueItems, sites, hasAny } = await listRentalsByCustomer(customer.id, customer.tenant_id);

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-7">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">レンタル品管理</h1>

      {overdueItems.length > 0 && (
        <div className="mt-6 bg-danger-soft border border-danger/20 rounded-xl px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="h-5 w-5 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-danger">
                返却期限を過ぎた資材があります（{overdueItems.length} 件）
              </p>
              <p className="text-xs text-danger/80 mt-1 mb-3">
                返却または期限延長の手続きをしてください。
              </p>
              <ul className="space-y-1">
                {overdueItems.slice(0, 5).map((o) => (
                  <li key={o.item.id}>
                    <Link
                      href={`/rentals/${o.order_id}`}
                      className="text-sm text-danger hover:underline inline-flex flex-wrap gap-x-2 items-baseline"
                    >
                      <span className="font-medium">{o.item.material_name}</span>
                      <span className="text-xs tabular-nums">× {o.item.remaining}</span>
                      <span className="text-xs">/ 期限 {formatDate(o.item.lease_end_date)}</span>
                      <span className="text-xs text-danger/70">（{o.site_name ?? "現場未設定"}）</span>
                    </Link>
                  </li>
                ))}
                {overdueItems.length > 5 && (
                  <li className="text-xs text-danger/80">…他 {overdueItems.length - 5} 件</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {!hasAny ? (
        <div className="mt-6 border border-border bg-surface rounded-2xl p-10 text-center">
          <p className="text-sm text-muted">現在借りているレンタル品はありません</p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center justify-center gap-2 px-6 h-10 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-[background,transform] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.99]"
          >
            資材を発注する
            <span aria-hidden>→</span>
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {sites.map((site) => (
            <section key={site.site_name} className="border border-border bg-surface rounded-2xl overflow-hidden">
              <header className="px-5 py-4 border-b border-border">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-foreground truncate">{site.site_name}</h2>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {site.overdue_item_count > 0 && (
                      <StatusBadge tone="danger">
                        期限超過 {site.overdue_item_count}
                      </StatusBadge>
                    )}
                    <StatusBadge tone="info">
                      発注 {site.active_order_count} 件
                    </StatusBadge>
                  </div>
                </div>
                {site.soonest_end_date && (
                  <p className="text-xs text-subtle mt-1">
                    最早返却日: <span className="text-foreground">{formatDate(site.soonest_end_date)}</span>
                  </p>
                )}
              </header>
              <ul>
                {site.orders.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/rentals/${o.id}`}
                      className="flex items-center gap-3 px-5 py-3 border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{o.order_number}</p>
                        <p className="text-xs text-subtle mt-0.5">
                          {o.active_item_count} 品目
                          {o.lease_end_date && <> ・ 期限 {formatDate(o.lease_end_date)}</>}
                        </p>
                      </div>
                      {o.overdue_item_count > 0 && (
                        <StatusBadge tone="danger">
                          {o.overdue_item_count}
                        </StatusBadge>
                      )}
                      <span aria-hidden className="text-sm text-subtle">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
