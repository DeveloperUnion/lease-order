import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { createSupabaseServerClient } from "./supabase-server";
import { getTenantId } from "./tenant";

// admin Server Action から呼び出される共通ヘルパー。
// "use server" ファイルにローカル関数として書くと Turbopack で同名衝突が起きるため、
// 通常モジュールに分離している。
//
// 解決: Supabase Auth の email → admin_users.id（当該 tenant のみ）。
// 管理者は常時認証必須なので、認証が無ければ null。
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
  return null;
}

// 現在ログイン中の管理者が初回パスワード変更を要求されているか。
// (panel) layout のゲートで参照し、true の間は /admin/change-password に誘導する。
export async function currentAdminMustChangePassword(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  // getClaims は JWKS キャッシュでローカル検証するため /auth/v1/user 往復が無い。
  const { data: claimsData } = await supabase.auth.getClaims();
  const email = (claimsData?.claims?.email as string | undefined) ?? null;
  if (!email) return false;
  const tenantId = await getTenantId();
  const { data } = await supabaseAdmin
    .from("admin_users")
    .select("must_change_password")
    .eq("tenant_id", tenantId)
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return !!data?.must_change_password;
}
