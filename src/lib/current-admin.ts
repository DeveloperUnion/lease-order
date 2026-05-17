import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { createSupabaseServerClient } from "./supabase-server";

// admin Server Action から呼び出される共通ヘルパー。
// "use server" ファイルにローカル関数として書くと Turbopack で同名衝突が起きるため、
// 通常モジュールに分離している。
//
// 解決順:
//   1. Supabase Auth の email → admin_users.id
//   2. (DISABLE_AUTH=1 のとき) テナント最初の admin_users.id
//   3. null
export async function currentAdminUserId(
  tenantId: string
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email) {
    const { data } = await supabaseAdmin
      .from("admin_users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("email", user.email.toLowerCase())
      .maybeSingle();
    if (data?.id) return data.id;
  }
  if (process.env.DISABLE_AUTH === "1") {
    const { data } = await supabaseAdmin
      .from("admin_users")
      .select("id")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return data?.id ?? null;
  }
  return null;
}
