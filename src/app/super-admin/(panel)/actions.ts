"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/current-super-admin";
import {
  createTenant,
  updateTenant,
  addTenantAdmin,
  removeTenantAdmin,
  type CreateTenantInput,
  type UpdateTenantInput,
} from "@/lib/super-admin-data";

// すべてのアクションは proxy を信用せず requireSuperAdmin() で権限を再確認する（多層防御）。
// revalidatePath は内部ルートパス（/super-admin/*）を対象にする。

export async function createTenantAction(input: CreateTenantInput) {
  await requireSuperAdmin();
  const result = await createTenant(input);
  if (result.ok) revalidatePath("/super-admin");
  return result;
}

export async function updateTenantAction(input: UpdateTenantInput) {
  await requireSuperAdmin();
  const result = await updateTenant(input);
  if (result.ok) {
    revalidatePath("/super-admin");
    revalidatePath(`/super-admin/tenants/${input.id}`);
  }
  return result;
}

export async function addTenantAdminAction(tenantId: string, email: string) {
  await requireSuperAdmin();
  const result = await addTenantAdmin(tenantId, email);
  if (result.ok) revalidatePath(`/super-admin/tenants/${tenantId}`);
  return result;
}

export async function removeTenantAdminAction(tenantId: string, adminUserId: string) {
  await requireSuperAdmin();
  const result = await removeTenantAdmin(adminUserId);
  if (result.ok) revalidatePath(`/super-admin/tenants/${tenantId}`);
  return result;
}
