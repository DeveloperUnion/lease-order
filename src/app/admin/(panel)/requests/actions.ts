"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseTenant } from "@/lib/supabase-tenant";
import { getTenantId } from "@/lib/tenant";
import { notifyCustomer } from "@/lib/notifications";
import { currentAdminUserId } from "@/lib/current-admin";

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

// ============================================================
// 発注単位の一括承認
// ============================================================

function buildItemSummary(parts: string[]): string {
  if (parts.length <= 5) return parts.join("、");
  return parts.slice(0, 5).join("、") + ` ほか${parts.length - 5}件`;
}

async function loadOrderForBulk(orderId: string, tenantId: string) {
  const supabase = await getSupabaseTenant();
  const { data, error } = await supabase
    .from("orders")
    .select("id, tenant_id, order_number")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.tenant_id !== tenantId) return null;
  return data as { id: string; tenant_id: string; order_number: string };
}

type PendingReturnForBulk = {
  id: string;
  order_item_id: string;
  requested_quantity_delta: number;
  order_items: {
    id: string;
    quantity: number;
    returned_quantity: number;
    material_name: string;
    order_id: string;
  } | null;
};

type PendingExtensionForBulk = {
  id: string;
  order_item_id: string;
  new_end_date: string;
  previous_end_date: string;
  order_items: {
    id: string;
    material_name: string;
    order_id: string;
  } | null;
};

export async function acknowledgeReturnsForOrder(orderId: string): Promise<number> {
  const tenantId = await getTenantId();
  const order = await loadOrderForBulk(orderId, tenantId);
  if (!order) throw new Error("対象の発注が見つかりません");
  const adminId = await currentAdminUserId(tenantId);
  const supabase = await getSupabaseTenant();
  const now = new Date().toISOString();

  const { data: rawList, error: listErr } = await supabase
    .from("return_requests")
    .select(
      "id, order_item_id, requested_quantity_delta, order_items!inner(id, quantity, returned_quantity, material_name, order_id)"
    )
    .eq("status", "pending")
    .eq("order_items.order_id", orderId);
  if (listErr) throw listErr;
  const list = (rawList ?? []) as unknown as PendingReturnForBulk[];
  if (list.length === 0) return 0;

  // 同一 order_item に複数 pending が来る可能性は薄いが、念のため item 単位で集計
  const newReturnedByItem = new Map<
    string,
    { quantity: number; returnedQuantity: number; materialName: string; delta: number }
  >();
  for (const r of list) {
    if (!r.order_items) continue;
    const cur = newReturnedByItem.get(r.order_item_id) ?? {
      quantity: r.order_items.quantity,
      returnedQuantity: r.order_items.returned_quantity,
      materialName: r.order_items.material_name,
      delta: 0,
    };
    cur.delta += r.requested_quantity_delta;
    newReturnedByItem.set(r.order_item_id, cur);
  }
  for (const [, v] of newReturnedByItem) {
    if (v.returnedQuantity + v.delta > v.quantity) {
      throw new Error(
        `${v.materialName} の返却数量が発注数量を超えるため一括処理できません。個別に確認してください。`
      );
    }
  }

  const requestIds = list.map((r) => r.id);
  const { error: updReqErr } = await supabase
    .from("return_requests")
    .update({
      status: "acknowledged",
      acknowledged_at: now,
      acknowledged_by_admin_id: adminId,
    })
    .in("id", requestIds);
  if (updReqErr) throw updReqErr;

  for (const [itemId, v] of newReturnedByItem) {
    const { error } = await supabase
      .from("order_items")
      .update({ returned_quantity: v.returnedQuantity + v.delta })
      .eq("id", itemId);
    if (error) throw error;
  }

  // 発注全体の返却完了チェック
  const { data: siblings } = await supabase
    .from("order_items")
    .select("quantity, returned_quantity")
    .eq("order_id", orderId);
  const allReturned = (siblings ?? []).every(
    (s) => (s.returned_quantity as number) >= (s.quantity as number)
  );
  if (allReturned) {
    await supabase
      .from("orders")
      .update({ status: "completed", completed_at: now })
      .eq("id", orderId)
      .eq("tenant_id", tenantId);
  }

  invalidate(orderId);
  const summary = buildItemSummary(
    Array.from(newReturnedByItem.values()).map((v) => `${v.materialName} ×${v.delta}`)
  );
  await notifyCustomer(orderId, "return_acknowledged", { itemSummary: summary });
  return list.length;
}

export async function acknowledgeExtensionsForOrder(orderId: string): Promise<number> {
  const tenantId = await getTenantId();
  const order = await loadOrderForBulk(orderId, tenantId);
  if (!order) throw new Error("対象の発注が見つかりません");
  const adminId = await currentAdminUserId(tenantId);
  const supabase = await getSupabaseTenant();
  const now = new Date().toISOString();

  const { data: rawList, error: listErr } = await supabase
    .from("lease_extensions")
    .select(
      "id, order_item_id, new_end_date, previous_end_date, order_items!inner(id, material_name, order_id)"
    )
    .eq("status", "pending")
    .eq("order_items.order_id", orderId);
  if (listErr) throw listErr;
  const list = (rawList ?? []) as unknown as PendingExtensionForBulk[];
  if (list.length === 0) return 0;

  const requestIds = list.map((e) => e.id);
  const { error: updReqErr } = await supabase
    .from("lease_extensions")
    .update({
      status: "acknowledged",
      acknowledged_at: now,
      acknowledged_by_admin_id: adminId,
    })
    .in("id", requestIds);
  if (updReqErr) throw updReqErr;

  // 各 order_item の lease_end_date を新返却日に更新（item ごとに値が違うので逐次）
  for (const e of list) {
    if (!e.order_items) continue;
    const { error } = await supabase
      .from("order_items")
      .update({ lease_end_date: e.new_end_date })
      .eq("id", e.order_item_id);
    if (error) throw error;
  }

  invalidate(orderId);
  const summary = buildItemSummary(
    list
      .filter((e) => e.order_items)
      .map((e) => `${e.order_items!.material_name} → ${e.new_end_date}`)
  );
  await notifyCustomer(orderId, "extension_acknowledged", { itemSummary: summary });
  return list.length;
}
