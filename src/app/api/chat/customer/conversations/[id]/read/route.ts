import { resolveAsCustomer } from "@/lib/supabase-tenant";
import { handleMarkRead } from "@/lib/chat/route-handlers";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await ctx.params;
  const identity = await resolveAsCustomer();
  return handleMarkRead(id, identity);
}
