"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  labelForNotification,
  linkForNotification,
  type NotificationRow,
} from "@/lib/notifications/display";

type Props = {
  unreadCount: number;
  recent: NotificationRow[];
  audience: "customer" | "admin";
  markRead: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  className?: string;
};

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Math.floor((Date.now() - t) / 1000);
  if (diff < 60) return "今";
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}日前`;
  return new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

type TokenResponse = {
  jwt: string;
  expiresAt: number;
  tenantId: string;
  recipientId: string;
  audience: "admin" | "customer";
};

export default function NotificationBell({
  unreadCount,
  recent,
  audience,
  markRead,
  markAllRead,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // server props を初期値とし、その上に realtime で INSERT を被せる。
  // markRead → revalidatePath/refresh で server props (recent / unreadCount) が更新されたら
  // extras はリセット。render 中の setState は React が同一コミットでまとめてくれるので
  // cascading render は発生しない（useEffect でリセットすると lint で警告される）。
  const [extras, setExtras] = useState<NotificationRow[]>([]);
  const [serverSnapshot, setServerSnapshot] = useState({ unreadCount, recent });
  if (serverSnapshot.unreadCount !== unreadCount || serverSnapshot.recent !== recent) {
    setServerSnapshot({ unreadCount, recent });
    setExtras([]);
  }

  const totalUnread = unreadCount + extras.length;
  const displayRecent = [...extras, ...recent];

  // 既知 ID を realtime handler から参照するための ref。
  // recent が変わるたびに subscription を張り直したくないので deps には含めない。
  const knownIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    knownIdsRef.current = new Set([...recent.map((r) => r.id), ...extras.map((r) => r.id)]);
  }, [recent, extras]);

  // Realtime subscription
  useEffect(() => {
    let cancelled = false;
    let supabase: SupabaseClient | null = null;
    let channel: ReturnType<SupabaseClient["channel"]> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    async function fetchToken(): Promise<TokenResponse | null> {
      try {
        const res = await fetch("/api/notifications/realtime-token", {
          cache: "no-store",
        });
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
      if (token.audience !== audience) return;

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
        .channel(`notif:${token.recipientId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${token.recipientId}`,
          },
          (payload) => {
            const row = payload.new as NotificationRow & {
              recipient_type?: string;
              tenant_id?: string;
            };
            if (row.recipient_type && row.recipient_type !== audience) return;
            if (row.tenant_id && row.tenant_id !== token.tenantId) return;
            if (knownIdsRef.current.has(row.id)) return;
            setExtras((prev) => [row, ...prev]);
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
  }, [audience]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleItemClick(row: NotificationRow) {
    setOpen(false);
    if (!row.read_at) {
      startTransition(async () => {
        await markRead([row.id]);
        router.refresh();
      });
    }
    router.push(linkForNotification(row, audience));
  }

  function handleMarkAll() {
    startTransition(async () => {
      await markAllRead();
      router.refresh();
    });
  }

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="通知"
        className="relative inline-flex items-center justify-center h-10 w-10 rounded-lg border border-border hover:border-border-strong hover:bg-surface-muted transition-colors"
      >
        <svg
          className="h-5 w-5 text-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .53-.21 1.04-.59 1.41L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {totalUnread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full text-[10px] font-bold bg-accent text-accent-ink">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-[20rem] sm:w-[22rem] bg-surface rounded-lg shadow-lg border border-border overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">通知</h3>
            {totalUnread > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                disabled={isPending}
                className="text-xs text-accent hover:underline disabled:opacity-50"
              >
                すべて既読
              </button>
            )}
          </div>
          {displayRecent.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-subtle">通知はありません</div>
          ) : (
            <ul className="divide-y divide-border max-h-[60vh] overflow-y-auto">
              {displayRecent.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(row)}
                    className={`w-full text-left px-4 py-3 hover:bg-surface-muted transition-colors flex items-start gap-2 ${
                      row.read_at ? "" : "bg-accent-soft/30"
                    }`}
                  >
                    {!row.read_at && (
                      <span
                        aria-hidden
                        className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent flex-shrink-0"
                      />
                    )}
                    <div className={`min-w-0 flex-1 ${row.read_at ? "pl-3.5" : ""}`}>
                      <p className="text-sm text-foreground truncate">
                        {labelForNotification(row)}
                      </p>
                      {row.payload.itemSummary && (
                        <p className="text-xs text-subtle mt-0.5 truncate">
                          {row.payload.itemSummary}
                        </p>
                      )}
                      <p className="text-xs text-subtle mt-0.5">{formatRelative(row.created_at)}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
