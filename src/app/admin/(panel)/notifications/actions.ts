"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getTenantId } from "@/lib/tenant";
import { markAllRead, markRead } from "@/lib/notifications-data";

async function currentAdminUserId(tenantId: string): Promise<string | null> {
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
  // フィードバック収集モード: 未ログイン or 未登録メールでもテナントの最初の admin を返す
  if (process.env.DISABLE_AUTH === "1") {
    const { data } = await supabaseAdmin
      .from("admin_users")
      .select("id")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return data?.id ?? null;
  }
  return null;
}

export async function markAdminNotificationsRead(ids: string[]) {
  const tenantId = await getTenantId();
  const adminId = await currentAdminUserId(tenantId);
  if (!adminId) return;
  await markRead(ids, { type: "admin", adminUserId: adminId, tenantId });
  revalidatePath("/admin", "layout");
}

export async function markAllAdminNotificationsRead() {
  const tenantId = await getTenantId();
  const adminId = await currentAdminUserId(tenantId);
  if (!adminId) return;
  await markAllRead({ type: "admin", adminUserId: adminId, tenantId });
  revalidatePath("/admin", "layout");
}
