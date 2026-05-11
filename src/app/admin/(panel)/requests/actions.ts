"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSupabaseTenant } from "@/lib/supabase-tenant";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getTenantId } from "@/lib/tenant";
import { notifyCustomer } from "@/lib/notifications";

// admin_user.id 解決は bootstrap（auth.users.email → admin_users.id mapping）
// なので service_role を継続使用。
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
    .eq("email", user.email.toLowerCase())
    .maybeSingle();
  return data?.id ?? null;
}

async function loadReturnRequest(requestId: string, tenantId: string) {
  const supabase = await getSupabaseTenant();
  const { data: req } = await supabase
    .from("return_requests")
    .select("id, status, order_item_id, requested_quantity_delta")
    .eq("id", requestId)
    .maybeSingle();
  if (!req || req.status !== "pending") return null;

  const { data: item } = await supabase
    .from("order_items")
    .select("id, quantity, returned_quantity, material_name, order_id, orders(id, tenant_id, order_number, customer_id)")
    .eq("id", req.order_item_id)
    .maybeSingle();
  if (!item) return null;
  const order = (item as unknown as {
    orders: { id: string; tenant_id: string; order_number: string; customer_id: string | null } | null;
  }).orders;
  if (!order || order.tenant_id !== tenantId) return null;

  return {
    req: {
      id: req.id,
      orderItemId: req.order_item_id,
      delta: req.requested_quantity_delta as number,
    },
    item: {
      id: item.id as string,
      quantity: item.quantity as number,
      returnedQuantity: item.returned_quantity as number,
      materialName: item.material_name as string,
      orderId: order.id,
      orderNumber: order.order_number,
    },
  };
}

async function loadExtensionRequest(requestId: string, tenantId: string) {
  const supabase = await getSupabaseTenant();
  const { data: req } = await supabase
    .from("lease_extensions")
    .select("id, status, order_item_id, new_end_date, previous_end_date")
    .eq("id", requestId)
    .maybeSingle();
  if (!req || req.status !== "pending") return null;

  const { data: item } = await supabase
    .from("order_items")
    .select("id, material_name, orders(id, tenant_id, order_number)")
    .eq("id", req.order_item_id)
    .maybeSingle();
  if (!item) return null;
  const order = (item as unknown as {
    orders: { id: string; tenant_id: string; order_number: string } | null;
  }).orders;
  if (!order || order.tenant_id !== tenantId) return null;

  return {
    req: {
      id: req.id,
      orderItemId: req.order_item_id,
      newEndDate: req.new_end_date as string,
      previousEndDate: req.previous_end_date as string,
    },
    item: {
      id: item.id as string,
      materialName: item.material_name as string,
      orderId: order.id,
      orderNumber: order.order_number,
    },
  };
}

function invalidate(orderId: string) {
  revalidatePath("/admin/requests");
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/rentals");
  revalidatePath(`/rentals/${orderId}`);
}

export async function acknowledgeReturn(requestId: string) {
  const tenantId = await getTenantId();
  const loaded = await loadReturnRequest(requestId, tenantId);
  if (!loaded) throw new Error("対象の申請が見つかりません");
  const adminId = await currentAdminUserId(tenantId);
  const supabase = await getSupabaseTenant();
  const now = new Date().toISOString();

  const newReturned = loaded.item.returnedQuantity + loaded.req.delta;
  if (newReturned > loaded.item.quantity) {
    throw new Error("返却数量が発注数量を超えるため受領できません");
  }

  const { error: e1 } = await supabase
    .from("return_requests")
    .update({
      status: "acknowledged",
      acknowledged_at: now,
      acknowledged_by_admin_id: adminId,
    })
    .eq("id", requestId);
  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from("order_items")
    .update({ returned_quantity: newReturned })
    .eq("id", loaded.item.id);
  if (e2) throw e2;

  const { data: siblings } = await supabase
    .from("order_items")
    .select("quantity, returned_quantity")
    .eq("order_id", loaded.item.orderId);
  const allReturned = (siblings ?? []).every(
    (s) => (s.returned_quantity as number) >= (s.quantity as number)
  );
  if (allReturned) {
    await supabase
      .from("orders")
      .update({ status: "completed", completed_at: now })
      .eq("id", loaded.item.orderId)
      .eq("tenant_id", tenantId);
  }

  invalidate(loaded.item.orderId);
  await notifyCustomer(loaded.item.orderId, "return_acknowledged", {
    itemSummary: `${loaded.item.materialName} ×${loaded.req.delta}`,
  });
}

export async function rejectReturn(requestId: string, reason: string) {
  const tenantId = await getTenantId();
  const loaded = await loadReturnRequest(requestId, tenantId);
  if (!loaded) throw new Error("対象の申請が見つかりません");
  const adminId = await currentAdminUserId(tenantId);
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("却下理由を入力してください");
  const supabase = await getSupabaseTenant();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("return_requests")
    .update({
      status: "rejected",
      rejected_at: now,
      acknowledged_by_admin_id: adminId,
      reject_reason: trimmed,
    })
    .eq("id", requestId);
  if (error) throw error;

  invalidate(loaded.item.orderId);
  await notifyCustomer(loaded.item.orderId, "return_rejected", {
    rejectReason: trimmed,
    itemSummary: `${loaded.item.materialName} ×${loaded.req.delta}`,
  });
}

export async function acknowledgeExtension(requestId: string) {
  const tenantId = await getTenantId();
  const loaded = await loadExtensionRequest(requestId, tenantId);
  if (!loaded) throw new Error("対象の申請が見つかりません");
  const adminId = await currentAdminUserId(tenantId);
  const supabase = await getSupabaseTenant();
  const now = new Date().toISOString();

  const { error: e1 } = await supabase
    .from("lease_extensions")
    .update({
      status: "acknowledged",
      acknowledged_at: now,
      acknowledged_by_admin_id: adminId,
    })
    .eq("id", requestId);
  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from("order_items")
    .update({ lease_end_date: loaded.req.newEndDate })
    .eq("id", loaded.item.id);
  if (e2) throw e2;

  invalidate(loaded.item.orderId);
  await notifyCustomer(loaded.item.orderId, "extension_acknowledged", {
    itemSummary: `${loaded.item.materialName} → ${loaded.req.newEndDate}`,
  });
}

export async function rejectExtension(requestId: string, reason: string) {
  const tenantId = await getTenantId();
  const loaded = await loadExtensionRequest(requestId, tenantId);
  if (!loaded) throw new Error("対象の申請が見つかりません");
  const adminId = await currentAdminUserId(tenantId);
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("却下理由を入力してください");
  const supabase = await getSupabaseTenant();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("lease_extensions")
    .update({
      status: "rejected",
      rejected_at: now,
      acknowledged_by_admin_id: adminId,
      reject_reason: trimmed,
    })
    .eq("id", requestId);
  if (error) throw error;

  invalidate(loaded.item.orderId);
  await notifyCustomer(loaded.item.orderId, "extension_rejected", {
    rejectReason: trimmed,
    itemSummary: `${loaded.item.materialName} → ${loaded.req.newEndDate}`,
  });
}
