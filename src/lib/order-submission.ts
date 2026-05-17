import "server-only";

import { notifyAdmins } from "@/lib/notifications";
import { getSupabaseTenant } from "@/lib/supabase-tenant";
import { getTenantId } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer-auth";
import type { DeliveryMethod, SpecSelectionLabel } from "@/lib/types";

export type SubmitOrderInput = {
  siteName: string;
  contactName: string;
  phone: string;
  note: string;
  deliveryMethod: DeliveryMethod;
  deliveryAddress: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  pickupOfficeId: string;
  leaseStartDate: string;
  leaseEndDate: string;
  items: {
    materialId: string;
    quantity: number;
    selections: SpecSelectionLabel[];
  }[];
};

export type SubmitOrderResult =
  | { ok: true; orderNumber: string; duplicate: boolean }
  | { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PG_UNIQUE_VIOLATION = "23505";

function sanitizeCoord(v: number | null, min: number, max: number): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function orderNumberFromClientRequestId(id: string): string {
  return `ORD-${id.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

export async function submitOrderCore(
  input: SubmitOrderInput,
  clientRequestId: string
): Promise<SubmitOrderResult> {
  if (!UUID_RE.test(clientRequestId)) {
    return { ok: false, error: "client_request_id が不正です" };
  }

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
      selections: Array.isArray(i.selections) ? i.selections : [],
    }))
    .filter((i) => i.materialId);

  if (!items.length) return { ok: false, error: "有効な明細がありません" };

  const tenantId = await getTenantId();
  if (customer.tenant_id !== tenantId) {
    return { ok: false, error: "テナントが一致しません" };
  }

  const supabase = await getSupabaseTenant();

  // 冪等性チェック: 既に同 (tenant_id, client_request_id) の order があれば
  // 重複送信なので、その order_number を返して終わり。
  {
    const { data: existing, error: lookupErr } = await supabase
      .from("orders")
      .select("order_number")
      .eq("tenant_id", tenantId)
      .eq("client_request_id", clientRequestId)
      .maybeSingle();
    if (lookupErr) {
      console.error("submitOrderCore: idempotency lookup failed", lookupErr);
      return { ok: false, error: "発注の登録に失敗しました" };
    }
    if (existing) {
      return { ok: true, orderNumber: existing.order_number, duplicate: true };
    }
  }

  if (input.deliveryMethod === "pickup") {
    const { data: office, error: officeErr } = await supabase
      .from("offices")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", pickupOfficeId)
      .eq("is_active", true)
      .maybeSingle();
    if (officeErr) {
      console.error("submitOrderCore: office lookup failed", officeErr);
      return { ok: false, error: "発注の登録に失敗しました" };
    }
    if (!office) return { ok: false, error: "選択された営業所が見つかりません" };
  }

  const { data: materials, error: matErr } = await supabase
    .from("materials")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .in(
      "id",
      items.map((i) => i.materialId)
    );

  if (matErr) {
    console.error("submitOrderCore: materials lookup failed", matErr);
    return { ok: false, error: "発注の登録に失敗しました" };
  }

  const materialMap = new Map(materials?.map((m) => [m.id, m.name]) ?? []);
  const missing = items.filter((i) => !materialMap.has(i.materialId));
  if (missing.length) {
    return { ok: false, error: "存在しない資材が含まれています" };
  }

  // 参照されている spec_option が、その material に属する active な
  // spec_group/option として存在することを validate
  const optionIds = Array.from(
    new Set(items.flatMap((i) => i.selections.map((s) => s.spec_option_id)))
  );
  if (optionIds.length > 0) {
    const { data: validOptions, error: optErr } = await supabase
      .from("spec_options")
      .select("id, spec_group_id, is_active, spec_groups!inner(id, material_id, is_active)")
      .eq("tenant_id", tenantId)
      .in("id", optionIds);
    if (optErr) {
      console.error("submitOrderCore: spec_options lookup failed", optErr);
      return { ok: false, error: "発注の登録に失敗しました" };
    }
    type OptRow = {
      id: string;
      spec_group_id: string;
      is_active: boolean;
      spec_groups: { id: string; material_id: string; is_active: boolean } | null;
    };
    const optMap = new Map<string, OptRow>(
      ((validOptions ?? []) as unknown as OptRow[]).map((o) => [o.id, o])
    );
    for (const it of items) {
      for (const s of it.selections) {
        const o = optMap.get(s.spec_option_id);
        if (
          !o ||
          !o.is_active ||
          !o.spec_groups ||
          !o.spec_groups.is_active ||
          o.spec_groups.material_id !== it.materialId ||
          o.spec_group_id !== s.spec_group_id
        ) {
          return {
            ok: false,
            error: "仕様の構成が変更されました。カートを更新してください。",
          };
        }
      }
    }
  }

  const orderNumber = orderNumberFromClientRequestId(clientRequestId);

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      tenant_id: tenantId,
      order_number: orderNumber,
      client_request_id: clientRequestId,
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
      delivery_lat:
        input.deliveryMethod === "delivery"
          ? sanitizeCoord(input.deliveryLat, -90, 90)
          : null,
      delivery_lng:
        input.deliveryMethod === "delivery"
          ? sanitizeCoord(input.deliveryLng, -180, 180)
          : null,
      pickup_office_id:
        input.deliveryMethod === "pickup" ? pickupOfficeId : null,
      lease_start_date: input.leaseStartDate,
      lease_end_date: input.leaseEndDate,
      status: "pending",
    })
    .select("id")
    .single();

  if (orderErr || !order) {
    // 並走リクエストで先に insert された場合（unique violation）は
    // それを冪等成功として扱う。
    if (orderErr?.code === PG_UNIQUE_VIOLATION) {
      const { data: raced } = await supabase
        .from("orders")
        .select("order_number")
        .eq("tenant_id", tenantId)
        .eq("client_request_id", clientRequestId)
        .maybeSingle();
      if (raced) {
        return { ok: true, orderNumber: raced.order_number, duplicate: true };
      }
    }
    console.error("submitOrderCore: order insert failed", orderErr);
    return { ok: false, error: "発注の登録に失敗しました" };
  }

  // order_items は select("id") で各行の id を取り、選択肢の bulk insert に使う
  const { data: insertedItems, error: itemsErr } = await supabase
    .from("order_items")
    .insert(
      items.map((i) => ({
        tenant_id: tenantId,
        order_id: order.id,
        material_id: i.materialId,
        material_name: materialMap.get(i.materialId)!,
        quantity: i.quantity,
        lease_end_date: input.leaseEndDate,
      }))
    )
    .select("id");

  if (itemsErr || !insertedItems) {
    console.error("submitOrderCore: order_items insert failed", itemsErr);
    await supabase.from("orders").delete().eq("id", order.id);
    return { ok: false, error: "発注の登録に失敗しました" };
  }

  // order_item_spec_options を bulk insert（同じ順序で対応）
  const specRows: {
    order_item_id: string;
    spec_group_id: string;
    spec_option_id: string;
    tenant_id: string;
    group_name_snapshot: string;
    option_label_snapshot: string;
  }[] = [];
  items.forEach((it, idx) => {
    const orderItemId = insertedItems[idx]?.id;
    if (!orderItemId) return;
    for (const s of it.selections) {
      specRows.push({
        order_item_id: orderItemId,
        spec_group_id: s.spec_group_id,
        spec_option_id: s.spec_option_id,
        tenant_id: tenantId,
        group_name_snapshot: s.group_name,
        option_label_snapshot: s.option_label,
      });
    }
  });
  if (specRows.length > 0) {
    const { error: specErr } = await supabase
      .from("order_item_spec_options")
      .insert(specRows);
    if (specErr) {
      console.error("submitOrderCore: order_item_spec_options insert failed", specErr);
      await supabase.from("orders").delete().eq("id", order.id);
      return { ok: false, error: "発注の登録に失敗しました" };
    }
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

  return { ok: true, orderNumber, duplicate: false };
}
