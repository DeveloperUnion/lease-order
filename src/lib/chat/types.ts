export type ChatAudience = "customer" | "admin";

export type MessageAttachment = {
  path: string;
  name: string;
  mime: string;
  size: number;
};

export type ConversationRow = {
  id: string;
  tenant_id: string;
  customer_id: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_type: ChatAudience | null;
  created_at: string;
};

export type MessageRow = {
  id: string;
  tenant_id: string;
  conversation_id: string;
  sender_type: ChatAudience;
  sender_id: string;
  body: string | null;
  attachments: MessageAttachment[];
  order_id: string | null;
  client_request_id: string | null;
  read_at: string | null;
  created_at: string;
};

export type ConversationSummary = {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_company_id: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_type: ChatAudience | null;
  unread_count: number;
};

export type OrderRef = {
  id: string;
  order_number: string;
  status: string;
};

export type MessageWithOrderRef = MessageRow & {
  order_ref: OrderRef | null;
};
