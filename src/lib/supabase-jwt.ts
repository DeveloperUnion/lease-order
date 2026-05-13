import "server-only";
import { createSign, createPrivateKey, type KeyObject } from "node:crypto";

// PostgREST が Authorization: Bearer <jwt> を検証するための ES256 (P-256 ECDSA) 秘密鍵。
// Supabase Dashboard → API → JWT Keys に Standby Key として「Import an existing
// private key」で登録した PKCS#8 PEM を、同じ値で .env / Vercel env にも入れる。
let cachedKey: KeyObject | null = null;
function getPrivateKey(): KeyObject {
  if (cachedKey) return cachedKey;
  const raw = process.env.SUPABASE_JWT_PRIVATE_KEY;
  if (!raw) throw new Error("SUPABASE_JWT_PRIVATE_KEY is not set");
  // .env で `\n` 文字列として保存されていた場合に実改行へ戻す
  const pem = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
  cachedKey = createPrivateKey(pem);
  return cachedKey;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const DEFAULT_TTL_SECONDS = 60 * 5; // 5 分。リクエスト処理に十分な短期トークン

export type TenantJwtClaims = {
  role: "authenticated";
  aud: "authenticated";
  sub: string;
  tenant_id: string;
  iat: number;
  exp: number;
};

/**
 * tenant_id を claim に持つ Supabase 互換の ES256 JWT を発行する。
 *
 * subject:
 *   - 顧客ログイン中:  customer:<customer_id>
 *   - 管理者ログイン中: admin:<admin_user_id>
 *   - 未ログイン (login 画面用): tenant:<tenant_id>
 *
 * RLS ポリシーは `(auth.jwt() ->> 'tenant_id')` を参照する。
 *
 * ttlSeconds はデフォルト 5 分。Realtime のような長時間接続用途には
 * 呼び出し側で延長できる（クライアントは expiresAt 直前に再 fetch する想定）。
 */
export function mintTenantJwt(opts: {
  tenantId: string;
  subject: string;
  ttlSeconds?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const ttl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  // kid は Supabase Dashboard の JWT Keys → Current Key の ID。Realtime の
  // verify は JWKS から kid 完全一致のキーを引くため、header.kid が必須。
  // kid と private key の対応が崩れると Realtime だけが落ちる（PostgREST は
  // JWKS の全鍵 fallback で通るため）ので、rotation 時は private key と
  // SUPABASE_JWT_KID を必ずペアで更新する。
  const kid = process.env.SUPABASE_JWT_KID;
  if (!kid) throw new Error("SUPABASE_JWT_KID is not set");
  const header = { alg: "ES256", typ: "JWT", kid };
  const claims: TenantJwtClaims = {
    role: "authenticated",
    aud: "authenticated",
    sub: opts.subject,
    tenant_id: opts.tenantId,
    iat: now,
    exp: now + ttl,
  };
  const encodedHeader = b64urlEncode(Buffer.from(JSON.stringify(header)));
  const encodedClaims = b64urlEncode(Buffer.from(JSON.stringify(claims)));
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  // dsaEncoding: "ieee-p1363" は ECDSA 署名を JOSE 互換の R||S (64 byte) で出力する。
  // 既定の DER 形式だと PostgREST/jose 側で復号できない。
  const signature = createSign("SHA256")
    .update(signingInput)
    .sign({
      key: getPrivateKey(),
      dsaEncoding: "ieee-p1363",
    });
  return `${signingInput}.${b64urlEncode(signature)}`;
}
