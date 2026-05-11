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
  if (!user?.email) return null;
  const { data } = await supabaseAdmin
    .from("admin_users")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("email", user.email)
    .maybeSingle();
  return data?.id ?? null;
}

export async function markAdminNotificationsRead(ids: string[]) {
  const tenantId = await getTenantId();
  const adminId = await currentAdminUserId(tenantId);
  if (!adminId) return;
  await markRead(ids, { type: "admin", adminUserId: adminId, tenantId });
  revalidatePath("/admin/notifications");
  revalidatePath("/admin", "layout");
}

export async function markAllAdminNotificationsRead() {
  const tenantId = await getTenantId();
  const adminId = await currentAdminUserId(tenantId);
  if (!adminId) return;
  await markAllRead({ type: "admin", adminUserId: adminId, tenantId });
  revalidatePath("/admin/notifications");
  revalidatePath("/admin", "layout");
}
