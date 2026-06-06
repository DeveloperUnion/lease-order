import "server-only";
import { supabaseAdmin } from "./supabase-admin";

// host から解決した tenant_slug と、Supabase Auth で認証済みの email の組が
// admin_users に登録されているかを 1 クエリで判定する。
// proxy（毎リクエストのテナント越境ゲート）から呼ぶ。admin_users.email は
// UNIQUE なので、登録 tenant 以外の管理画面に入ろうとすると必ず false になる。
export async function isAdminAllowedForTenant(
  email: string,
  tenantSlug: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("id, tenants!inner(slug)")
    .eq("email", email.toLowerCase())
    .eq("tenants.slug", tenantSlug)
    .maybeSingle();
  if (error) {
    console.error("isAdminAllowedForTenant lookup failed", error);
    return false;
  }
  return !!data;
}
