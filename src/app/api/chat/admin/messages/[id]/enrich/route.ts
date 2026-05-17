import { resolveAsAdmin } from "@/lib/supabase-tenant";
import { handleEnrichMessage } from "@/lib/chat/route-handlers";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await ctx.params;
  const identity = await resolveAsAdmin();
  return handleEnrichMessage(id, identity);
}
