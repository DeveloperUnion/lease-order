import { requireCustomer } from "@/lib/customer-auth";
import {
  getOrCreateConversation,
  listMessages,
} from "@/lib/chat/data";
import { signAttachments } from "@/lib/chat/sign-attachments";
import { getTenantDisplayName } from "@/lib/chat/sender";
import { supabaseAdmin } from "@/lib/supabase-admin";
import CustomerChatView from "@/components/chat/customer-chat-view";
import type { BubbleMessage } from "@/components/chat/message-bubble";
import type { OrderRef } from "@/lib/chat/types";

export const dynamic = "force-dynamic";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const customer = await requireCustomer();
  const conv = await getOrCreateConversation(customer.id, customer.tenant_id);
  const tenantDisplayName = await getTenantDisplayName(customer.tenant_id);
  const messages = await listMessages(conv.id, customer.tenant_id);

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

  const sp = await searchParams;
  let initialOrderQuote: OrderRef | null = null;
  if (sp.orderId) {
    const { data } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, status")
      .eq("id", sp.orderId)
      .eq("tenant_id", customer.tenant_id)
      .eq("customer_id", customer.id)
      .maybeSingle();
    if (data) initialOrderQuote = data as OrderRef;
  }

  return (
    <CustomerChatView
      conversationId={conv.id}
      customerId={customer.id}
      tenantId={customer.tenant_id}
      tenantDisplayName={tenantDisplayName}
      customerName={customer.name}
      initialMessages={bubbleMessages}
      initialOrderQuote={initialOrderQuote}
    />
  );
}
