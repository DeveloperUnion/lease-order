"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import MessageBubble, { type BubbleMessage } from "./message-bubble";
import ChatComposer from "./chat-composer";
import { sendChatMessage } from "@/lib/chat/client";
import type {
  ConversationSummary,
  MessageAttachment,
  OrderRef,
} from "@/lib/chat/types";
import type { SignedAttachment } from "@/lib/chat/sign-attachments";

type TokenResponse = {
  jwt: string;
  expiresAt: number;
  tenantId: string;
  recipientId: string;
  audience: "admin" | "customer";
};

type Props = {
  conversations: ConversationSummary[];
  selected: {
    conversationId: string;
    customerId: string;
    customerName: string;
    initialMessages: BubbleMessage[];
    initialOrderQuote: OrderRef | null;
  } | null;
  tenantId: string;
  tenantDisplayName: string;
};

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const diff = Math.floor((Date.now() - t) / 1000);
  if (diff < 60) return "今";
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}日前`;
  return new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

export default function AdminChatScreen({
  conversations,
  selected,
  tenantId,
  tenantDisplayName,
}: Props) {
  const router = useRouter();
  const selectedId = selected?.conversationId ?? null;
  const [extras, setExtras] = useState<BubbleMessage[]>([]);
  const initialFromProp = useMemo(
    () => selected?.initialMessages ?? [],
    [selected]
  );
  const [serverMessages, setServerMessages] = useState<BubbleMessage[]>(initialFromProp);
  const [quoted, setQuoted] = useState<OrderRef | null>(selected?.initialOrderQuote ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const knownIdsRef = useRef<Set<string>>(new Set(initialFromProp.map((m) => m.id)));
  const prevSelectedIdRef = useRef<string | null>(selectedId);

  // 会話切替時は extras を捨てる。BubbleMessage は conversation_id を持たないため、
  // 「server に id がないもの」フィルタだと前の会話の optimistic stub が次の会話に
  // 混じってしまう（送信直後に別の顧客を選ぶと吹き出しが付いてくる現象）。
  // 同時に「この発注について」引用も新しい selected のものに差し替える。
  if (prevSelectedIdRef.current !== selectedId) {
    prevSelectedIdRef.current = selectedId;
    setExtras([]);
    setQuoted(selected?.initialOrderQuote ?? null);
    knownIdsRef.current = new Set(initialFromProp.map((m) => m.id));
  }

  if (serverMessages !== initialFromProp) {
    setServerMessages(initialFromProp);
    const ids = new Set(initialFromProp.map((m) => m.id));
    setExtras((prev) => prev.filter((e) => !ids.has(e.id)));
  }

  const displayMessages = [...serverMessages, ...extras];

  useEffect(() => {
    knownIdsRef.current = new Set([
      ...initialFromProp.map((m) => m.id),
      ...extras.map((m) => m.id),
    ]);
  }, [initialFromProp, extras]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [displayMessages.length, selectedId]);

  // 既読化: customer 発の未読が存在するときだけ POST。
  // サイドバーの「メッセージ」バッジは useLiveChatUnread が realtime UPDATE を
  // 拾って自前に追従するので router.refresh は不要。
  const hasUnreadFromCustomer = displayMessages.some(
    (m) => m.sender_type === "customer" && !m.read_at
  );
  useEffect(() => {
    if (!selectedId || !hasUnreadFromCustomer) return;
    fetch(`/api/chat/admin/conversations/${selectedId}/read`, {
      method: "POST",
      cache: "no-store",
    }).catch(() => {});
  }, [selectedId, hasUnreadFromCustomer]);

  // Realtime: selectedId の有無で channel を切り替える。
  //   - 選択中: chat-conv:<cid> (conversation_id filter) のみ subscribe。
  //     他会話の INSERT が JS callback を走らせ続けるのを止める。
  //   - 未選択 (一覧表示): chat-tenant:<tid> (tenant_id filter) のみ subscribe し、
  //     新着があれば debounce で list を refresh。
  // 会話中の cross-conv 通知は親 layout の useLiveChatUnread が単独 subscription で拾うため、
  // サイドバーの「メッセージ」バッジは ここを切ったまま realtime で更新される。
  useEffect(() => {
    let cancelled = false;
    let supabase: SupabaseClient | null = null;
    let channel: ReturnType<SupabaseClient["channel"]> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let listRefreshTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleListRefresh() {
      if (listRefreshTimer) clearTimeout(listRefreshTimer);
      // 連投を 1 回にまとめつつ、体感はほぼ realtime に近づける。
      // 以前は 3 秒で「届くのが遅い」と感じられたため短縮。
      listRefreshTimer = setTimeout(() => router.refresh(), 800);
    }

    async function fetchToken(): Promise<TokenResponse | null> {
      try {
        const res = await fetch("/api/chat/realtime-token", { cache: "no-store" });
        if (!res.ok) return null;
        return (await res.json()) as TokenResponse;
      } catch {
        return null;
      }
    }

    // 開いている会話の realtime stub を「order_ref + signed attachments 付き」へ
    // in-place 差し替え。layout 込みの router.refresh を避ける狙い。
    async function enrichSingle(messageId: string): Promise<void> {
      try {
        const res = await fetch(`/api/chat/admin/messages/${messageId}/enrich`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { ok?: boolean; enriched?: BubbleMessage };
        if (!json.ok || !json.enriched) return;
        if (cancelled) return;
        const enriched = json.enriched;
        setExtras((prev) => prev.map((e) => (e.id === enriched.id ? enriched : e)));
      } catch {
        /* fallback: 何もしない */
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

      type MessageRowPayload = {
        id: string;
        conversation_id: string;
        body: string | null;
        attachments: MessageAttachment[];
        order_id: string | null;
        created_at: string;
        read_at: string | null;
        sender_type: "customer" | "admin";
      };

      if (selectedId) {
        // 会話 view: 選択中の会話のみ subscribe。
        // 他会話の INSERT は親 layout の useLiveChatUnread が拾うのでここでは無視。
        channel = supabase
          .channel(`chat-conv:${selectedId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "messages",
              filter: `conversation_id=eq.${selectedId}`,
            },
            (payload) => {
              const row = payload.new as MessageRowPayload;
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
              if ((row.attachments?.length ?? 0) > 0 || row.order_id) {
                void enrichSingle(row.id);
              }
            }
          )
          .subscribe();
      } else {
        // 会話一覧 view: テナント内全 INSERT を受け、一覧 (last_message_at / preview /
        // per-conv 未読) を debounce で server から取り直す。
        channel = supabase
          .channel(`chat-tenant:${tenantId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "messages",
              filter: `tenant_id=eq.${tenantId}`,
            },
            () => {
              scheduleListRefresh();
            }
          )
          .subscribe();
      }

      scheduleNext(token.expiresAt);
    }

    setup();
    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (listRefreshTimer) clearTimeout(listRefreshTimer);
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [tenantId, selectedId, router]);

  async function handleSend(input: {
    body: string;
    attachments: MessageAttachment[];
    orderId: string | null;
  }): Promise<void> {
    if (!selected) return;
    const clientRequestId = genId();
    const tempId = `temp_${clientRequestId}`;
    const optimistic: BubbleMessage = {
      id: tempId,
      sender_type: "admin",
      body: input.body,
      attachments: input.attachments.map<SignedAttachment>((a) => ({ ...a, url: null })),
      order_ref: null,
      created_at: new Date().toISOString(),
      read_at: null,
    };
    setExtras((prev) => [...prev, optimistic]);

    const result = await sendChatMessage({
      audience: "admin",
      conversationId: selected.conversationId,
      body: input.body,
      attachments: input.attachments,
      orderId: input.orderId,
      clientRequestId,
      tenantId,
      ownerCustomerId: null,
    });
    if (!result.ok) {
      setExtras((prev) => prev.filter((e) => e.id !== tempId));
      throw new Error(result.error);
    }
    // realtime が同じ realId の INSERT を配信してきたとき重複しないよう、
    // rename と同時に known 集合へ入れておく（useEffect の同期を待たない）。
    knownIdsRef.current.add(result.messageId);
    // 実 id に差し替え。サーバが enriched (order_ref + signed attachments) を返した
    // ものでそのまま stub を置換し、layout 全体 refresh を不要にする。
    setExtras((prev) =>
      prev.map((e) =>
        e.id === tempId
          ? result.enriched ?? { ...e, id: result.messageId }
          : e
      )
    );
  }

  return (
    <div className="flex flex-1 min-h-0 h-full">
      {/* 左: 顧客一覧。モバイル時は選択ありなら非表示 */}
      <aside
        className={`w-full md:w-72 md:border-r md:border-rule overflow-y-auto bg-surface ${
          selectedId ? "hidden md:block" : "block"
        }`}
      >
        <div className="px-4 py-3 border-b border-rule">
          <h2 className="text-sm font-semibold text-foreground">メッセージ</h2>
          <p className="text-xs text-subtle mt-0.5">{tenantDisplayName}</p>
        </div>
        {conversations.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-subtle">
            まだ会話はありません
          </div>
        ) : (
          <ul className="divide-y divide-rule">
            {conversations.map((c) => {
              const active = c.id === selectedId;
              return (
                <li key={c.id}>
                  <Link
                    href={`/admin/messages?cid=${c.id}`}
                    className={`block px-4 py-3 hover:bg-surface-muted transition-colors ${
                      active ? "bg-[var(--color-accent-soft)]" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground truncate flex-1">
                        {c.customer_name}
                      </p>
                      {c.unread_count > 0 && (
                        <span className="font-[family-name:var(--font-mono)] tabular-nums text-[10px] px-1.5 py-0.5 min-w-[20px] text-center bg-[var(--color-status-pending-bg)] text-[var(--color-status-pending-fg)]">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-subtle mt-0.5 truncate">
                      {c.last_message_sender_type === "admin" ? "返信: " : ""}
                      {c.last_message_preview ?? "(メッセージなし)"}
                    </p>
                    <p className="text-[10px] text-subtle mt-0.5">
                      {formatRelative(c.last_message_at)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      {/* 右: 選択中の会話 */}
      <section
        className={`flex-1 min-w-0 flex flex-col ${
          selectedId ? "flex" : "hidden md:flex"
        }`}
      >
        {selected ? (
          <>
            <div className="px-4 py-3 border-b border-rule bg-surface flex items-center gap-2">
              <Link
                href="/admin/messages"
                className="md:hidden inline-flex items-center justify-center h-8 w-8 -ml-1 rounded hover:bg-surface-muted"
                aria-label="戻る"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div>
                <h1 className="text-sm font-semibold text-foreground">{selected.customerName}</h1>
                <p className="text-xs text-subtle mt-0.5">顧客とのメッセージ</p>
              </div>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3 bg-canvas">
              {displayMessages.length === 0 ? (
                <div className="text-center text-sm text-subtle py-12">
                  まだメッセージはありません
                </div>
              ) : (
                displayMessages.map((m) => {
                  const mine = m.sender_type === "admin";
                  return (
                    <MessageBubble
                      key={m.id}
                      msg={m}
                      mine={mine}
                      senderLabel={mine ? `${tenantDisplayName}より` : selected.customerName}
                      orderLinkPrefix="/admin/orders"
                    />
                  );
                })
              )}
            </div>
            <ChatComposer
              onSend={handleSend}
              quoted={quoted}
              onClearQuoted={() => setQuoted(null)}
              uploadUrl="/api/chat/admin/uploads"
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-subtle bg-canvas">
            左の一覧から顧客を選んでください
          </div>
        )}
      </section>
    </div>
  );
}
