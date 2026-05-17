import { NextResponse } from "next/server";
import { resolveRecipientIdentity } from "@/lib/supabase-tenant";
import { getConversationById, markConversationRead } from "@/lib/chat/data";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await ctx.params;
  const identity = await resolveRecipientIdentity();
  if (identity.audience === "anonymous") {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const conv = await getConversationById(id, identity.tenantId);
  if (!conv) return NextResponse.json({ ok: false }, { status: 404 });
  if (
    identity.audience === "customer" &&
    conv.customer_id !== identity.recipientId
  ) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  await markConversationRead(id, identity.tenantId, identity.audience);
  return NextResponse.json({ ok: true });
}
