"use server";

import { revalidatePath } from "next/cache";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { markAllRead, markRead } from "@/lib/notifications-data";

export async function markCustomerNotificationsRead(ids: string[]) {
  const customer = await getCurrentCustomer();
  if (!customer) return;
  await markRead(ids, {
    type: "customer",
    customerId: customer.id,
    tenantId: customer.tenant_id,
  });
  revalidatePath("/", "layout");
}

export async function markAllCustomerNotificationsRead() {
  const customer = await getCurrentCustomer();
  if (!customer) return;
  await markAllRead({
    type: "customer",
    customerId: customer.id,
    tenantId: customer.tenant_id,
  });
  revalidatePath("/", "layout");
}
