import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createSupabaseServerClient } from "./supabase-server";
import { supabaseAdmin } from "./supabase-admin";
import {
  countUnreadForAdmin,
  listNotificationsForAdmin,
  type NotificationRow,
} from "./notifications-data";
import { countUnreadForAdmin as countChatUnreadForAdmin } from "./chat/data";
import { getTenantId } from "./tenant";

export type SidebarData = {
  pendingCount: number;
  pendingRequestCount: number;
  chatUnreadCount: number;
  email: string | null;
};

export type NotificationBellData = {
  unreadCount: number;
  recent: NotificationRow[];
};

// 管理者の email / admin_users.id をリクエスト内で 1 回だけ解決する。
// Sidebar と NotificationBell の両方から参照されるため cache で重複呼び出しを抑える。
// 管理者は常時認証必須なので、Auth セッションが無ければ null。
const getAdminContext = cache(
  async (): Promise<{ adminId: string | null; email: string | null }> => {
    const ssr = await createSupabaseServerClient();
    const { data: claimsData } = await ssr.auth.getClaims();
    const email = (claimsData?.claims?.email as string | undefined) ?? null;
    if (!email) return { adminId: null, email: null };
    const tenantId = await getTenantId();
    const { data: adminRow } = await supabaseAdmin
      .from("admin_users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("email", email.toLowerCase())
      .maybeSingle();
    const adminId = (adminRow as { id: string } | null)?.id ?? null;
    return { adminId, email };
  }
);

// サイドバーの badge は次のような特性を持つ:
//   - pending 系の発注・申請: 数秒以内の変化はリアルタイム性が要らない
//   - chat 未読: useLiveChatUnread が realtime で追従するので初期値が多少 stale でも OK
// よって per-tenant key で短時間 unstable_cache をかけ、navigation/router.refresh で
// 連発した layout 再 fetch を実質的に in-memory で吸収する。tag invalidation は使わず
// TTL のみ — 10 秒の遅延は MVP 段階で許容できる範囲。
const getCachedSidebarCounts = unstable_cache(
  async (tenantId: string) => {
    const [pendingOrdersRes, returnsRes, extensionsRes, chatUnreadCount] = await Promise.all([
      supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "pending"),
      supabaseAdmin
        .from("return_requests")
        .select("status, order_items!inner(order_id)")
        .eq("tenant_id", tenantId)
        .in("status", ["pending", "scheduled"]),
      supabaseAdmin
        .from("lease_extensions")
        .select("order_items!inner(order_id)")
        .eq("tenant_id", tenantId)
        .eq("status", "pending"),
      countChatUnreadForAdmin(tenantId),
    ]);
    const orderIds = new Set<string>();
    for (const row of (returnsRes.data ?? []) as unknown as Array<{
      order_items: { order_id: string } | null;
    }>) {
      if (row.order_items?.order_id) orderIds.add(row.order_items.order_id);
    }
    for (const row of (extensionsRes.data ?? []) as unknown as Array<{
      order_items: { order_id: string } | null;
    }>) {
      if (row.order_items?.order_id) orderIds.add(row.order_items.order_id);
    }
    return {
      pendingCount: pendingOrdersRes.count ?? 0,
      pendingRequestCount: orderIds.size,
      chatUnreadCount,
    };
  },
  ["admin-sidebar-counts"],
  { revalidate: 10 }
);

export async function getSidebarData(): Promise<SidebarData> {
  const tenantId = await getTenantId();
  const [counts, ctx] = await Promise.all([
    getCachedSidebarCounts(tenantId),
    getAdminContext(),
  ]);
  return {
    pendingCount: counts.pendingCount,
    pendingRequestCount: counts.pendingRequestCount,
    chatUnreadCount: counts.chatUnreadCount,
    email: ctx.email,
  };
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
