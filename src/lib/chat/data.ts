import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  ChatAudience,
  ConversationRow,
  ConversationSummary,
  MessageAttachment,
  MessageRow,
  MessageWithOrderRef,
  OrderRef,
} from "./types";

// 顧客 1 ↔ リース会社 1 の会話を取得。なければ作る。
// (tenant_id, customer_id) UNIQUE 制約があるので、race condition が
// あっても重複行は出来ない（INSERT が conflict → SELECT で取り直し）。
export async function getOrCreateConversation(
  customerId: string,
  tenantId: string
): Promise<ConversationRow> {
  const { data: existing } = await supabaseAdmin
    .from("conversations")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (existing) return existing as ConversationRow;

  const { data, error } = await supabaseAdmin
    .from("conversations")
    .insert({ tenant_id: tenantId, customer_id: customerId })
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      const { data: retry, error: retryErr } = await supabaseAdmin
        .from("conversations")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("customer_id", customerId)
        .single();
      if (retryErr) throw retryErr;
      return retry as ConversationRow;
    }
    throw error;
  }
  if (!data) throw new Error("conversation insert returned no row");
  return data as ConversationRow;
}

export async function getConversationById(
  id: string,
  tenantId: string
): Promise<ConversationRow | null> {
  const { data, error } = await supabaseAdmin
    .from("conversations")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  return (data as ConversationRow) ?? null;
}

export async function listMessages(
  conversationId: string,
  tenantId: string,
  opts: { limit?: number } = {}
): Promise<MessageWithOrderRef[]> {
  const limit = opts.limit ?? 100;
  const { data, error } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as MessageRow[];
  const orderIds = Array.from(
    new Set(rows.map((r) => r.order_id).filter((x): x is string => !!x))
  );
  const orderMap = await fetchOrderRefs(orderIds, tenantId);
  return rows.map((r) => ({
    ...r,
    order_ref: r.order_id ? orderMap.get(r.order_id) ?? null : null,
  }));
}

async function fetchOrderRefs(
  orderIds: string[],
  tenantId: string
): Promise<Map<string, OrderRef>> {
  const map = new Map<string, OrderRef>();
  if (orderIds.length === 0) return map;
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, status")
    .eq("tenant_id", tenantId)
    .in("id", orderIds);
  if (error) throw error;
  for (const o of data ?? []) map.set(o.id, o as OrderRef);
  return map;
}

export type InsertMessageInput = {
  tenantId: string;
  conversationId: string;
  senderType: ChatAudience;
  senderId: string;
  body: string | null;
  attachments: MessageAttachment[];
  orderId: string | null;
  clientRequestId: string | null;
};

export async function insertMessage(
  input: InsertMessageInput
): Promise<{ message: MessageRow; duplicate: boolean }> {
  // client_request_id が指定されていれば、まず既存行を引いて idempotent に振る舞う
  if (input.clientRequestId) {
    const { data: existing } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("conversation_id", input.conversationId)
      .eq("sender_type", input.senderType)
      .eq("sender_id", input.senderId)
      .eq("client_request_id", input.clientRequestId)
      .maybeSingle();
    if (existing) return { message: existing as MessageRow, duplicate: true };
  }

  const { data, error } = await supabaseAdmin
    .from("messages")
    .insert({
      tenant_id: input.tenantId,
      conversation_id: input.conversationId,
      sender_type: input.senderType,
      sender_id: input.senderId,
      body: input.body,
      attachments: input.attachments,
      order_id: input.orderId,
      client_request_id: input.clientRequestId,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505" && input.clientRequestId) {
      const { data: retry, error: retryErr } = await supabaseAdmin
        .from("messages")
        .select("*")
        .eq("tenant_id", input.tenantId)
        .eq("conversation_id", input.conversationId)
        .eq("sender_type", input.senderType)
        .eq("sender_id", input.senderId)
        .eq("client_request_id", input.clientRequestId)
        .single();
      if (retryErr) throw retryErr;
      return { message: retry as MessageRow, duplicate: true };
    }
    throw error;
  }
  return { message: data as MessageRow, duplicate: false };
}

// 受信者が会話を開いた瞬間に呼ぶ。
// 相手 (otherSide) から来たまだ未読のメッセージだけを既読化する。
export async function markConversationRead(
  conversationId: string,
  tenantId: string,
  readerAudience: ChatAudience
): Promise<void> {
  const otherSide: ChatAudience =
    readerAudience === "customer" ? "admin" : "customer";
  const { error } = await supabaseAdmin
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("conversation_id", conversationId)
    .eq("sender_type", otherSide)
    .is("read_at", null);
  if (error) throw error;
}

// 顧客側未読: admin 発の read_at IS NULL を数える
export async function countUnreadForCustomer(
  customerId: string,
  tenantId: string
): Promise<number> {
  const conv = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (conv.error || !conv.data) return 0;
  const { count, error } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("conversation_id", conv.data.id)
    .eq("sender_type", "admin")
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

// 管理側未読: テナント内の customer 発で read_at IS NULL を数える
export async function countUnreadForAdmin(tenantId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("sender_type", "customer")
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

// 管理画面 conversations 一覧: customer 情報 join + per-conversation 未読を付与。
// 件数はテナントあたり高々顧客数（数百規模）なので index 駆動の小規模 join で十分。
export async function listConversationsForAdmin(
  tenantId: string
): Promise<ConversationSummary[]> {
  const { data: convs, error } = await supabaseAdmin
    .from("conversations")
    .select(
      "id, customer_id, last_message_at, last_message_preview, last_message_sender_type"
    )
    .eq("tenant_id", tenantId)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  const rows = convs ?? [];
  if (rows.length === 0) return [];

  const customerIds = rows.map((r) => r.customer_id);
  const { data: customers, error: cErr } = await supabaseAdmin
    .from("customers")
    .select("id, name, company_id")
    .eq("tenant_id", tenantId)
    .in("id", customerIds);
  if (cErr) throw cErr;
  const customerMap = new Map(
    (customers ?? []).map((c) => [c.id, c as { id: string; name: string; company_id: string }])
  );

  // 未読を一括取得（per-conversation, sender_type='customer', read_at IS NULL）
  const { data: unreadRows, error: uErr } = await supabaseAdmin
    .from("messages")
    .select("conversation_id")
    .eq("tenant_id", tenantId)
    .eq("sender_type", "customer")
    .is("read_at", null);
  if (uErr) throw uErr;
  const unreadMap = new Map<string, number>();
  for (const r of unreadRows ?? []) {
    unreadMap.set(r.conversation_id, (unreadMap.get(r.conversation_id) ?? 0) + 1);
  }

  return rows.map((r) => {
    const c = customerMap.get(r.customer_id);
    return {
      id: r.id,
      customer_id: r.customer_id,
      customer_name: c?.name ?? "(不明)",
      customer_company_id: c?.company_id ?? "",
      last_message_at: r.last_message_at,
      last_message_preview: r.last_message_preview,
      last_message_sender_type: r.last_message_sender_type as ChatAudience | null,
      unread_count: unreadMap.get(r.id) ?? 0,
    };
  });
}

// 顧客側ヘッダー用: その顧客の唯一の会話の未読数だけ知りたい
export async function getCustomerChatBadge(
  customerId: string,
  tenantId: string
): Promise<number> {
  return countUnreadForCustomer(customerId, tenantId);
}
