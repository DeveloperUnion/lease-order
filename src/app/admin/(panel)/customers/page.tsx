import { listCustomersForAdmin, type AdminCustomerRow } from "@/lib/admin-data";
import {
  PageHeader,
  DataTable,
  ButtonLink,
  type Column,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage() {
  const customers = await listCustomersForAdmin();

  const columns: Column<AdminCustomerRow>[] = [
    {
      key: "company_id",
      header: "会社 ID",
      width: "180px",
      mono: true,
      cell: (c) => c.company_id,
    },
    {
      key: "name",
      header: "会社名",
      width: "minmax(200px, 1fr)",
      cell: (c) => (
        <span className="min-w-0">
          <span className="text-foreground font-medium">{c.name}</span>
          {c.contact_email && (
            <span className="text-subtle text-xs ml-2">／ {c.contact_email}</span>
          )}
        </span>
      ),
    },
    {
      key: "status",
      header: "状態",
      width: "100px",
      cell: (c) =>
        c.is_active ? (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-status-completed-fg)]" />
            <span className="text-foreground">有効</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-subtle" />
            <span className="text-muted">無効</span>
          </span>
        ),
    },
    {
      key: "created",
      header: "登録",
      width: "100px",
      align: "right",
      cell: (c) =>
        new Date(c.created_at).toLocaleDateString("ja-JP", {
          month: "2-digit",
          day: "2-digit",
        }),
    },
  ];

  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        eyebrow="マスタ"
        title="顧客管理"
        description="ログイン可能な顧客アカウントを管理します。"
        actions={<ButtonLink href="/admin/customers/new">新規追加</ButtonLink>}
      />

      <DataTable
        columns={columns}
        rows={customers}
        rowKey={(c) => c.id}
        rowHref={(c) => `/admin/customers/${c.id}`}
        empty="まだ顧客が登録されていません"
        caption="顧客一覧"
      />
    </main>
  );
}
