"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseTenant } from "@/lib/supabase-tenant";
import { getTenantId } from "@/lib/tenant";
import { notifyCustomer } from "@/lib/notifications";
import { currentAdminUserId } from "./_helpers";

// admin_user.id 解決は bootstrap（auth.users.email → admin_users.id mapping）
// なので service_role を継続使用。
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

async function loadReturnRequest(
  requestId: string,
  tenantId: string,
  expectedStatus: "pending" | "scheduled"
) {
  const supabase = await getSupabaseTenant();
  const { data: req } = await supabase
    .from("return_requests")
    .select(
      "id, status, order_item_id, requested_quantity_delta, transport_method, scheduled_date, dropoff_office_id"
    )
    .eq("id", requestId)
    .maybeSingle();
  if (!req || req.status !== expectedStatus) return null;

  const { data: item } = await supabase
    .from("order_items")
    .select(
      "id, quantity, returned_quantity, lost_quantity, material_name, order_id, orders(id, tenant_id, order_number, customer_id)"
    )
    .eq("id", req.order_item_id)
    .maybeSingle();
  if (!item) return null;
  const order = (
    item as unknown as {
      orders: {
        id: string;
        tenant_id: string;
        order_number: string;
        customer_id: string | null;
      } | null;
    }
  ).orders;
  if (!order || order.tenant_id !== tenantId) return null;

  return {
    req: {
      id: req.id as string,
      orderItemId: req.order_item_id as string,
      delta: req.requested_quantity_delta as number,
      transportMethod: req.transport_method as "pickup" | "dropoff" | null,
      scheduledDate: req.scheduled_date as string | null,
      dropoffOfficeId: req.dropoff_office_id as string | null,
    },
    item: {
      id: item.id as string,
      quantity: item.quantity as number,
      returnedQuantity: item.returned_quantity as number,
      lostQuantity: (item.lost_quantity as number | null) ?? 0,
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
  const order = (
    item as unknown as {
      orders: { id: string; tenant_id: string; order_number: string } | null;
    }
  ).orders;
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

async function lookupOfficeName(officeId: string | null): Promise<string | undefined> {
  if (!officeId) return undefined;
  const supabase = await getSupabaseTenant();
  const { data } = await supabase
    .from("offices")
    .select("name")
    .eq("id", officeId)
    .maybeSingle();
  return (data?.name as string | undefined) ?? undefined;
}

// ============================================================
// 個別承認系
// ============================================================

export async function scheduleReturn(
  requestId: string,
  input: {
    transportMethod: "pickup" | "dropoff";
    scheduledDate: string;
    dropoffOfficeId?: string | null;
  }
) {
  const tenantId = await getTenantId();
  const loaded = await loadReturnRequest(requestId, tenantId, "pending");
  if (!loaded) throw new Error("対象の申請が見つかりません");
  if (input.transportMethod !== "pickup" && input.transportMethod !== "dropoff") {
    throw new Error("輸送手段の指定が不正です");
  }
  if (!ISO_DATE.test(input.scheduledDate)) {
    throw new Error("予定日の形式が不正です");
  }
  const dropoffOfficeId =
    input.transportMethod === "dropoff" ? input.dropoffOfficeId ?? null : null;
  if (input.transportMethod === "dropoff" && !dropoffOfficeId) {
    throw new Error("持ち込み先の業所を選択してください");
  }
  const adminId = await currentAdminUserId(tenantId);
  const supabase = await getSupabaseTenant();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("return_requests")
    .update({
      status: "scheduled",
      transport_method: input.transportMethod,
      scheduled_date: input.scheduledDate,
      dropoff_office_id: dropoffOfficeId,
      scheduled_at: now,
      scheduled_by_admin_id: adminId,
    })
    .eq("id", requestId);
  if (error) throw error;

  invalidate(loaded.item.orderId);
  const officeName = await lookupOfficeName(dropoffOfficeId);
  await notifyCustomer(loaded.item.orderId, "return_scheduled", {
    itemSummary: `${loaded.item.materialName} ×${loaded.req.delta}`,
    scheduledDate: input.scheduledDate,
    transportMethod: input.transportMethod,
    dropoffOfficeName: officeName,
  });
}

export async function completeReturn(
  requestId: string,
  input: {
    receivedQuantity: number;
    cancelledQuantity: number;
    lostQuantity: number;
    damagedQuantity?: number;
    damageNotes?: string;
  }
) {
  const tenantId = await getTenantId();
  const loaded = await loadReturnRequest(requestId, tenantId, "scheduled");
  if (!loaded) throw new Error("対象の予定が見つかりません");

  const received = Math.floor(Number(input.receivedQuantity));
  const cancelled = Math.floor(Number(input.cancelledQuantity));
  const lost = Math.floor(Number(input.lostQuantity));
  const damaged = Math.floor(Number(input.damagedQuantity ?? 0));
  if (
    !Number.isFinite(received) ||
    !Number.isFinite(cancelled) ||
    !Number.isFinite(lost) ||
    received < 0 ||
    cancelled < 0 ||
    lost < 0 ||
    damaged < 0
  ) {
    throw new Error("数量が不正です");
  }
  if (received + cancelled + lost !== loaded.req.delta) {
    throw new Error(
      `受領・キャンセル・損失の合計は申請数 ${loaded.req.delta} と一致する必要があります`
    );
  }
  if (damaged > received) {
    throw new Error("損傷数は受領数以下である必要があります");
  }
  const newReturned = loaded.item.returnedQuantity + received;
  const newLost = loaded.item.lostQuantity + lost;
  if (newReturned + newLost > loaded.item.quantity) {
    throw new Error("受領・損失の累計が発注数量を超えるため処理できません");
  }

  const adminId = await currentAdminUserId(tenantId);
  const supabase = await getSupabaseTenant();
  const now = new Date().toISOString();
  const damageNotes = input.damageNotes?.trim() || null;

  const { error: e1 } = await supabase
    .from("return_requests")
    .update({
      status: "completed",
      received_quantity: received,
      cancelled_quantity: cancelled,
      lost_quantity: lost,
      damaged_quantity: damaged,
      damage_notes: damageNotes,
      completed_at: now,
      completed_by_admin_id: adminId,
    })
    .eq("id", requestId);
  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from("order_items")
    .update({
      returned_quantity: newReturned,
      lost_quantity: newLost,
    })
    .eq("id", loaded.item.id);
  if (e2) throw e2;

  const { data: siblings } = await supabase
    .from("order_items")
    .select("quantity, returned_quantity, lost_quantity")
    .eq("order_id", loaded.item.orderId);
  const allAccounted = (siblings ?? []).every(
    (s) =>
      (s.returned_quantity as number) + ((s.lost_quantity as number | null) ?? 0) >=
      (s.quantity as number)
  );
  if (allAccounted) {
    await supabase
      .from("orders")
      .update({ status: "completed", completed_at: now })
      .eq("id", loaded.item.orderId)
      .eq("tenant_id", tenantId);
  }

  invalidate(loaded.item.orderId);
  await notifyCustomer(loaded.item.orderId, "return_completed", {
    itemSummary: `${loaded.item.materialName} ×${received}${
      cancelled + lost > 0 ? ` (キャンセル ${cancelled} / 損失 ${lost})` : ""
    }`,
    damageNotes: damageNotes ?? undefined,
  });
}

export async function rejectReturn(requestId: string, reason: string) {
  const tenantId = await getTenantId();
  const loaded = await loadReturnRequest(requestId, tenantId, "pending");
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

export async function cancelScheduledReturn(requestId: string, reason: string) {
  const tenantId = await getTenantId();
  const loaded = await loadReturnRequest(requestId, tenantId, "scheduled");
  if (!loaded) throw new Error("対象の予定が見つかりません");
  const adminId = await currentAdminUserId(tenantId);
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("取りやめ理由を入力してください");
  const supabase = await getSupabaseTenant();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("return_requests")
    .update({
      status: "cancelled",
      cancelled_at: now,
      cancelled_by_admin_id: adminId,
      cancel_reason: trimmed,
    })
    .eq("id", requestId);
  if (error) throw error;

  invalidate(loaded.item.orderId);
  await notifyCustomer(loaded.item.orderId, "return_cancelled", {
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
// 発注単位の一括予定確定（返却のみ）
//   - pending な返却申請をすべて同じ scheduled_date / transport_method で確定
//   - 受領は 1 件ずつ検品が必要なので bulk なし
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

export async function scheduleReturnsForOrder(
  orderId: string,
  input: {
    transportMethod: "pickup" | "dropoff";
    scheduledDate: string;
    dropoffOfficeId?: string | null;
  }
): Promise<number> {
  const tenantId = await getTenantId();
  const order = await loadOrderForBulk(orderId, tenantId);
  if (!order) throw new Error("対象の発注が見つかりません");
  if (input.transportMethod !== "pickup" && input.transportMethod !== "dropoff") {
    throw new Error("輸送手段の指定が不正です");
  }
  if (!ISO_DATE.test(input.scheduledDate)) {
    throw new Error("予定日の形式が不正です");
  }
  const dropoffOfficeId =
    input.transportMethod === "dropoff" ? input.dropoffOfficeId ?? null : null;
  if (input.transportMethod === "dropoff" && !dropoffOfficeId) {
    throw new Error("持ち込み先の業所を選択してください");
  }
  const adminId = await currentAdminUserId(tenantId);
  const supabase = await getSupabaseTenant();
  const now = new Date().toISOString();

  const { data: rawList, error: listErr } = await supabase
    .from("return_requests")
    .select(
      "id, order_item_id, requested_quantity_delta, order_items!inner(id, material_name, order_id)"
    )
    .eq("status", "pending")
    .eq("order_items.order_id", orderId);
  if (listErr) throw listErr;
  const list = (rawList ?? []) as unknown as PendingReturnForBulk[];
  if (list.length === 0) return 0;

  const requestIds = list.map((r) => r.id);
  const { error: updReqErr } = await supabase
    .from("return_requests")
    .update({
      status: "scheduled",
      transport_method: input.transportMethod,
      scheduled_date: input.scheduledDate,
      dropoff_office_id: dropoffOfficeId,
      scheduled_at: now,
      scheduled_by_admin_id: adminId,
    })
    .in("id", requestIds);
  if (updReqErr) throw updReqErr;

  invalidate(orderId);
  const officeName = await lookupOfficeName(dropoffOfficeId);
  const summary = buildItemSummary(
    list
      .filter((r) => r.order_items)
      .map((r) => `${r.order_items!.material_name} ×${r.requested_quantity_delta}`)
  );
  await notifyCustomer(orderId, "return_scheduled", {
    itemSummary: summary,
    scheduledDate: input.scheduledDate,
    transportMethod: input.transportMethod,
    dropoffOfficeName: officeName,
  });
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
