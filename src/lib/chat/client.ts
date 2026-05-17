"use client";

import { enqueueChatMessage, flushChatOutbox } from "@/lib/offline/chat-outbox";
import type { ChatAudience, MessageAttachment } from "./types";

export type SendInput = {
  audience: ChatAudience; // どっち側として送るか (URL 振り分けに使う)
  conversationId?: string;
  customerId?: string;
  body: string;
  attachments: MessageAttachment[];
  orderId: string | null;
  clientRequestId: string;
  tenantId: string;
  // outbox の by-customer index 用。customer 側は自分の id、admin 側は null。
  ownerCustomerId: string | null;
};

export type SendResult =
  | { ok: true; messageId: string; queued?: boolean }
  | { ok: false; error: string };

function sendUrl(audience: ChatAudience): string {
  return audience === "admin"
    ? "/api/chat/admin/messages"
    : "/api/chat/customer/messages";
}

// オンラインなら直接送信、ネットワーク不可なら outbox に積む。
// client_request_id でサーバ側 idempotent なので、両ルートで二重投稿にならない。
export async function sendChatMessage(input: SendInput): Promise<SendResult> {
  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
  const payload = {
    conversationId: input.conversationId,
    customerId: input.customerId,
    body: input.body,
    attachments: input.attachments,
    orderId: input.orderId,
    clientRequestId: input.clientRequestId,
  };

  if (!isOffline) {
    try {
      const res = await fetch(sendUrl(input.audience), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; message?: { id: string }; error?: string }
        | null;
      if (res.ok && json?.ok && json.message) {
        return { ok: true, messageId: json.message.id };
      }
      if (res.status >= 500 || !json) {
        await enqueueChatMessage({
          audience: input.audience,
          tenantId: input.tenantId,
          customerId: input.ownerCustomerId,
          payload,
        });
        void flushChatOutbox();
        return { ok: true, messageId: input.clientRequestId, queued: true };
      }
      return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    } catch {
      await enqueueChatMessage({
        audience: input.audience,
        tenantId: input.tenantId,
        customerId: input.ownerCustomerId,
        payload,
      });
      return { ok: true, messageId: input.clientRequestId, queued: true };
    }
  }

  await enqueueChatMessage({
    audience: input.audience,
    tenantId: input.tenantId,
    customerId: input.ownerCustomerId,
    payload,
  });
  return { ok: true, messageId: input.clientRequestId, queued: true };
}
