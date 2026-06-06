"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getTenantId } from "@/lib/tenant";
import { nextCompanyId } from "@/lib/customer-id";

export type CreateCustomerInput = {
  name: string;
  phone?: string;
  defaultAddress?: string;
  contactEmail?: string;
};

export type CreateCustomerResult =
  | { ok: true; id: string; companyId: string; tempPassword: string }
  | { ok: false; error: string };

const PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateTempPassword(length = 12): string {
  const buf = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[buf[i] % PASSWORD_ALPHABET.length];
  }
  return out;
}

export async function createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "会社名は必須です" };

  const tenantId = await getTenantId();
  const companyId = await nextCompanyId(tenantId);
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const { data, error } = await supabaseAdmin
    .from("customers")
    .insert({
      tenant_id: tenantId,
      company_id: companyId,
      name,
      password_hash: passwordHash,
      phone: input.phone?.trim() || null,
      default_address: input.defaultAddress?.trim() || null,
      contact_email: input.contactEmail?.trim() || null,
      // admin が入力したメールは検証済み扱い（無ければ false）。
      email_verified: !!input.contactEmail?.trim(),
      self_registered: false,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createCustomer error", error);
    return { ok: false, error: "顧客の作成に失敗しました" };
  }

  revalidatePath("/admin/customers");
  return { ok: true, id: data.id, companyId, tempPassword };
}

export type UpdateCustomerInput = {
  id: string;
  name?: string;
  phone?: string | null;
  defaultAddress?: string | null;
  contactEmail?: string | null;
};

export async function updateCustomer(input: UpdateCustomerInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const tenantId = await getTenantId();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null;
  if (input.defaultAddress !== undefined) patch.default_address = input.defaultAddress?.trim() || null;
  if (input.contactEmail !== undefined) {
    const e = input.contactEmail?.trim() || null;
    patch.contact_email = e;
    // admin が入力したメールは検証済み扱い（クリア時は false）。
    patch.email_verified = !!e;
  }

  const { error } = await supabaseAdmin
    .from("customers")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", input.id);
  if (error) {
    console.error("updateCustomer error", error);
    return { ok: false, error: "更新に失敗しました" };
  }
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${input.id}`);
  return { ok: true };
}

export async function resetCustomerPassword(id: string): Promise<{ ok: true; tempPassword: string } | { ok: false; error: string }> {
  const tenantId = await getTenantId();
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const { error } = await supabaseAdmin
    .from("customers")
    .update({ password_hash: passwordHash, must_change_password: true })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) {
    console.error("resetCustomerPassword error", error);
    return { ok: false, error: "パスワードのリセットに失敗しました" };
  }
  revalidatePath(`/admin/customers/${id}`);
  return { ok: true, tempPassword };
}

export async function setCustomerActive(id: string, isActive: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const tenantId = await getTenantId();
  const { error } = await supabaseAdmin
    .from("customers")
    .update({ is_active: isActive })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) {
    console.error("setCustomerActive error", error);
    return { ok: false, error: "ステータスの変更に失敗しました" };
  }
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${id}`);
  return { ok: true };
}
