"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getTenantId, type CustomerAccessMode } from "@/lib/tenant";

type Result = { ok: true } | { ok: false; error: string };

// 顧客アクセスモード（login / guest_browse）を自テナントにのみ反映する。
export async function setCustomerAccessMode(mode: CustomerAccessMode): Promise<Result> {
  if (mode !== "login" && mode !== "guest_browse") {
    return { ok: false, error: "不正な値です" };
  }
  const tenantId = await getTenantId();
  const { error } = await supabaseAdmin
    .from("tenants")
    .update({ customer_access_mode: mode })
    .eq("id", tenantId);
  if (error) {
    console.error("setCustomerAccessMode error", error);
    return { ok: false, error: "設定の更新に失敗しました" };
  }
  revalidatePath("/admin/settings");
  return { ok: true };
}

// 会員登録（self-registration）の可否を自テナントにのみ反映する。
export async function setCustomerSelfRegistration(enabled: boolean): Promise<Result> {
  const tenantId = await getTenantId();
  const { error } = await supabaseAdmin
    .from("tenants")
    .update({ customer_self_registration: enabled })
    .eq("id", tenantId);
  if (error) {
    console.error("setCustomerSelfRegistration error", error);
    return { ok: false, error: "設定の更新に失敗しました" };
  }
  revalidatePath("/admin/settings");
  return { ok: true };
}
