import "server-only";
import { supabaseAdmin } from "./supabase-admin";

// Supabase Auth で認証済みの email が super_admins allowlist に登録されているか判定。
// proxy（毎リクエストのゲート）と /super-admin/auth/callback（初回ログイン検証）、
// および各 Server Action（requireSuperAdmin 経由）から呼ぶ。
// super_admins.email は UNIQUE。テナントの admin_users とは独立した別 allowlist。
export async function isSuperAdmin(email: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("super_admins")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) {
    console.error("isSuperAdmin lookup failed", error);
    return false;
  }
  return !!data;
}
