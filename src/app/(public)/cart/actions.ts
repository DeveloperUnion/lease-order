"use server";

import { notifyAdmins, notifyCustomer } from "@/lib/notifications";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getTenantId } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer-auth";
import type { DeliveryMethod } from "@/lib/types";

type SubmitOrderInput = {
  siteName: string;
  contactName: string;
  phone: string;
  note: string;
  deliveryMethod: DeliveryMethod;
  deliveryAddress: string;
  pickupOfficeId: string;
  leaseStartDate: string;
  leaseEndDate: string;
  items: { materialId: string; quantity: number }[];
};

export type SubmitOrderResult =
  | { ok: true; orderNumber: string }
  | { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function submitOrder(
  input: SubmitOrderInput
): Promise<SubmitOrderResult> {
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false, error: "ログインが必要です" };

  const siteName = input.siteName.trim();
  const contactName = input.contactName.trim();

  if (!siteName) return { ok: false, error: "現場名を入力してください" };
  if (!contactName) return { ok: false, error: "担当者名を入力してください" };
  if (!input.items.length) return { ok: false, error: "カートが空です" };

  if (input.deliveryMethod !== "delivery" && input.deliveryMethod !== "pickup") {
    return { ok: false, error: "受取方法を選択してください" };
  }

  if (!ISO_DATE.test(input.leaseStartDate) || !ISO_DATE.test(input.leaseEndDate)) {
    return { ok: false, error: "リース期間を入力してください" };
  }
  if (input.leaseEndDate < input.leaseStartDate) {
    return { ok: false, error: "リース終了日は開始日以降の日付を指定してください" };
  }

  const deliveryAddress = input.deliveryAddress.trim();
  const pickupOfficeId = input.pickupOfficeId.trim();

  if (input.deliveryMethod === "delivery" && !deliveryAddress) {
    return { ok: false, error: "現場住所を入力してください" };
  }
  if (input.deliveryMethod === "pickup" && !pickupOfficeId) {
    return { ok: false, error: "引取営業所を選択してください" };
  }

  const items = input.items
    .map((i) => ({
      materialId: String(i.materialId),
      quantity: Math.max(1, Math.floor(Number(i.quantity) || 0)),
    }))
    .filter((i) => i.materialId);

  if (!items.length) return { ok: false, error: "有効な明細がありません" };

  const tenantId = await getTenantId();
  if (customer.tenant_id !== tenantId) {
    return { ok: false, error: "テナントが一致しません" };
  }

  if (input.deliveryMethod === "pickup") {
    const { data: office, error: officeErr } = await supabaseAdmin
      .from("offices")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", pickupOfficeId)
      .eq("is_active", true)
      .maybeSingle();
    if (officeErr) {
      console.error("submitOrder: office lookup failed", officeErr);
      return { ok: false, error: "発注の登録に失敗しました" };
    }
    if (!office) return { ok: false, error: "選択された営業所が見つかりません" };
  }

  const { data: materials, error: matErr } = await supabaseAdmin
    .from("materials")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .in(
      "id",
      items.map((i) => i.materialId)
    );

  if (matErr) {
    console.error("submitOrder: materials lookup failed", matErr);
    return { ok: false, error: "発注の登録に失敗しました" };
  }

  const materialMap = new Map(materials?.map((m) => [m.id, m.name]) ?? []);
  const missing = items.filter((i) => !materialMap.has(i.materialId));
  if (missing.length) {
    return { ok: false, error: "存在しない資材が含まれています" };
  }

  const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .insert({
      tenant_id: tenantId,
      order_number: orderNumber,
      customer_id: customer.id,
      site_name: siteName,
      company_name: customer.name,
      contact_name: contactName,
      phone: input.phone.trim() || customer.phone || null,
      email: customer.contact_email,
      note: input.note.trim() || null,
      delivery_method: input.deliveryMethod,
      delivery_address:
        input.deliveryMethod === "delivery" ? deliveryAddress : null,
      pickup_office_id:
        input.deliveryMethod === "pickup" ? pickupOfficeId : null,
      lease_start_date: input.leaseStartDate,
      lease_end_date: input.leaseEndDate,
      status: "pending",
    })
    .select("id")
    .single();

  if (orderErr || !order) {
    console.error("submitOrder: order insert failed", orderErr);
    return { ok: false, error: "発注の登録に失敗しました" };
  }

  const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(
    items.map((i) => ({
      order_id: order.id,
      material_id: i.materialId,
      material_name: materialMap.get(i.materialId)!,
      quantity: i.quantity,
      lease_end_date: input.leaseEndDate,
    }))
  );

  if (itemsErr) {
    console.error("submitOrder: order_items insert failed", itemsErr);
    await supabaseAdmin.from("orders").delete().eq("id", order.id);
    return { ok: false, error: "発注の登録に失敗しました" };
  }

  const itemSummary = items
    .slice(0, 5)
    .map((i) => `${materialMap.get(i.materialId)} ×${i.quantity}`)
    .join("、")
    + (items.length > 5 ? ` ほか${items.length - 5}品目` : "");
  const ctx = {
    orderNumber,
    companyName: customer.name,
    contactName,
    itemSummary,
  };
  await notifyAdmins(tenantId, "admin_new_order", ctx, order.id);
  await notifyCustomer(order.id, "order_received", { itemSummary });

  return { ok: true, orderNumber };
}
