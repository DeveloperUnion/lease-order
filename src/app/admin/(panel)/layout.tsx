import { createSupabaseServerClient } from "@/lib/supabase-server";
import { countPendingOrders } from "@/lib/admin-data";
import { getTenantSlug } from "@/lib/tenant";
import { adminFontVariables } from "@/lib/admin-fonts";
import AdminShell from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";

export default async function AdminPanelLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createSupabaseServerClient();
  const [
    {
      data: { user },
    },
    pendingCount,
    tenantSlug,
  ] = await Promise.all([
    supabase.auth.getUser(),
    countPendingOrders(),
    getTenantSlug(),
  ]);

  return (
    <div
      data-tenant={tenantSlug}
      className={`${adminFontVariables} fixed inset-0 flex overflow-hidden bg-surface-muted font-[family-name:var(--font-body)]`}
    >
      <AdminShell pendingCount={pendingCount} email={user?.email ?? null}>
        {children}
      </AdminShell>
    </div>
  );
}
