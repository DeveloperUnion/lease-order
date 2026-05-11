import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { countPendingOrders, countPendingRequests } from "@/lib/admin-data";
import {
  countUnreadForAdmin,
  listNotificationsForAdmin,
} from "@/lib/notifications-data";
import { getTenantId, getTenantSlug } from "@/lib/tenant";
import { adminFontVariables } from "@/lib/admin-fonts";
import AdminShell from "@/components/admin/admin-shell";
import AdminNotificationBell from "@/components/admin/admin-notification-bell";

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
    pendingRequestCount,
    tenantSlug,
    tenantId,
  ] = await Promise.all([
    supabase.auth.getUser(),
    countPendingOrders(),
    countPendingRequests(),
    getTenantSlug(),
    getTenantId(),
  ]);

  const email = user?.email ?? null;
  let unreadCount = 0;
  let recent: Awaited<ReturnType<typeof listNotificationsForAdmin>> = [];
  if (email) {
    const { data: adminRow } = await supabaseAdmin
      .from("admin_users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("email", email)
      .maybeSingle();
    const adminId = (adminRow as { id: string } | null)?.id ?? null;
    if (adminId) {
      [unreadCount, recent] = await Promise.all([
        countUnreadForAdmin(adminId, tenantId),
        listNotificationsForAdmin(adminId, tenantId, 10),
      ]);
    }
  }

  return (
    <div
      data-tenant={tenantSlug}
      className={`${adminFontVariables} fixed inset-0 flex overflow-hidden bg-surface-muted font-[family-name:var(--font-body)]`}
    >
      <AdminShell
        pendingCount={pendingCount}
        pendingRequestCount={pendingRequestCount}
        email={email}
        notificationBell={
          <AdminNotificationBell unreadCount={unreadCount} recent={recent} />
        }
      >
        {children}
      </AdminShell>
    </div>
  );
}
