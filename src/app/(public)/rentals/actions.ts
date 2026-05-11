"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseTenant } from "@/lib/supabase-tenant";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { getTenantId } from "@/lib/tenant";
import { notifyAdmins } from "@/lib/notifications";

export type ItemAction =
  | { type: "return"; orderItemId: string; deltaQuantity: number }
  | { type: "extend"; orderItemId: string; newEndDate: string; reason?: string };

export type ProcessResult = { ok: true } | { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type OrderRow = {
  id: string;
  customer_id: string | null;
  tenant_id: string;
  status: string;
  order_number: string;
  company_name: string;
  contact_name: string;
  order_items:
    | {
        id: string;
        material_name: string;
        quantity: number;
        returned_quantity: number;
        lease_end_date: string | null;
      }[]
    | null;
};

export async function processItemActions(input: {
  orderId: string;
  actions: ItemAction[];
}): Promise<ProcessResult> {
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false, error: "ログインが必要です" };
  if (!input.actions.length) return { ok: false, error: "操作する項目がありません" };

  const supabase = await getSupabaseTenant();

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(
      "id, customer_id, tenant_id, status, order_number, company_name, contact_name, order_items(id, material_name, quantity, returned_quantity, lease_end_date)"
    )
    .eq("id", input.orderId)
    .maybeSingle();

  if (orderErr) {
    console.error("processItemActions: order fetch", orderErr);
    return { ok: false, error: "受注情報の取得に失敗しました" };
  }
  if (!order) return { ok: false, error: "受注が見つかりません" };
  const o = order as unknown as OrderRow;
  if (o.tenant_id !== customer.tenant_id) return { ok: false, error: "受注が見つかりません" };
  if (o.customer_id !== customer.id) return { ok: false, error: "この受注を操作する権限がありません" };
  if (o.status === "cancelled" || o.status === "completed") {
    return { ok: false, error: "この受注は既にクローズされています" };
  }

  type Item = OrderRow["order_items"] extends (infer U)[] | null ? U : never;
  const itemMap = new Map<string, Item>();
  for (const it of o.order_items ?? []) itemMap.set(it.id, it);

  const itemIds = Array.from(itemMap.keys());

  // Pull pending return / extension counts so we can prevent double-submission.
  const pendingReturnDelta = new Map<string, number>();
  const pendingExtensionItems = new Set<string>();
  if (itemIds.length > 0) {
    const [{ data: pendingReturns }, { data: pendingExtensions }] = await Promise.all([
      supabase
        .from("return_requests")
        .select("order_item_id, requested_quantity_delta")
        .in("order_item_id", itemIds)
        .eq("status", "pending"),
      supabase
        .from("lease_extensions")
        .select("order_item_id")
        .in("order_item_id", itemIds)
        .eq("status", "pending"),
    ]);
    for (const r of (pendingReturns ?? []) as { order_item_id: string; requested_quantity_delta: number }[]) {
      pendingReturnDelta.set(
        r.order_item_id,
        (pendingReturnDelta.get(r.order_item_id) ?? 0) + r.requested_quantity_delta
      );
    }
    for (const e of (pendingExtensions ?? []) as { order_item_id: string }[]) {
      pendingExtensionItems.add(e.order_item_id);
    }
  }

  type ParsedReturn = { item: Item; delta: number };
  type ParsedExtend = {
    item: Item;
    previousEndDate: string | null;
    newEndDate: string;
    reason: string;
  };
  const returns: ParsedReturn[] = [];
  const extensions: ParsedExtend[] = [];

  for (const a of input.actions) {
    const item = itemMap.get(a.orderItemId);
    if (!item) return { ok: false, error: "対象の明細が見つかりません" };

    if (a.type === "return") {
      const delta = Math.floor(Number(a.deltaQuantity));
      if (!Number.isFinite(delta) || delta <= 0) {
        return { ok: false, error: "返却数量が不正です" };
      }
      const alreadyPending = pendingReturnDelta.get(item.id) ?? 0;
      const available = item.quantity - item.returned_quantity - alreadyPending;
      if (delta > available) {
        return { ok: false, error: "申請中・返却済みを除いた残りを超えています" };
      }
      returns.push({ item, delta });
    } else if (a.type === "extend") {
      if (!ISO_DATE.test(a.newEndDate)) {
        return { ok: false, error: "延長日付の形式が不正です" };
      }
      if (item.lease_end_date && a.newEndDate <= item.lease_end_date) {
        return { ok: false, error: "延長後の期限は現在の期限より後の日付にしてください" };
      }
      if (pendingExtensionItems.has(item.id)) {
        return { ok: false, error: "この明細はすでに延長申請中です" };
      }
      extensions.push({
        item,
        previousEndDate: item.lease_end_date,
        newEndDate: a.newEndDate,
        reason: a.reason?.trim() ?? "",
      });
    }
  }

  if (returns.length > 0) {
    const { error } = await supabase.from("return_requests").insert(
      returns.map((r) => ({
        tenant_id: customer.tenant_id,
        order_item_id: r.item.id,
        requested_quantity_delta: r.delta,
        requested_by_customer_id: customer.id,
      }))
    );
    if (error) {
      console.error("processItemActions: return_requests insert", error);
      return { ok: false, error: "返却申請の登録に失敗しました" };
    }
  }

  if (extensions.length > 0) {
    const { error } = await supabase.from("lease_extensions").insert(
      extensions.map((e) => ({
        tenant_id: customer.tenant_id,
        order_item_id: e.item.id,
        previous_end_date: e.previousEndDate ?? e.newEndDate,
        new_end_date: e.newEndDate,
        reason: e.reason || null,
        requested_by_customer_id: customer.id,
      }))
    );
    if (error) {
      console.error("processItemActions: lease_extensions insert", error);
      return { ok: false, error: "期限延長申請の登録に失敗しました" };
    }
  }

  revalidatePath("/rentals");
  revalidatePath(`/rentals/${input.orderId}`);
  revalidatePath("/admin/requests");
  revalidatePath("/admin");

  const tenantId = await getTenantId();
  const baseCtx = {
    orderNumber: o.order_number,
    companyName: o.company_name,
    contactName: o.contact_name,
  };

  if (returns.length > 0) {
    const summary =
      returns
        .slice(0, 5)
        .map((r) => `${r.item.material_name} ×${r.delta}`)
        .join("、") +
      (returns.length > 5 ? ` ほか${returns.length - 5}品目` : "");
    await notifyAdmins(
      tenantId,
      "return_requested",
      { ...baseCtx, itemSummary: summary },
      input.orderId
    );
  }
  if (extensions.length > 0) {
    const summary =
      extensions
        .slice(0, 5)
        .map((e) => `${e.item.material_name} → ${e.newEndDate}`)
        .join("、") +
      (extensions.length > 5 ? ` ほか${extensions.length - 5}件` : "");
    await notifyAdmins(
      tenantId,
      "extension_requested",
      { ...baseCtx, itemSummary: summary },
      input.orderId
    );
  }

  return { ok: true };
}
