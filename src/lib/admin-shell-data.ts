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

// フィードバック収集モード (DISABLE_AUTH=1) のとき、未ログイン訪問者には
// テナントの最初の admin_users 行を「ゲスト admin」として割り当てる。
// email は表示用なのでゲスト時は admin の email をそのまま使う。
async function resolveGuestAdminContext(
  tenantId: string
): Promise<{ adminId: string | null; email: string | null }> {
  const { data } = await supabaseAdmin
    .from("admin_users")
    .select("id, email")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return { adminId: null, email: null };
  return { adminId: data.id, email: data.email };
}

// 管理者の email / admin_users.id をリクエスト内で 1 回だけ解決する。
// Sidebar と NotificationBell の両方から参照されるため cache で重複呼び出しを抑える。
const getAdminContext = cache(
  async (): Promise<{ adminId: string | null; email: string | null }> => {
    const ssr = await createSupabaseServerClient();
    const { data: claimsData } = await ssr.auth.getClaims();
    const email = (claimsData?.claims?.email as string | undefined) ?? null;
    const tenantId = await getTenantId();
    if (!email) {
      if (process.env.DISABLE_AUTH === "1") return resolveGuestAdminContext(tenantId);
      return { adminId: null, email: null };
    }
    const { data: adminRow } = await supabaseAdmin
      .from("admin_users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("email", email.toLowerCase())
      .maybeSingle();
    const adminId = (adminRow as { id: string } | null)?.id ?? null;
    if (!adminId && process.env.DISABLE_AUTH === "1") {
      return resolveGuestAdminContext(tenantId);
    }
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
