"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import MessageBubble, { type BubbleMessage } from "./message-bubble";
import ChatComposer from "./chat-composer";
import { sendChatMessage } from "@/lib/chat/client";
import type { ConversationSummary, MessageAttachment } from "@/lib/chat/types";
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const knownIdsRef = useRef<Set<string>>(new Set(initialFromProp.map((m) => m.id)));

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
  // 念のため refresh は呼ばない (サイドバーの未読バッジは next navigation で更新される)。
  const hasUnreadFromCustomer = displayMessages.some(
    (m) => m.sender_type === "customer" && !m.read_at
  );
  useEffect(() => {
    if (!selectedId || !hasUnreadFromCustomer) return;
    fetch(`/api/chat/conversations/${selectedId}/read`, {
      method: "POST",
      cache: "no-store",
    }).catch(() => {});
  }, [selectedId, hasUnreadFromCustomer]);

  // Realtime: テナント全体の INSERT を 1 本のチャンネルで受け、
  //   - 選択中の会話なら extras に積む
  //   - それ以外は debounce 付きで一覧 (server) を refresh
  // 連投時の二重 refresh を避ける目的。
  useEffect(() => {
    let cancelled = false;
    let supabase: SupabaseClient | null = null;
    let channel: ReturnType<SupabaseClient["channel"]> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let listRefreshTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleListRefresh() {
      if (listRefreshTimer) clearTimeout(listRefreshTimer);
      // 3 秒以内の連投は 1 回にまとめる
      listRefreshTimer = setTimeout(() => router.refresh(), 3000);
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
        .channel(`chat-tenant:${tenantId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `tenant_id=eq.${tenantId}`,
          },
          (payload) => {
            const row = payload.new as {
              id: string;
              conversation_id: string;
              body: string | null;
              attachments: MessageAttachment[];
              order_id: string | null;
              created_at: string;
              read_at: string | null;
              sender_type: "customer" | "admin";
            };

            const isCurrent = selectedId && row.conversation_id === selectedId;
            if (isCurrent && !knownIdsRef.current.has(row.id)) {
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
              // 添付や注文引用がある場合のみ refresh で signed URL / order_ref を取りに行く
              if ((row.attachments?.length ?? 0) > 0 || row.order_id) {
                scheduleListRefresh();
              }
            } else {
              // 別の会話 → 一覧の last_message_at / 未読バッジを更新
              scheduleListRefresh();
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
    setExtras((prev) =>
      prev.map((e) => (e.id === tempId ? { ...e, id: result.messageId } : e))
    );
    if (input.attachments.length > 0 || input.orderId) {
      router.refresh();
    }
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
              quoted={null}
              onClearQuoted={() => {}}
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
