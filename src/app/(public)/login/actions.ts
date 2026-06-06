"use server";

// 認証 bootstrap: 顧客 JWT 発行前の credential 照合のため supabaseAdmin を使う。
// RLS の tenant_id 強制は login 後の `getSupabaseTenant()` 経路で効く。
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getTenantId } from "@/lib/tenant";
import { setCustomerSession, clearCustomerSession } from "@/lib/customer-auth";

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function login(input: { identifier: string; password: string; next?: string }): Promise<LoginResult> {
  const identifier = input.identifier.trim();
  const password = input.password;
  if (!identifier || !password) {
    return { ok: false, error: "会社 ID（またはメールアドレス）とパスワードを入力してください" };
  }

  const tenantId = await getTenantId();
  // 会員登録ユーザーはメール、admin 発行ユーザーは会社 ID でログインできる。
  const isEmail = identifier.includes("@");
  let query = supabaseAdmin
    .from("customers")
    .select("id, password_hash, is_active, self_registered, email_verified")
    .eq("tenant_id", tenantId);
  query = isEmail
    ? query.eq("contact_email", identifier.toLowerCase())
    : query.eq("company_id", identifier);
  const { data: rows, error } = await query
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    console.error("login lookup error", error);
    return { ok: false, error: "ログインに失敗しました。時間をおいて再度お試しください。" };
  }
  const data = rows?.[0] ?? null;

  const dummyHash = "$2a$12$0000000000000000000000000000000000000000000000000000ab";
  const hash = data?.password_hash ?? dummyHash;
  const ok = await bcrypt.compare(password, hash);

  if (!data || !data.is_active || !ok) {
    return { ok: false, error: "会社 ID／メールアドレスまたはパスワードが正しくありません" };
  }
  if (data.self_registered && !data.email_verified) {
    return {
      ok: false,
      error: "メールアドレスの確認が完了していません。確認メールのコードを入力してください。",
    };
  }

  await setCustomerSession(data.id, tenantId);
  return { ok: true };
}

export async function logout(): Promise<void> {
  await clearCustomerSession();
  redirect("/login");
}
