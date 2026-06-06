"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/current-super-admin";
import {
  createTenant,
  updateTenant,
  addTenantAdmin,
  removeTenantAdmin,
  convertTenantToActive,
  extendTrial,
  suspendTenant,
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

function revalidateTenant(id: string) {
  revalidatePath("/super-admin");
  revalidatePath(`/super-admin/tenants/${id}`);
}

export async function convertTenantToActiveAction(id: string) {
  await requireSuperAdmin();
  const result = await convertTenantToActive(id);
  if (result.ok) revalidateTenant(id);
  return result;
}

export async function extendTrialAction(id: string, days: number) {
  await requireSuperAdmin();
  const result = await extendTrial(id, days);
  if (result.ok) revalidateTenant(id);
  return result;
}

export async function suspendTenantAction(id: string) {
  await requireSuperAdmin();
  const result = await suspendTenant(id);
  if (result.ok) revalidateTenant(id);
  return result;
}
