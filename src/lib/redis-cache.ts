import "server-only";

// Vercel Marketplace で Upstash for Redis を install すると、以下の env が自動で入る:
//   - UPSTASH_REDIS_REST_URL
//   - UPSTASH_REDIS_REST_TOKEN
// この 2 つが揃っている時だけ Redis を有効化する。未設定なら全て no-op で
// アプリは動き続ける（cold cache 改善はないが機能 regression は起こさない）。
//
// @upstash/redis パッケージは dynamic import 経由で遅延読込する。未 install 状態
// でも build と起動は成功するため、ユーザーは Vercel Marketplace → pnpm add の
// 順で安全にセットアップできる。

type RedisLike = {
  get: <T>(key: string) => Promise<T | null>;
  set: <T>(
    key: string,
    value: T,
    opts?: { ex?: number }
  ) => Promise<unknown>;
  // SCAN ベースで prefix 一致 key を取得。本数次第で複数往復するが、
  // catalog 系の key 数は 1 テナントあたり数百程度なので問題ない。
  scan: (
    cursor: number,
    opts: { match: string; count?: number }
  ) => Promise<[string | number, string[]]>;
  del: (...keys: string[]) => Promise<number>;
};

let initialized = false;
let client: RedisLike | null = null;

async function getClient(): Promise<RedisLike | null> {
  if (initialized) return client;
  initialized = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    // @upstash/redis は Vercel Marketplace で Upstash for Redis を install したあと、
    // 別途 `pnpm add @upstash/redis` で追加する。それまでは未 install で OK。
    // 動的 import + ignore で、未 install でも tsc / build が通るようにする。
    // @ts-expect-error optional dep — installed via `pnpm add @upstash/redis`
    const mod = (await import(/* webpackIgnore: true */ "@upstash/redis")) as {
      Redis: { new (opts: { url: string; token: string }): RedisLike };
    };
    client = new mod.Redis({ url, token });
    return client;
  } catch (err) {
    // @upstash/redis 未 install 時はここに来る。一度だけ console.warn して以降は no-op。
    console.warn("[redis-cache] @upstash/redis is not installed", err);
    return null;
  }
}

export async function readJson<T>(key: string): Promise<T | null> {
  const r = await getClient();
  if (!r) return null;
  try {
    const v = await r.get<T>(key);
    return v ?? null;
  } catch (err) {
    console.warn("[redis-cache] get failed", key, err);
    return null;
  }
}

export async function writeJson<T>(
  key: string,
  value: T,
  ttlSeconds: number
): Promise<void> {
  const r = await getClient();
  if (!r) return;
  try {
    await r.set(key, value, { ex: ttlSeconds });
  } catch (err) {
    console.warn("[redis-cache] set failed", key, err);
  }
}

export async function deleteByPrefix(prefix: string): Promise<void> {
  const r = await getClient();
  if (!r) return;
  try {
    let cursor: string | number = 0;
    const batch: string[] = [];
    do {
      const [next, keys] = await r.scan(Number(cursor), {
        match: `${prefix}*`,
        count: 200,
      });
      cursor = next;
      for (const k of keys) batch.push(k);
    } while (Number(cursor) !== 0);
    if (batch.length > 0) {
      // del は可変長引数。1000 件を超えるなら分割するが、catalog 用途では到達しない。
      await r.del(...batch);
    }
  } catch (err) {
    console.warn("[redis-cache] deleteByPrefix failed", prefix, err);
  }
}
