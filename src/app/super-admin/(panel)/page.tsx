import Link from "next/link";
import { listTenants } from "@/lib/super-admin-data";
import { PageHeader, ButtonLink, EmptyState } from "@/components/admin/ui";
import TrialBadge from "./trial-badge";

export const dynamic = "force-dynamic";

const PRODUCT_DOMAIN = "lease-order.kensetsu-tech.com";

export default async function TenantsPage() {
  const tenants = await listTenants();

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="テナント"
        description="リース会社（テナント）の一覧・新規作成・管理者招待を行います。"
        actions={
          <ButtonLink href="/tenants/new" size="md">
            + 新規テナント
          </ButtonLink>
        }
      />

      {tenants.length === 0 ? (
        <EmptyState
          title="テナントがありません"
          description="最初のリース会社を作成してください。"
        />
      ) : (
        <div className="border-y border-rule divide-y divide-rule">
          {tenants.map((t) => (
            <Link
              key={t.id}
              href={`/tenants/${t.id}`}
              className="flex items-center justify-between gap-4 px-3 sm:px-4 py-4 hover:bg-surface transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground truncate">
                    {t.name}
                  </span>
                  <TrialBadge display={t.statusDisplay} hideActive />
                  <span className="font-[family-name:var(--font-mono)] text-[11px] text-muted">
                    {t.slug}.{PRODUCT_DOMAIN}
                  </span>
                </div>
                <p className="font-[family-name:var(--font-mono)] text-[10px] text-subtle mt-1 uppercase tracking-wider">
                  作成 {new Date(t.created_at).toLocaleDateString("ja-JP")} ・ 課金 {t.billing_rule.type}
                </p>
              </div>
              <div className="flex items-center gap-5 flex-shrink-0 font-[family-name:var(--font-mono)] tabular-nums text-center">
                <CountCell label="管理者" value={t.adminCount} />
                <CountCell label="顧客" value={t.customerCount} />
                <CountCell label="注文" value={t.orderCount} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

function CountCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[3rem]">
      <div className="text-sm text-foreground">{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-subtle">{label}</div>
    </div>
  );
}
