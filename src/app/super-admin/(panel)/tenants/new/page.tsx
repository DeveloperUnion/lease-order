import { PageHeader } from "@/components/admin/ui";
import { getTenantBaseDomain } from "@/lib/tenant";
import NewTenantForm from "./new-tenant-form";

export const dynamic = "force-dynamic";

export default async function NewTenantPage() {
  const baseDomain = await getTenantBaseDomain();
  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref="/"
        backLabel="テナント一覧"
        title="新規テナント"
        description="リース会社を作成します。作成後の詳細画面で初回管理者を招待できます。"
      />
      <NewTenantForm baseDomain={baseDomain} />
    </main>
  );
}
