"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import MessageBubble, { type BubbleMessage } from "./message-bubble";
import ChatComposer from "./chat-composer";
import { sendChatMessage } from "@/lib/chat/client";
import type { MessageAttachment, OrderRef } from "@/lib/chat/types";
import type { SignedAttachment } from "@/lib/chat/sign-attachments";

type TokenResponse = {
  jwt: string;
  expiresAt: number;
  tenantId: string;
  recipientId: string;
  audience: "admin" | "customer";
};

type Props = {
  conversationId: string;
  customerId: string;
  tenantId: string;
  tenantDisplayName: string;
  customerName: string;
  initialMessages: BubbleMessage[];
  initialOrderQuote: OrderRef | null;
};

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function CustomerChatView({
  conversationId,
  customerId,
  tenantId,
  tenantDisplayName,
  customerName,
  initialMessages,
  initialOrderQuote,
}: Props) {
  const router = useRouter();
  const [extras, setExtras] = useState<BubbleMessage[]>([]);
  const [serverMessages, setServerMessages] = useState(initialMessages);
  const [quoted, setQuoted] = useState<OrderRef | null>(initialOrderQuote);
  const scrollRef = useRef<HTMLDivElement>(null);
  const knownIdsRef = useRef<Set<string>>(new Set(initialMessages.map((m) => m.id)));

  // server から refresh された messages を反映し、extras から重複を取り除く。
  // React 19 の「props 変化に応じた state 同期」パターン。setState はバッチされる。
  if (serverMessages !== initialMessages) {
    setServerMessages(initialMessages);
    const ids = new Set(initialMessages.map((m) => m.id));
    setExtras((prev) => prev.filter((e) => !ids.has(e.id)));
  }

  const displayMessages = [...serverMessages, ...extras];

  // knownIds は realtime ハンドラ専用なので、render 中に書かず effect で同期する。
  useEffect(() => {
    knownIdsRef.current = new Set([
      ...initialMessages.map((m) => m.id),
      ...extras.map((m) => m.id),
    ]);
  }, [initialMessages, extras]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [displayMessages.length]);

  useEffect(() => {
    fetch(`/api/chat/conversations/${conversationId}/read`, {
      method: "POST",
      cache: "no-store",
    }).catch(() => {});
  }, [conversationId, displayMessages.length]);

  useEffect(() => {
    let cancelled = false;
    let supabase: SupabaseClient | null = null;
    let channel: ReturnType<SupabaseClient["channel"]> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    async function fetchToken(): Promise<TokenResponse | null> {
      try {
        const res = await fetch("/api/chat/realtime-token", { cache: "no-store" });
        if (!res.ok) return null;
        return (await res.json()) as TokenResponse;
      } catch {
        return null;
      }
    }

    function scheduleNext(expiresAt: number) {
      const msUntilRefresh = Math.max(30_000, (expiresAt - 60) * 1000 - Date.now());
      refreshTimer = setTimeout(async () => {
        const next = await fetchToken();
        if (!next || cancelled || !supabase) return;
        supabase.realtime.setAuth(next.jwt);
        scheduleNext(next.expiresAt);
      }, msUntilRefresh);
    }

    async function setup() {
      const token = await fetchToken();
      if (!token || cancelled) return;
      supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token.jwt}` } },
        }
      );
      supabase.realtime.setAuth(token.jwt);
      channel = supabase
        .channel(`chat:${conversationId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            const row = payload.new as {
              id: string;
              body: string | null;
              attachments: MessageAttachment[];
              order_id: string | null;
              created_at: string;
              read_at: string | null;
              sender_type: "customer" | "admin";
            };
            if (knownIdsRef.current.has(row.id)) return;
            knownIdsRef.current.add(row.id);
            const stub: BubbleMessage = {
              id: row.id,
              sender_type: row.sender_type,
              body: row.body,
              attachments: (row.attachments ?? []).map<SignedAttachment>((a) => ({
                ...a,
                url: null,
              })),
              order_ref: null,
              created_at: row.created_at,
              read_at: row.read_at,
            };
            setExtras((prev) => [...prev, stub]);
            router.refresh();
          }
        )
        .subscribe();
      scheduleNext(token.expiresAt);
    }

    setup();
    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [conversationId, router]);

  async function handleSend(input: {
    body: string;
    attachments: MessageAttachment[];
    orderId: string | null;
  }): Promise<void> {
    const clientRequestId = genId();
    const result = await sendChatMessage({
      conversationId,
      body: input.body,
      attachments: input.attachments,
      orderId: input.orderId,
      clientRequestId,
      tenantId,
      ownerCustomerId: customerId,
    });
    if (!result.ok) throw new Error(result.error);
    router.refresh();
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] md:h-[calc(100dvh-4rem)]">
      <div className="px-4 py-3 border-b border-border bg-surface">
        <h1 className="text-sm font-semibold text-foreground">{tenantDisplayName}との連絡</h1>
        <p className="text-xs text-subtle mt-0.5">{customerName}</p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3 bg-canvas">
        {displayMessages.length === 0 ? (
          <div className="text-center text-sm text-subtle py-12">
            まだメッセージはありません
            <br />
            返却日の変更や受け取りの相談などをお送りください
          </div>
        ) : (
          displayMessages.map((m) => {
            const mine = m.sender_type === "customer";
            return (
              <MessageBubble
                key={m.id}
                msg={m}
                mine={mine}
                senderLabel={mine ? customerName : `${tenantDisplayName}より`}
                orderLinkPrefix="/orders"
              />
            );
          })
        )}
      </div>

      <ChatComposer
        onSend={handleSend}
        quoted={quoted}
        onClearQuoted={() => setQuoted(null)}
      />
    </div>
  );
}
