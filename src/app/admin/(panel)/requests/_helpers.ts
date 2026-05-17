import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// admin_user.id 解決は bootstrap（auth.users.email → admin_users.id mapping）
// なので service_role を継続使用。
export async function currentAdminUserId(tenantId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const { data } = await supabaseAdmin
    .from("admin_users")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("email", user.email.toLowerCase())
    .maybeSingle();
  return data?.id ?? null;
}
