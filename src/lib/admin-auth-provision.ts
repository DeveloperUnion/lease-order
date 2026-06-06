import "server-only";
import { supabaseAdmin } from "./supabase-admin";

// 管理者(admin)のパスワード認証用 Supabase Auth ユーザーを発行するための共通ヘルパー。
// テナント内 /admin（addAdminUser）と super-admin コンソール（addTenantAdmin）の
// 両方から使う。重複実装で挙動がズレるのを防ぐ。

// auth.users をページングして email から id を引く。
export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error || !data?.users?.length) return null;
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

// email+password の auth.users を作成し id を返す。既に存在するメール
// （マジックリンク時代の残存や super_admin との重複など）はパスワードを更新して再利用する。
export async function ensureAuthUser(email: string, password: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error && data?.user) return data.user.id;

  const existingId = await findAuthUserIdByEmail(email);
  if (existingId) {
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(
      existingId,
      { password, email_confirm: true }
    );
    if (updErr) {
      throw new Error(`認証ユーザーの更新に失敗しました: ${updErr.message}`);
    }
    return existingId;
  }
  throw new Error(
    `認証ユーザーの作成に失敗しました: ${error?.message ?? "unknown"}`
  );
}
