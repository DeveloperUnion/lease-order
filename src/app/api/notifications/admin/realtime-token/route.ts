import { NextResponse } from "next/server";
import { resolveAsAdmin } from "@/lib/supabase-tenant";
import { mintTenantJwt } from "@/lib/supabase-jwt";

export const dynamic = "force-dynamic";

// 通知 Realtime 用の admin 専用短期 JWT。
// /api/notifications/realtime-token は resolveRecipientIdentity (customer-first 推論) を
// 使っていたため、同一ブラウザに顧客 cookie がある / DISABLE_AUTH=1 のとき token.audience が
// 常に "customer" になり、admin の NotificationBell が subscribe を諦めていた。
// URL でどっち側か申告させて resolveAsAdmin に固定することで誤判定を防ぐ。
const REALTIME_TTL_SECONDS = 60 * 30;

export async function GET() {
  const identity = await resolveAsAdmin();
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
