"use client";

// クライアント側で Realtime 用 JWT を取得するときの共有ヘルパ。
//
// 同じ URL に対する複数 consumer の並行 fetch を 1 本に dedupe し、
// 有効期限内なら結果もメモリキャッシュする。
//
// 用途例:
//   - notification-bell.tsx (customer / admin)
//   - chat の use-live-chat-unread, admin-chat-screen, customer-chat-view
//     → これら 3 つは同じ /api/chat/realtime-token を叩くので 1 本に収まる。
//
// expiresAt の 60 秒前から「期限切れ」として扱い、新規 fetch する。
//
// SSR ではブラウザの fetch がないため呼ばれない想定（"use client" 明示）。

export type RealtimeTokenResponse = {
  jwt: string;
  expiresAt: number;
  tenantId: string;
  recipientId: string;
  audience: "customer" | "admin";
};

type Slot = {
  token: RealtimeTokenResponse | null;
  promise: Promise<RealtimeTokenResponse | null> | null;
};

const cache = new Map<string, Slot>();

function isFresh(token: RealtimeTokenResponse, leewaySeconds = 60): boolean {
  return token.expiresAt * 1000 - leewaySeconds * 1000 > Date.now();
}

export async function getRealtimeToken(
  url: string
): Promise<RealtimeTokenResponse | null> {
  const slot = cache.get(url);
  if (slot?.token && isFresh(slot.token)) return slot.token;
  if (slot?.promise) return slot.promise;

  const promise = fetch(url, { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) return null;
      return (await res.json()) as RealtimeTokenResponse;
    })
    .catch(() => null)
    .then((token) => {
      const next: Slot = { token, promise: null };
      cache.set(url, next);
      return token;
    });

  cache.set(url, { token: slot?.token ?? null, promise });
  return promise;
}
