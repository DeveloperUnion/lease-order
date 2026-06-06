import "server-only";
import { createSupabaseServerClient } from "./supabase-server";
import { isSuperAdmin } from "./super-admin-access";

// 現在ログイン中の super-admin の email を返す（未認証 / 非 super-admin は null）。
export async function getCurrentSuperAdminEmail(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase() ?? null;
  if (!email) return null;
  return (await isSuperAdmin(email)) ? email : null;
}

// Server Action の先頭で必ず呼ぶ多層防御ガード。
// proxy のホスト分岐を信用せず、DB の allowlist で super-admin を再確認する。
// 非 super-admin なら例外を投げてアクションを中断させる。
export async function requireSuperAdmin(): Promise<string> {
  const email = await getCurrentSuperAdminEmail();
  if (!email) {
    throw new Error("super-admin 権限が必要です");
  }
  return email;
}
