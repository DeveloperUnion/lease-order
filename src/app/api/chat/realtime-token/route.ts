import { NextResponse } from "next/server";
import { resolveRecipientIdentity } from "@/lib/supabase-tenant";
import { mintTenantJwt } from "@/lib/supabase-jwt";

export const dynamic = "force-dynamic";

// チャット Realtime 用の短期 JWT。
// /api/notifications/realtime-token と同じ仕様だが、用途が異なるため URL を分離。
// チャネル名は `chat:<conversationId>` を想定。tenant_id claim による RLS が
// Realtime のフィルタとして効くので、別テナントの行は配信されない。
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
