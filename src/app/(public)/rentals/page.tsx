import Link from "next/link";
import { requireCustomer } from "@/lib/customer-auth";
import { listRentalItemsByCustomer, type RentalItemFlat, type RentalSiteTab } from "@/lib/rentals-data";

export const dynamic = "force-dynamic";

const ALL_KEY = "__all__";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

type DueTone = "danger" | "warning" | "neutral";

function dueLabel(item: RentalItemFlat): { text: string; tone: DueTone } {
  if (!item.lease_end_date) return { text: "期限未設定", tone: "neutral" };
  const date = formatDate(item.lease_end_date);
  if (item.is_overdue) {
    const days = item.days_to_due !== null ? Math.abs(item.days_to_due) : null;
    return { text: days !== null ? `${date}（${days}日超過）` : `${date} 期限超過`, tone: "danger" };
  }
  if (item.days_to_due === 0) return { text: `${date}（今日まで）`, tone: "warning" };
  if (item.days_to_due !== null && item.days_to_due <= 3) {
    return { text: `${date}（あと${item.days_to_due}日）`, tone: "warning" };
  }
  return { text: `${date} まで`, tone: "neutral" };
}

const TONE_CLASSES: Record<DueTone, { text: string; border: string }> = {
  danger: { text: "text-danger", border: "before:bg-danger" },
  warning: { text: "text-warning", border: "before:bg-warning" },
  neutral: { text: "text-subtle", border: "before:bg-transparent" },
};

export default async function RentalsPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const customer = await requireCustomer();
  const { site } = await searchParams;
  const { items, sites, totalOverdueCount, hasAny } = await listRentalItemsByCustomer(
    customer.id,
    customer.tenant_id
  );

  const activeKey = site && sites.some((s) => s.key === site) ? site : ALL_KEY;
  const filteredItems = activeKey === ALL_KEY ? items : items.filter((i) => i.site_key === activeKey);
  const showSiteColumn = activeKey === ALL_KEY && sites.length > 1;

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-7">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">レンタル品管理</h1>

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
        <>
          {totalOverdueCount > 0 && (
            <div className="mt-5 inline-flex items-center gap-2 px-3 h-9 rounded-full bg-danger-soft text-danger text-sm font-semibold">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{totalOverdueCount} 品目が期限超過</span>
            </div>
          )}

          {sites.length > 1 && (
            <SiteTabs sites={sites} totalItems={items.length} activeKey={activeKey} />
          )}

          <div className="mt-4 border border-border bg-surface rounded-2xl overflow-hidden">
            {filteredItems.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted">
                該当する品目がありません
              </div>
            ) : (
              <ul>
                {filteredItems.map((item) => (
                  <RentalItemRow
                    key={item.item_id}
                    item={item}
                    showSite={showSiteColumn}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function SiteTabs({
  sites,
  totalItems,
  activeKey,
}: {
  sites: RentalSiteTab[];
  totalItems: number;
  activeKey: string;
}) {
  return (
    <nav className="mt-5 -mx-4 px-4 overflow-x-auto" aria-label="現場で絞り込み">
      <ul className="flex gap-2 min-w-max pb-1">
        <li>
          <TabLink
            href="/rentals"
            active={activeKey === ALL_KEY}
            label="すべて"
            count={totalItems}
          />
        </li>
        {sites.map((s) => (
          <li key={s.key}>
            <TabLink
              href={`/rentals?site=${encodeURIComponent(s.key)}`}
              active={activeKey === s.key}
              label={s.label}
              count={s.item_count}
              overdueCount={s.overdue_count}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function TabLink({
  href,
  active,
  label,
  count,
  overdueCount,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  overdueCount?: number;
}) {
  const base =
    "inline-flex items-center gap-2 h-9 px-4 rounded-full text-sm font-semibold whitespace-nowrap transition-colors border";
  const activeCls = "bg-foreground text-surface border-foreground";
  const idleCls = "bg-surface text-muted border-border hover:text-foreground hover:border-border-strong";
  return (
    <Link href={href} className={`${base} ${active ? activeCls : idleCls}`}>
      <span className="truncate max-w-[10rem]">{label}</span>
      <span className={`tabular-nums text-xs ${active ? "opacity-80" : "text-subtle"}`}>{count}</span>
      {overdueCount && overdueCount > 0 ? (
        <span
          className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
            active ? "bg-surface text-danger" : "bg-danger text-surface"
          }`}
          aria-label={`期限超過 ${overdueCount} 件`}
        >
          {overdueCount}
        </span>
      ) : null}
    </Link>
  );
}

function RentalItemRow({ item, showSite }: { item: RentalItemFlat; showSite: boolean }) {
  const due = dueLabel(item);
  const tone = TONE_CLASSES[due.tone];
  return (
    <li>
      <Link
        href={`/rentals/${item.order_id}?from=rentals`}
        className={`relative block pl-5 pr-4 py-4 border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-r ${tone.border}`}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">{item.material_name}</span>
              <span className="text-xs text-subtle tabular-nums">残 {item.remaining}</span>
            </div>
            <div className={`mt-1 text-xs tabular-nums ${tone.text}`}>
              {due.text}
            </div>
            <div className="mt-1 text-[11px] text-subtle truncate">
              {showSite && (
                <>
                  <span className="text-muted">{item.site_name ?? "現場未設定"}</span>
                  <span aria-hidden className="mx-1.5">·</span>
                </>
              )}
              <span>{item.order_number}</span>
            </div>
          </div>
          <span aria-hidden className="text-sm text-subtle mt-0.5">→</span>
        </div>
      </Link>
    </li>
  );
}
