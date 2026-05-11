import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import type { NotificationRow } from "./notifications/display";

export type { NotificationRow } from "./notifications/display";
export {
  labelForNotification,
  linkForNotification,
} from "./notifications/display";

type Recipient =
  | { type: "customer"; customerId: string; tenantId: string }
  | { type: "admin"; adminUserId: string; tenantId: string };

async function list(
  recipient: Recipient,
  limit: number
): Promise<NotificationRow[]> {
  const recipientId =
    recipient.type === "customer" ? recipient.customerId : recipient.adminUserId;
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("id, kind, order_id, payload, read_at, created_at")
    .eq("tenant_id", recipient.tenantId)
    .eq("recipient_type", recipient.type)
    .eq("recipient_id", recipientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

async function countUnread(recipient: Recipient): Promise<number> {
  const recipientId =
    recipient.type === "customer" ? recipient.customerId : recipient.adminUserId;
  const { count, error } = await supabaseAdmin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", recipient.tenantId)
    .eq("recipient_type", recipient.type)
    .eq("recipient_id", recipientId)
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function listNotificationsForCustomer(
  customerId: string,
  tenantId: string,
  limit = 50
): Promise<NotificationRow[]> {
  return list({ type: "customer", customerId, tenantId }, limit);
}

export async function listNotificationsForAdmin(
  adminUserId: string,
  tenantId: string,
  limit = 50
): Promise<NotificationRow[]> {
  return list({ type: "admin", adminUserId, tenantId }, limit);
}

export async function countUnreadForCustomer(
  customerId: string,
  tenantId: string
): Promise<number> {
  return countUnread({ type: "customer", customerId, tenantId });
}

export async function countUnreadForAdmin(
  adminUserId: string,
  tenantId: string
): Promise<number> {
  return countUnread({ type: "admin", adminUserId, tenantId });
}

export async function markRead(
  ids: string[],
  recipient: Recipient
): Promise<void> {
  if (ids.length === 0) return;
  const recipientId =
    recipient.type === "customer" ? recipient.customerId : recipient.adminUserId;
  const { error } = await supabaseAdmin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids)
    .eq("tenant_id", recipient.tenantId)
    .eq("recipient_type", recipient.type)
    .eq("recipient_id", recipientId)
    .is("read_at", null);
  if (error) throw error;
}

export async function markAllRead(recipient: Recipient): Promise<void> {
  const recipientId =
    recipient.type === "customer" ? recipient.customerId : recipient.adminUserId;
  const { error } = await supabaseAdmin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("tenant_id", recipient.tenantId)
    .eq("recipient_type", recipient.type)
    .eq("recipient_id", recipientId)
    .is("read_at", null);
  if (error) throw error;
}

