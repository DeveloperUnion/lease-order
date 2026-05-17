import { getTenantId } from "@/lib/tenant";
import {
  getConversationById,
  getOrCreateConversation,
  listConversationsForAdmin,
  listMessages,
} from "@/lib/chat/data";
import { signAttachments } from "@/lib/chat/sign-attachments";
import { getTenantDisplayName } from "@/lib/chat/sender";
import { supabaseAdmin } from "@/lib/supabase-admin";
import AdminChatScreen from "@/components/chat/admin-chat-screen";
import type { BubbleMessage } from "@/components/chat/message-bubble";
import type { OrderRef } from "@/lib/chat/types";

export const dynamic = "force-dynamic";

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ cid?: string; orderId?: string }>;
}) {
  const tenantId = await getTenantId();
  const tenantDisplayName = await getTenantDisplayName(tenantId);
  const conversations = await listConversationsForAdmin(tenantId);

  const sp = await searchParams;
  let selected: Parameters<typeof AdminChatScreen>[0]["selected"] = null;

  // orderId が来たら order → customer → conversation を逆引きして、その顧客の
  // 会話を選択状態かつ「この発注について」引用付きで開く。cid が同時に来ていても
  // orderId 優先（発注詳細から飛んできた強い意図を優先）。
  let initialOrderQuote: OrderRef | null = null;
  let resolvedConvId: string | null = null;

  if (sp.orderId) {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, status, customer_id")
      .eq("id", sp.orderId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (order) {
      const conv = await getOrCreateConversation(order.customer_id, tenantId);
      resolvedConvId = conv.id;
      initialOrderQuote = {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
      };
    }
  } else if (sp.cid) {
    resolvedConvId = sp.cid;
  }

  if (resolvedConvId) {
    const conv = await getConversationById(resolvedConvId, tenantId);
    if (conv) {
      const { data: customer } = await supabaseAdmin
        .from("customers")
        .select("name")
        .eq("id", conv.customer_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const messages = await listMessages(conv.id, tenantId);
      const bubbleMessages: BubbleMessage[] = await Promise.all(
        messages.map(async (m) => ({
          id: m.id,
          sender_type: m.sender_type,
          body: m.body,
          attachments: await signAttachments(m.attachments),
          order_ref: m.order_ref,
          created_at: m.created_at,
          read_at: m.read_at,
        }))
      );
      selected = {
        conversationId: conv.id,
        customerId: conv.customer_id,
        customerName: customer?.name ?? "(不明)",
        initialMessages: bubbleMessages,
        initialOrderQuote,
      };
    }
  }

  return (
    <AdminChatScreen
      conversations={conversations}
      selected={selected}
      tenantId={tenantId}
      tenantDisplayName={tenantDisplayName}
    />
  );
}
