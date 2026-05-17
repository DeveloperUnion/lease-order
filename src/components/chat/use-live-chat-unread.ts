"use client";

import { useEffect, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type TokenResponse = {
  jwt: string;
  expiresAt: number;
  tenantId: string;
  recipientId: string;
  audience: "admin" | "customer";
};

// チャット未読バッジを realtime で生かしておく hook。
// 親 (server) から initial count を貰い、realtime で INSERT/UPDATE を観測して
// 加減算する。これによって既読化や着信時に router.refresh() を呼ばずに
// バッジが追従するため、layout 4 並列クエリの再 fetch を避けられる。
//
// 仕様:
//   - 反対側 (otherSide) からの INSERT で read_at が null → +1
//   - 反対側のメッセージで UPDATE が来て new.read_at が非 null → -1
//     （markConversationRead は read_at IS NULL の行だけ UPDATE するので、
//      同じ row への二重 UPDATE は起きない前提）
//
// 注意: postgres_changes の UPDATE payload は default REPLICA IDENTITY だと
//   payload.old に id しか入らない。よって「変化量」では計算できず、上記の前提に
//   依存する。万が一の誤差は次回ナビゲーション時に server count で再同期される。
export function useLiveChatUnread(
  initialCount: number,
  audience: "customer" | "admin"
): number {
  const [count, setCount] = useState(initialCount);

  // server props (initialCount) が更新されたら再同期。
  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  useEffect(() => {
    let cancelled = false;
    let supabase: SupabaseClient | null = null;
    let channel: ReturnType<SupabaseClient["channel"]> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const otherSide = audience === "customer" ? "admin" : "customer";

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
        .channel(`chat-badge:${audience}:${token.recipientId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `tenant_id=eq.${token.tenantId}`,
          },
          (payload) => {
            const row = payload.new as {
              sender_type: "customer" | "admin";
              read_at: string | null;
            };
            if (row.sender_type === otherSide && !row.read_at) {
              setCount((c) => c + 1);
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "messages",
            filter: `tenant_id=eq.${token.tenantId}`,
          },
          (payload) => {
            const row = payload.new as {
              sender_type: "customer" | "admin";
              read_at: string | null;
            };
            if (row.sender_type === otherSide && row.read_at) {
              setCount((c) => Math.max(0, c - 1));
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
  }, [audience]);

  return count;
}
