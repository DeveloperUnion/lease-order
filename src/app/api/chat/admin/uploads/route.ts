import { resolveAsAdmin } from "@/lib/supabase-tenant";
import { handleUpload } from "@/lib/chat/route-handlers";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const identity = await resolveAsAdmin();
  return handleUpload(req, identity);
}
