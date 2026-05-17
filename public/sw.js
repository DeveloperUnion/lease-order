// Service Worker — オフラインでアプリ起動を可能にするための薄い shell キャッシュ。
//
// 設計方針:
//   - GET ナビゲーション → network-first、失敗時に cache、最終的に /offline。
//   - 同一オリジンの GET 静的アセット (_next/static, /images, etc) → stale-while-revalidate。
//   - /api/* と非 GET → 一切 intercept しない（POST は outbox が責任を持つ）。
//   - クロスオリジン → 一切 intercept しない。
//
// 注意:
//   - Workbox 等を使わず手書き。Next.js の build ID 連動 precache は行わない。
//   - 新しいバージョンを配ったらユーザは少なくとも一度オンラインで開く必要がある。
//   - CACHE_VERSION をリリースごとに上げると古いキャッシュが掃除される。

const CACHE_VERSION = "v1";
const RUNTIME_CACHE = `lo-runtime-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      try {
        await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      } catch (e) {
        // /offline がまだ存在しない可能性（ビルド前後など）。致命的ではない。
        console.warn("[sw] failed to precache /offline:", e);
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== RUNTIME_CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API は intercept しない（POST /api/orders は outbox が責任、
  // GET /api はリアルタイム性が重要）
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(handleNavigation(req));
    return;
  }

  event.respondWith(staleWhileRevalidate(req));
});

async function handleNavigation(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) {
      cache.put(req, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response(
      "<!doctype html><meta charset=utf-8><title>オフライン</title><body style=\"font-family:system-ui;padding:2rem;text-align:center;color:#333\"><h1>オフラインです</h1><p>このページは未取得のため表示できません。</p></body>",
      { headers: { "content-type": "text/html; charset=utf-8" }, status: 503 }
    );
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);
  if (cached) {
    fetchPromise.catch(() => {});
    return cached;
  }
  const fresh = await fetchPromise;
  if (fresh) return fresh;
  return new Response("", { status: 504 });
}
