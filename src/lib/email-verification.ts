import "server-only";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { supabaseAdmin } from "./supabase-admin";
import { sendTransactionalEmail } from "./mailer";

// 顧客の通知メール登録／変更時のコード認証。検証中のアドレスは
// customer_email_verifications.email に持ち、コード一致で contact_email に確定する。
const CODE_TTL_MS = 30 * 60 * 1000;

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// pending email 宛に確認コードを発行・送信し、検証レコードを保存する。
export async function issueEmailVerification(
  tenantId: string,
  customerId: string,
  email: string,
  name: string
): Promise<{ ok: boolean; error?: string }> {
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  await supabaseAdmin.from("customer_email_verifications").insert({
    tenant_id: tenantId,
    customer_id: customerId,
    email,
    code_hash: codeHash,
    expires_at: expiresAt,
  });
  return sendTransactionalEmail({
    to: email,
    subject: "【発注システム】メールアドレスの確認",
    text:
      `${name} 様\n\n` +
      `通知メールの確認コードは次のとおりです。\n\n    ${code}\n\n` +
      `画面にこのコードを入力すると登録が完了します。\n` +
      `有効期限は 30 分です。`,
  });
}

// 最新の検証レコードを照合し、一致すれば pending email を返す。
export async function checkEmailVerification(
  customerId: string,
  code: string
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const { data: ver } = await supabaseAdmin
    .from("customer_email_verifications")
    .select("id, email, code_hash, expires_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ver || !ver.email) {
    return { ok: false, error: "確認コードが見つかりません。再送信してください" };
  }
  if (new Date(ver.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "確認コードの有効期限が切れています。再送信してください" };
  }
  const match = await bcrypt.compare(code, ver.code_hash);
  if (!match) return { ok: false, error: "確認コードが正しくありません" };
  return { ok: true, email: ver.email as string };
}

export async function clearEmailVerifications(customerId: string): Promise<void> {
  await supabaseAdmin
    .from("customer_email_verifications")
    .delete()
    .eq("customer_id", customerId);
}
