"use server";

// 会員登録（self-registration）。顧客 JWT 発行前の bootstrap なので supabaseAdmin を使う。
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getTenant } from "@/lib/tenant";
import { nextCompanyId } from "@/lib/customer-id";
import { setCustomerSession } from "@/lib/customer-auth";
import { sendTransactionalEmail } from "@/lib/mailer";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_TTL_MS = 30 * 60 * 1000;

export type RegisterResult = { ok: true; email: string } | { ok: false; error: string };
export type VerifyResult = { ok: true } | { ok: false; error: string };

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

async function issueAndSendCode(
  tenantId: string,
  customerId: string,
  email: string,
  name: string
): Promise<void> {
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  await supabaseAdmin.from("customer_email_verifications").insert({
    tenant_id: tenantId,
    customer_id: customerId,
    code_hash: codeHash,
    expires_at: expiresAt,
  });
  await sendTransactionalEmail({
    to: email,
    subject: "【発注システム】メールアドレスの確認",
    text:
      `${name} 様\n\n` +
      `会員登録の確認コードは次のとおりです。\n\n    ${code}\n\n` +
      `登録画面にこのコードを入力して登録を完了してください。\n` +
      `コードの有効期限は 30 分です。`,
  });
}

export async function registerCustomer(input: {
  name: string;
  email: string;
  password: string;
}): Promise<RegisterResult> {
  const tenant = await getTenant();
  if (!tenant.customer_self_registration) {
    return { ok: false, error: "会員登録は利用できません" };
  }

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return { ok: false, error: "会社名を入力してください" };
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "有効なメールアドレスを入力してください" };
  }
  if (input.password.length < 8) {
    return { ok: false, error: "パスワードは 8 文字以上で入力してください" };
  }

  // 同一メールの有効な顧客がいれば弾く（会員登録由来の重複防止）。
  const { data: dup } = await supabaseAdmin
    .from("customers")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("contact_email", email)
    .eq("is_active", true)
    .maybeSingle();
  if (dup) {
    return { ok: false, error: "このメールアドレスは既に登録されています" };
  }

  const companyId = await nextCompanyId(tenant.id);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const { data: created, error } = await supabaseAdmin
    .from("customers")
    .insert({
      tenant_id: tenant.id,
      company_id: companyId,
      name,
      password_hash: passwordHash,
      contact_email: email,
      is_active: true,
      must_change_password: false,
      email_verified: false,
      self_registered: true,
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error("registerCustomer insert error", error);
    return { ok: false, error: "登録に失敗しました。時間をおいて再度お試しください。" };
  }

  await issueAndSendCode(tenant.id, created.id, email, name);
  return { ok: true, email };
}

async function findUnverifiedCustomer(tenantId: string, email: string) {
  const { data } = await supabaseAdmin
    .from("customers")
    .select(
      "id, tenant_id, company_id, name, default_address, phone, contact_email, must_change_password, email_verified"
    )
    .eq("tenant_id", tenantId)
    .eq("contact_email", email)
    .eq("self_registered", true)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function verifyCustomerEmail(input: {
  email: string;
  code: string;
}): Promise<VerifyResult> {
  const tenant = await getTenant();
  const email = input.email.trim().toLowerCase();
  const code = input.code.trim();

  const customer = await findUnverifiedCustomer(tenant.id, email);
  if (!customer) return { ok: false, error: "登録情報が見つかりません" };

  if (customer.email_verified) {
    await setCustomerSession(customer.id, customer.tenant_id);
    return { ok: true };
  }

  const { data: ver } = await supabaseAdmin
    .from("customer_email_verifications")
    .select("id, code_hash, expires_at")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ver) {
    return { ok: false, error: "確認コードが見つかりません。再送信してください" };
  }
  if (new Date(ver.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "確認コードの有効期限が切れています。再送信してください" };
  }
  const match = await bcrypt.compare(code, ver.code_hash);
  if (!match) return { ok: false, error: "確認コードが正しくありません" };

  await supabaseAdmin
    .from("customers")
    .update({ email_verified: true })
    .eq("id", customer.id)
    .eq("tenant_id", customer.tenant_id);
  await supabaseAdmin
    .from("customer_email_verifications")
    .delete()
    .eq("customer_id", customer.id);

  // 検証完了でそのままログイン状態にする。
  await setCustomerSession(customer.id, customer.tenant_id);
  return { ok: true };
}

export async function resendVerificationCode(input: {
  email: string;
}): Promise<VerifyResult> {
  const tenant = await getTenant();
  const email = input.email.trim().toLowerCase();
  const customer = await findUnverifiedCustomer(tenant.id, email);
  // 情報漏洩を避けるため、対象が無くても成功扱いで返す。
  if (!customer || customer.email_verified) return { ok: true };
  await issueAndSendCode(tenant.id, customer.id, email, customer.name);
  return { ok: true };
}
