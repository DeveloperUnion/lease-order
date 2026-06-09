"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { consumeAdminPasswordResetToken } from "@/lib/admin-password-reset";
import { ensureAuthUser } from "@/lib/admin-auth-provision";

// 再設定リンク（token）経由で、管理者本人が新しいパスワードを設定する。
// Supabase Auth のパスワードを更新し、本人が選んだ値なので
// must_change_password も下ろす（初回変更フローには乗せない）。
export async function resetAdminPasswordWithToken(input: {
  token: string;
  newPassword: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.newPassword || input.newPassword.length < 8) {
    return { ok: false, error: "新しいパスワードは 8 文字以上で入力してください" };
  }

  const target = await consumeAdminPasswordResetToken(input.token);
  if (!target) {
    return {
      ok: false,
      error:
        "リンクが無効か、有効期限が切れています。お手数ですが再度パスワード再設定を申請してください。",
    };
  }

  let authUserId = target.authUserId;
  if (authUserId) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
      password: input.newPassword,
      email_confirm: true,
    });
    if (error) return { ok: false, error: "パスワードの更新に失敗しました" };
  } else {
    // マジックリンク時代の行は auth_user_id 未設定。email から解決し直す。
    authUserId = await ensureAuthUser(target.email, input.newPassword);
    await supabaseAdmin
      .from("admin_users")
      .update({ auth_user_id: authUserId })
      .eq("id", target.adminUserId);
  }

  await supabaseAdmin
    .from("admin_users")
    .update({ must_change_password: false })
    .eq("id", target.adminUserId);

  return { ok: true };
}
