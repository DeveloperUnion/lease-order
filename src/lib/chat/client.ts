"use client";

import { enqueueChatMessage, flushChatOutbox } from "@/lib/offline/chat-outbox";
import type { MessageAttachment } from "./types";

export type SendInput = {
  conversationId?: string;
  customerId?: string;
  body: string;
  attachments: MessageAttachment[];
  orderId: string | null;
  clientRequestId: string;
  tenantId: string;
  // 顧客 UI からは自分の customerId、admin UI からは送信先 customerId を渡す。
  // outbox の by-customer index 用。
  ownerCustomerId: string | null;
};

export type SendResult =
  | { ok: true; messageId: string; queued?: boolean }
  | { ok: false; error: string };

// オンラインなら直接送信、ネットワーク不可なら outbox に積む。
// いずれの場合も client_request_id でサーバ側 idempotent なので二重投稿にならない。
export async function sendChatMessage(input: SendInput): Promise<SendResult> {
  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

  if (!isOffline) {
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: input.conversationId,
          customerId: input.customerId,
          body: input.body,
          attachments: input.attachments,
          orderId: input.orderId,
          clientRequestId: input.clientRequestId,
        }),
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; message?: { id: string }; error?: string }
        | null;
      if (res.ok && json?.ok && json.message) {
        return { ok: true, messageId: json.message.id };
      }
      // 5xx は outbox に逃がす。4xx は明確な失敗として返す。
      if (res.status >= 500 || !json) {
        await enqueueChatMessage({
          tenantId: input.tenantId,
          customerId: input.ownerCustomerId,
          payload: {
            conversationId: input.conversationId,
            customerId: input.customerId,
            body: input.body,
            attachments: input.attachments,
            orderId: input.orderId,
            clientRequestId: input.clientRequestId,
          },
        });
        // 復帰時の自動再送を仕掛ける
        void flushChatOutbox();
        return { ok: true, messageId: input.clientRequestId, queued: true };
      }
      return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    } catch {
      // ネットワーク失敗 → outbox に逃がす
      await enqueueChatMessage({
        tenantId: input.tenantId,
        customerId: input.ownerCustomerId,
        payload: {
          conversationId: input.conversationId,
          customerId: input.customerId,
          body: input.body,
          attachments: input.attachments,
          orderId: input.orderId,
          clientRequestId: input.clientRequestId,
        },
      });
      return { ok: true, messageId: input.clientRequestId, queued: true };
    }
  }

  // 完全オフライン: 直接 outbox へ
  await enqueueChatMessage({
    tenantId: input.tenantId,
    customerId: input.ownerCustomerId,
    payload: {
      conversationId: input.conversationId,
      customerId: input.customerId,
      body: input.body,
      attachments: input.attachments,
      orderId: input.orderId,
      clientRequestId: input.clientRequestId,
    },
  });
  return { ok: true, messageId: input.clientRequestId, queued: true };
}
