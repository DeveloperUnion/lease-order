import "server-only";
import { createHmac } from "node:crypto";

// PostgREST が Authorization: Bearer <jwt> を検証するための HS256 シークレット。
// Supabase Dashboard → Settings → API → JWT Secret から取得する。
function getSecret(): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error("SUPABASE_JWT_SECRET is not set");
  return secret;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const TTL_SECONDS = 60 * 5; // 5 分。リクエスト処理に十分な短期トークン

export type TenantJwtClaims = {
  role: "authenticated";
  aud: "authenticated";
  sub: string;
  tenant_id: string;
  iat: number;
  exp: number;
};

/**
 * tenant_id を claim に持つ Supabase 互換の JWT を発行する。
 *
 * subject:
 *   - 顧客ログイン中:  customer:<customer_id>
 *   - 管理者ログイン中: admin:<admin_user_id>
 *   - 未ログイン (login 画面用): tenant:<tenant_id>
 *
 * RLS ポリシーは `(auth.jwt() ->> 'tenant_id')` を参照する。
 */
export function mintTenantJwt(opts: {
  tenantId: string;
  subject: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const claims: TenantJwtClaims = {
    role: "authenticated",
    aud: "authenticated",
    sub: opts.subject,
    tenant_id: opts.tenantId,
    iat: now,
    exp: now + TTL_SECONDS,
  };
  const encodedHeader = b64urlEncode(Buffer.from(JSON.stringify(header)));
  const encodedClaims = b64urlEncode(Buffer.from(JSON.stringify(claims)));
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const signature = b64urlEncode(
    createHmac("sha256", getSecret()).update(signingInput).digest()
  );
  return `${signingInput}.${signature}`;
}
