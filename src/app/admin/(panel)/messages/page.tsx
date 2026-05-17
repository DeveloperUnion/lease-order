import { getTenantId } from "@/lib/tenant";
import {
  getConversationById,
  listConversationsForAdmin,
  listMessages,
} from "@/lib/chat/data";
import { signAttachments } from "@/lib/chat/sign-attachments";
import { getTenantDisplayName } from "@/lib/chat/sender";
import { supabaseAdmin } from "@/lib/supabase-admin";
import AdminChatScreen from "@/components/chat/admin-chat-screen";
import type { BubbleMessage } from "@/components/chat/message-bubble";

export const dynamic = "force-dynamic";

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ cid?: string }>;
}) {
  const tenantId = await getTenantId();
  const tenantDisplayName = await getTenantDisplayName(tenantId);
  const conversations = await listConversationsForAdmin(tenantId);

  const sp = await searchParams;
  let selected: Parameters<typeof AdminChatScreen>[0]["selected"] = null;

  if (sp.cid) {
    const conv = await getConversationById(sp.cid, tenantId);
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
