"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireCustomer } from "@/lib/customer-auth";
import {
  issueEmailVerification,
  checkEmailVerification,
  clearEmailVerifications,
} from "@/lib/email-verification";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type UpdateProfileInput = {
  phone?: string | null;
  defaultAddress?: string | null;
};

export type UpdateProfileResult = { ok: true } | { ok: false; error: string };

export async function updateProfile(input: UpdateProfileInput): Promise<UpdateProfileResult> {
  const customer = await requireCustomer({ allowMustChangePassword: true });

  const patch: Record<string, string | null> = {};
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null;
  if (input.defaultAddress !== undefined) patch.default_address = input.defaultAddress?.trim() || null;

  const { error } = await supabaseAdmin
    .from("customers")
    .update(patch)
    .eq("id", customer.id)
    .eq("tenant_id", customer.tenant_id);

  if (error) {
    console.error("updateProfile error", error);
    return { ok: false, error: "更新に失敗しました" };
  }

  revalidatePath("/account");
  return { ok: true };
}

// 通知メールの登録／変更: 入力アドレスに確認コードを送る。
// 確定（confirmEmailChange）まで contact_email は書き換えない。
export async function requestEmailChange(input: {
  email: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const customer = await requireCustomer({ allowMustChangePassword: true });
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "有効なメールアドレスを入力してください" };
  }
  const res = await issueEmailVerification(
    customer.tenant_id,
    customer.id,
    email,
    customer.name
  );
  if (!res.ok) {
    return { ok: false, error: res.error ?? "確認メールの送信に失敗しました" };
  }
  return { ok: true };
}

// 確認コードを照合し、一致したら contact_email を確定し email_verified=true にする。
export async function confirmEmailChange(input: {
  code: string;
}): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const customer = await requireCustomer({ allowMustChangePassword: true });
  const res = await checkEmailVerification(customer.id, input.code.trim());
  if (!res.ok) return res;

  const { error } = await supabaseAdmin
    .from("customers")
    .update({ contact_email: res.email, email_verified: true })
    .eq("id", customer.id)
    .eq("tenant_id", customer.tenant_id);
  if (error) {
    console.error("confirmEmailChange error", error);
    return { ok: false, error: "メールの更新に失敗しました" };
  }
  await clearEmailVerifications(customer.id);
  revalidatePath("/account");
  return { ok: true, email: res.email };
}

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

export type ChangePasswordResult = { ok: true; mustChangePasswordCleared: boolean } | { ok: false; error: string };

export async function changePassword(input: ChangePasswordInput): Promise<ChangePasswordResult> {
  const customer = await requireCustomer({ allowMustChangePassword: true });

  if (!input.currentPassword || !input.newPassword) {
    return { ok: false, error: "現在のパスワードと新しいパスワードを入力してください" };
  }
  if (input.newPassword.length < 8) {
    return { ok: false, error: "新しいパスワードは 8 文字以上で入力してください" };
  }
  if (input.newPassword === input.currentPassword) {
    return { ok: false, error: "新しいパスワードは現在のパスワードと異なるものにしてください" };
  }

  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("password_hash, must_change_password")
    .eq("id", customer.id)
    .eq("tenant_id", customer.tenant_id)
    .maybeSingle();

  if (error || !data) {
    console.error("changePassword fetch error", error);
    return { ok: false, error: "ユーザー情報の取得に失敗しました" };
  }

  const ok = await bcrypt.compare(input.currentPassword, data.password_hash);
  if (!ok) {
    return { ok: false, error: "現在のパスワードが正しくありません" };
  }

  const newHash = await bcrypt.hash(input.newPassword, 12);
  const { error: updateErr } = await supabaseAdmin
    .from("customers")
    .update({ password_hash: newHash, must_change_password: false })
    .eq("id", customer.id)
    .eq("tenant_id", customer.tenant_id);

  if (updateErr) {
    console.error("changePassword update error", updateErr);
    return { ok: false, error: "パスワードの更新に失敗しました" };
  }

  revalidatePath("/account");
  return { ok: true, mustChangePasswordCleared: data.must_change_password };
}
