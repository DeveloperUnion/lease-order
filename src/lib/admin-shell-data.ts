import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "./supabase-server";
import { supabaseAdmin } from "./supabase-admin";
import { countPendingOrders, countPendingRequests } from "./admin-data";
import {
  countUnreadForAdmin,
  listNotificationsForAdmin,
  type NotificationRow,
} from "./notifications-data";
import { getTenantId } from "./tenant";

export type SidebarData = {
  pendingCount: number;
  pendingRequestCount: number;
  email: string | null;
};

export type NotificationBellData = {
  unreadCount: number;
  recent: NotificationRow[];
};

// 管理者の email / admin_users.id をリクエスト内で 1 回だけ解決する。
// Sidebar と NotificationBell の両方から参照されるため cache で重複呼び出しを抑える。
const getAdminContext = cache(
  async (): Promise<{ adminId: string | null; email: string | null }> => {
    const ssr = await createSupabaseServerClient();
    const { data } = await ssr.auth.getClaims();
    const email = (data?.claims?.email as string | undefined) ?? null;
    if (!email) return { adminId: null, email: null };
    const tenantId = await getTenantId();
    const { data } = await supabaseAdmin
      .from("admin_users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("email", email.toLowerCase())
      .maybeSingle();
    const adminId = (data as { id: string } | null)?.id ?? null;
    return { adminId, email };
  }
);

export async function getSidebarData(): Promise<SidebarData> {
  const [pendingCount, pendingRequestCount, ctx] = await Promise.all([
    countPendingOrders(),
    countPendingRequests(),
    getAdminContext(),
  ]);
  return { pendingCount, pendingRequestCount, email: ctx.email };
}

export async function getNotificationBellData(): Promise<NotificationBellData> {
  const { adminId } = await getAdminContext();
  if (!adminId) return { unreadCount: 0, recent: [] };
  const tenantId = await getTenantId();
  const [unreadCount, recent] = await Promise.all([
    countUnreadForAdmin(adminId, tenantId),
    listNotificationsForAdmin(adminId, tenantId, 10),
  ]);
  return { unreadCount, recent };
}
