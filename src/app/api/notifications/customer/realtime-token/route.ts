import { NextResponse } from "next/server";
import { resolveAsCustomer } from "@/lib/supabase-tenant";
import { mintTenantJwt } from "@/lib/supabase-jwt";

export const dynamic = "force-dynamic";

const REALTIME_TTL_SECONDS = 60 * 30;

export async function GET() {
  const identity = await resolveAsCustomer();
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
