"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseTenant } from "@/lib/supabase-tenant";
import { getCurrentCustomer } from "@/lib/customer-auth";

export type ItemAction =
  | { type: "return"; orderItemId: string; returnedQuantity: number }
  | { type: "extend"; orderItemId: string; newEndDate: string; reason?: string };

export type ProcessResult = { ok: true } | { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function processItemActions(input: { orderId: string; actions: ItemAction[] }): Promise<ProcessResult> {
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false, error: "ログインが必要です" };

  if (!input.actions.length) return { ok: false, error: "操作する項目がありません" };

  const supabase = await getSupabaseTenant();

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, customer_id, tenant_id, status, order_items(id, quantity, returned_quantity, lease_end_date)")
    .eq("id", input.orderId)
    .maybeSingle();

  if (orderErr) {
    console.error("processItemActions: order fetch", orderErr);
    return { ok: false, error: "受注情報の取得に失敗しました" };
  }
  if (!order) return { ok: false, error: "受注が見つかりません" };
  if (order.tenant_id !== customer.tenant_id) return { ok: false, error: "受注が見つかりません" };
  if (order.customer_id !== customer.id) return { ok: false, error: "この受注を操作する権限がありません" };
  if (order.status === "cancelled" || order.status === "completed") {
    return { ok: false, error: "この受注は既にクローズされています" };
  }

  const itemMap = new Map<string, { id: string; quantity: number; returned_quantity: number; lease_end_date: string | null }>();
  for (const it of (order.order_items ?? []) as { id: string; quantity: number; returned_quantity: number; lease_end_date: string | null }[]) {
    itemMap.set(it.id, it);
  }

  for (const a of input.actions) {
    const item = itemMap.get(a.orderItemId);
    if (!item) return { ok: false, error: "対象の明細が見つかりません" };

    if (a.type === "return") {
      const requested = Math.floor(Number(a.returnedQuantity));
      if (!Number.isFinite(requested) || requested < 0) {
        return { ok: false, error: "返却数量が不正です" };
      }
      if (requested > item.quantity) {
        return { ok: false, error: "返却数量が発注数量を超えています" };
      }
      if (requested < item.returned_quantity) {
        return { ok: false, error: "返却数量を減らすことはできません" };
      }
      if (requested === item.returned_quantity) continue;

      const { error } = await supabase
        .from("order_items")
        .update({ returned_quantity: requested })
        .eq("id", item.id);
      if (error) {
        console.error("processItemActions: update returned_quantity", error);
        return { ok: false, error: "返却の登録に失敗しました" };
      }
      item.returned_quantity = requested;
    } else if (a.type === "extend") {
      if (!ISO_DATE.test(a.newEndDate)) {
        return { ok: false, error: "延長日付の形式が不正です" };
      }
      const previous = item.lease_end_date;
      if (previous && a.newEndDate <= previous) {
        return { ok: false, error: "延長後の期限は現在の期限より後の日付にしてください" };
      }
      const { error: updErr } = await supabase
        .from("order_items")
        .update({ lease_end_date: a.newEndDate })
        .eq("id", item.id);
      if (updErr) {
        console.error("processItemActions: update lease_end_date", updErr);
        return { ok: false, error: "期限延長の登録に失敗しました" };
      }
      const { error: extErr } = await supabase.from("lease_extensions").insert({
        tenant_id: customer.tenant_id,
        order_item_id: item.id,
        previous_end_date: previous ?? a.newEndDate,
        new_end_date: a.newEndDate,
        reason: a.reason?.trim() || null,
        requested_by_customer_id: customer.id,
      });
      if (extErr) {
        console.error("processItemActions: extension insert", extErr);
        return { ok: false, error: "期限延長の履歴登録に失敗しました" };
      }
      item.lease_end_date = a.newEndDate;
    }
  }

  const allReturned = Array.from(itemMap.values()).every((it) => it.returned_quantity >= it.quantity);
  if (allReturned) {
    const { error } = await supabase
      .from("orders")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", input.orderId);
    if (error) {
      console.error("processItemActions: order completed update", error);
    }
  }

  revalidatePath("/rentals");
  revalidatePath(`/rentals/${input.orderId}`);
  return { ok: true };
}
