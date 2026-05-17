import { listOrdersInRange, listScheduledReturnsInRange } from "@/lib/admin-data";
import { PageHeader } from "@/components/admin/ui";
import DashboardCalendar from "@/components/admin/dashboard-calendar";
import { computeRange } from "@/components/admin/dashboard-calendar/range";
import type { CalendarView } from "@/components/admin/dashboard-calendar/types";

export const dynamic = "force-dynamic";

type SearchParams = {
  view?: string;
  ym?: string;
  wk?: string;
};

function normalizeView(v: string | undefined): CalendarView {
  return v === "week" ? "week" : "month";
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const view = normalizeView(sp.view);
  const range = computeRange(view, sp.ym, sp.wk);
  const [orders, scheduledReturns] = await Promise.all([
    listOrdersInRange(range.from, range.to),
    listScheduledReturnsInRange(range.from, range.to),
  ]);

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title="ダッシュボード"
        description="出荷予定と返却予定をカレンダーで確認します。"
      />
      <DashboardCalendar
        view={view}
        range={range}
        orders={orders}
        scheduledReturns={scheduledReturns}
      />
    </main>
  );
}
