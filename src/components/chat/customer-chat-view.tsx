"use client";

import { useEffect, useRef, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import MessageBubble, { type BubbleMessage } from "./message-bubble";
import ChatComposer from "./chat-composer";
import { sendChatMessage } from "@/lib/chat/client";
import type { MessageAttachment, OrderRef } from "@/lib/chat/types";
import type { SignedAttachment } from "@/lib/chat/sign-attachments";
import { getRealtimeToken } from "@/lib/realtime-token-client";

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

  // 既読化: 相手 (admin) からの未読が存在するときだけ POST。
  // displayMessages.length に依らず、未読の有無で判定する → 不要な request を抑える。
  // ナビゲーションの「連絡」バッジは useLiveChatUnread の realtime UPDATE 監視で
  // 自前に追従するため、router.refresh() で layout を再 fetch する必要は無い。
  const hasUnreadFromOther = displayMessages.some(
    (m) => m.sender_type === "admin" && !m.read_at
  );
  useEffect(() => {
    if (!hasUnreadFromOther) return;
    fetch(`/api/chat/customer/conversations/${conversationId}/read`, {
      method: "POST",
      cache: "no-store",
    }).catch(() => {});
  }, [conversationId, hasUnreadFromOther]);

  useEffect(() => {
    let cancelled = false;
    let supabase: SupabaseClient | null = null;
    let channel: ReturnType<SupabaseClient["channel"]> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    async function fetchToken(): Promise<TokenResponse | null> {
      return getRealtimeToken("/api/chat/realtime-token") as Promise<TokenResponse | null>;
    }

    // 単発 enrichment：realtime INSERT を受けてから add 済みの stub を
    // 「order_ref + signed attachments 付き」に in-place で差し替える。
    async function enrichSingle(messageId: string): Promise<void> {
      try {
        const res = await fetch(`/api/chat/customer/messages/${messageId}/enrich`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { ok?: boolean; enriched?: BubbleMessage };
        if (!json.ok || !json.enriched) return;
        if (cancelled) return;
        const enriched = json.enriched;
        setExtras((prev) =>
          prev.map((e) => (e.id === enriched.id ? enriched : e))
        );
      } catch {
        /* fallback: 何もしない。次の navigation で server から取り直される */
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
            // 添付や発注引用がある場合は単発 enrichment エンドポイントで該当 1 件だけを
            // 取りに行く。layout も含めて RSC ツリー全体を再 fetch していた router.refresh
            // を置き換える狙い。
            if ((row.attachments?.length ?? 0) > 0 || row.order_id) {
              void enrichSingle(row.id);
            }
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
  }, [conversationId]);

  async function handleSend(input: {
    body: string;
    attachments: MessageAttachment[];
    orderId: string | null;
  }): Promise<void> {
    const clientRequestId = genId();
    // 楽観的表示: 即座に送信中の吹き出しを extras に積む。
    // server から real id が返ってきたら id を差し替えて重複表示を避ける。
    const tempId = `temp_${clientRequestId}`;
    const optimistic: BubbleMessage = {
      id: tempId,
      sender_type: "customer",
      body: input.body,
      attachments: input.attachments.map<SignedAttachment>((a) => ({ ...a, url: null })),
      order_ref: null,
      created_at: new Date().toISOString(),
      read_at: null,
    };
    setExtras((prev) => [...prev, optimistic]);

    const result = await sendChatMessage({
      audience: "customer",
      conversationId,
      body: input.body,
      attachments: input.attachments,
      orderId: input.orderId,
      clientRequestId,
      tenantId,
      ownerCustomerId: customerId,
    });
    if (!result.ok) {
      setExtras((prev) => prev.filter((e) => e.id !== tempId));
      throw new Error(result.error);
    }
    // realtime が同じ realId の INSERT を配信してきたとき重複しないよう、
    // rename と同時に known 集合へ入れておく（useEffect の同期を待たない）。
    knownIdsRef.current.add(result.messageId);
    // 実 id に差し替え。サーバが enriched (order_ref + signed attachments) を
    // 返したらそれで stub を内容ごと置換し、router.refresh() を不要にする。
    setExtras((prev) =>
      prev.map((e) =>
        e.id === tempId
          ? result.enriched ?? { ...e, id: result.messageId }
          : e
      )
    );
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
                orderLinkPrefix="/rentals"
              />
            );
          })
        )}
      </div>

      <ChatComposer
        onSend={handleSend}
        quoted={quoted}
        onClearQuoted={() => setQuoted(null)}
        uploadUrl="/api/chat/customer/uploads"
      />
    </div>
  );
}
