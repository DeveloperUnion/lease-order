"use server";

import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getTenantId } from "@/lib/tenant";
import { createAdminPasswordResetToken } from "@/lib/admin-password-reset";
import { sendTransactionalEmail } from "@/lib/mailer";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ログインできない管理者が自力でパスワードを再設定するための起点。
// メール列挙を防ぐため、未登録・無効アドレスでも常に { ok: true } を返す
// （「登録があれば送信した」という一定の応答にする）。
export async function requestAdminPasswordReset(
  formData: FormData
): Promise<{ ok: true }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: true };

  const tenantId = await getTenantId();
  const { data: admin } = await supabaseAdmin
    .from("admin_users")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("email", email)
    .maybeSingle();
  if (!admin) return { ok: true };

  const rawToken = await createAdminPasswordResetToken(admin.id);

  // 再設定リンクはリクエスト元（テナント）ホストで組み立てる。
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const resetUrl = `${proto}://${host}/admin/reset-password?token=${rawToken}`;

  await sendTransactionalEmail({
    to: email,
    subject: "【管理コンソール】パスワード再設定のご案内",
    text: [
      "管理コンソールのパスワード再設定リクエストを受け付けました。",
      "",
      "以下のリンクから新しいパスワードを設定してください（有効期限: 60 分）。",
      resetUrl,
      "",
      "このメールに心当たりがない場合は破棄してください。パスワードは変更されません。",
    ].join("\n"),
  });

  return { ok: true };
}
