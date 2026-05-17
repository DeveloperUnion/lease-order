"use server";

import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { markAllRead, markRead } from "@/lib/notifications-data";
import { currentAdminUserId } from "@/lib/current-admin";

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
