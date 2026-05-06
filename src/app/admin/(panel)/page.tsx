import Link from "next/link";
import {
  countActiveMaterials,
  countOrdersInMonth,
  countPendingOrders,
  listRecentOrders,
  type RecentOrderRow,
} from "@/lib/admin-data";
import {
  PageHeader,
  SectionRule,
  StatBlock,
  DataTable,
  StatusBadge,
  EmptyState,
  type Column,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

function IconBell() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function IconClipboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  );
}

function IconBox() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

export default async function AdminPage() {
  const [pending, monthlyTotal, monthlyCompleted, materialCount, recent] =
    await Promise.all([
      countPendingOrders(),
      countOrdersInMonth(),
      countOrdersInMonth("completed"),
      countActiveMaterials(),
      listRecentOrders(5),
    ]);

  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const recentColumns: Column<RecentOrderRow>[] = [
    {
      key: "order_number",
      header: "発注番号",
      width: "180px",
      mono: true,
      cell: (o) => o.order_number,
    },
    {
      key: "status",
      header: "状態",
      width: "120px",
      cell: (o) => <StatusBadge status={o.status} />,
    },
    {
      key: "company",
      header: "顧客",
      width: "minmax(200px, 1fr)",
      cell: (o) => <span className="text-foreground">{o.company_name}</span>,
    },
    {
      key: "created",
      header: "受付",
      width: "120px",
      align: "right",
      cell: (o) =>
        new Date(o.created_at).toLocaleDateString("ja-JP", {
          month: "2-digit",
          day: "2-digit",
        }),
    },
  ];

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        eyebrow={
          <span className="font-[family-name:var(--font-mono)] tabular-nums">
            {today}
          </span>
        }
        title="ダッシュボード"
        description="発注の処理状況と当月の集計を一覧します。"
      />

      <section className="mb-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 border-y border-rule-strong divide-y divide-rule lg:divide-y-0 lg:divide-x lg:divide-rule">
          <StatBlock
            label="未確認"
            value={pending}
            unit="件"
            highlight={pending > 0}
            href="/admin/orders"
            hint={pending > 0 ? "承認待ちあり" : undefined}
            icon={<IconBell />}
          />
          <StatBlock
            label="今月の発注"
            value={monthlyTotal}
            unit="件"
            icon={<IconClipboard />}
          />
          <StatBlock
            label="今月の完了"
            value={monthlyCompleted}
            unit="件"
            icon={<IconCheck />}
          />
          <StatBlock
            label="公開資材"
            value={materialCount}
            unit="点"
            href="/admin/materials"
            icon={<IconBox />}
          />
        </div>
      </section>

      <section>
        <SectionRule
          label="直近の発注"
          right={
            <Link
              href="/admin/orders"
              className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wider text-muted hover:text-accent transition-colors"
            >
              すべて見る →
            </Link>
          }
          className="mb-3"
        />
        {recent.length === 0 ? (
          <EmptyState
            title="まだ発注はありません"
            description="顧客から発注が入ると、ここに直近5件が表示されます。"
          />
        ) : (
          <DataTable
            columns={recentColumns}
            rows={recent}
            rowKey={(o) => o.id}
            rowHref={(o) => `/admin/orders/${o.id}`}
            density="compact"
            caption="直近の発注"
          />
        )}
      </section>
    </main>
  );
}
