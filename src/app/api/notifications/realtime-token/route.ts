import { NextResponse } from "next/server";
import { resolveRecipientIdentity } from "@/lib/supabase-tenant";
import { mintTenantJwt } from "@/lib/supabase-jwt";

export const dynamic = "force-dynamic";

// 30 分。長時間タブを開いたまま使うケースを想定して長め。
// クライアントは expiresAt 直前に再 fetch + supabase.realtime.setAuth で更新する。
const REALTIME_TTL_SECONDS = 60 * 30;

export async function GET() {
  const identity = await resolveRecipientIdentity();

  if (identity.audience === "anonymous") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const jwt = mintTenantJwt({
    tenantId: identity.tenantId,
    subject: identity.subject,
    ttlSeconds: REALTIME_TTL_SECONDS,
  });
  const expiresAt = Math.floor(Date.now() / 1000) + REALTIME_TTL_SECONDS;

  return NextResponse.json({
    jwt,
    expiresAt,
    tenantId: identity.tenantId,
    recipientId: identity.recipientId,
    audience: identity.audience,
  });
}
