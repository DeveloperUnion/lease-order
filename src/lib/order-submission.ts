import "server-only";

import { notifyAdmins } from "@/lib/notifications";
import { getSupabaseTenant } from "@/lib/supabase-tenant";
import { getTenantId } from "@/lib/tenant";
import { getCurrentCustomer, type CustomerSession } from "@/lib/customer-auth";
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

// 管理者代行モードで submitOrderCore を呼ぶときに渡す。
// 「呼び出し側で admin セッションが確認できている」ことが前提で、
// 内部でも改めて adminId が tenant 内に存在することを検証する。
export type SubmitOrderActingAs = {
  customerId: string;
  adminId: string;
};

export type SubmitOrderOptions = {
  actingAs?: SubmitOrderActingAs;
  intakeDocumentId?: string;
};

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
  clientRequestId: string,
  options?: SubmitOrderOptions
): Promise<SubmitOrderResult> {
  if (!UUID_RE.test(clientRequestId)) {
    return { ok: false, error: "client_request_id が不正です" };
  }

  const tenantId = await getTenantId();

  // 顧客 self の場合は HMAC cookie から、admin proxy の場合は actingAs から解決。
  let customer: CustomerSession;
  if (options?.actingAs) {
    if (!UUID_RE.test(options.actingAs.adminId) || !UUID_RE.test(options.actingAs.customerId)) {
      return { ok: false, error: "代行情報が不正です" };
    }
    const supabaseCheck = await getSupabaseTenant();
    const { data: adm } = await supabaseCheck
      .from("admin_users")
      .select("id")
      .eq("id", options.actingAs.adminId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!adm) return { ok: false, error: "管理者認証が確認できません" };
    const { data: cust } = await supabaseCheck
      .from("customers")
      .select(
        "id, tenant_id, company_id, name, default_address, phone, contact_email, must_change_password, is_active"
      )
      .eq("id", options.actingAs.customerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!cust || !cust.is_active) {
      return { ok: false, error: "代行対象の顧客が見つかりません" };
    }
    customer = {
      id: cust.id,
      tenant_id: cust.tenant_id,
      company_id: cust.company_id,
      name: cust.name,
      default_address: cust.default_address,
      phone: cust.phone,
      contact_email: cust.contact_email,
      must_change_password: cust.must_change_password,
    };
  } else {
    const cur = await getCurrentCustomer();
    if (!cur) return { ok: false, error: "ログインが必要です" };
    customer = cur;
  }

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

  if (customer.tenant_id !== tenantId) {
    return { ok: false, error: "テナントが一致しません" };
  }

  const supabase = await getSupabaseTenant();

  // 取り込みドキュメントが指定されていれば、同テナントかつ未消費であることを検証。
  // ここで弾いておくと order を作ってから arrival 連結に失敗するのを防げる。
  if (options?.intakeDocumentId) {
    const { data: intake } = await supabase
      .from("order_intake_documents")
      .select("id, tenant_id, status")
      .eq("id", options.intakeDocumentId)
      .maybeSingle();
    if (!intake || intake.tenant_id !== tenantId) {
      return { ok: false, error: "取り込みドキュメントが見つかりません" };
    }
    if (intake.status === "consumed") {
      return { ok: false, error: "この取り込みは既に発注に変換されています" };
    }
  }

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

  // office / materials / spec_options の 3 つは互いに依存しないので並列化。
  // ネットワーク RTT × 3 → 1 に短縮。発注ボタン押下時の体感に直結する。
  const optionIds = Array.from(
    new Set(items.flatMap((i) => i.selections.map((s) => s.spec_option_id)))
  );
  const materialIds = items.map((i) => i.materialId);

  const [officeRes, matRes, optRes] = await Promise.all([
    input.deliveryMethod === "pickup"
      ? supabase
          .from("offices")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("id", pickupOfficeId)
          .eq("is_active", true)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    supabase
      .from("materials")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .in("id", materialIds),
    optionIds.length > 0
      ? supabase
          .from("spec_options")
          .select(
            "id, spec_group_id, is_active, spec_groups!inner(id, material_id, is_active)"
          )
          .eq("tenant_id", tenantId)
          .in("id", optionIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  if (input.deliveryMethod === "pickup") {
    if (officeRes.error) {
      console.error("submitOrderCore: office lookup failed", officeRes.error);
      return { ok: false, error: "発注の登録に失敗しました" };
    }
    if (!officeRes.data) return { ok: false, error: "選択された営業所が見つかりません" };
  }

  if (matRes.error) {
    console.error("submitOrderCore: materials lookup failed", matRes.error);
    return { ok: false, error: "発注の登録に失敗しました" };
  }
  const materials = matRes.data;
  const materialMap = new Map(materials?.map((m) => [m.id, m.name]) ?? []);
  const missing = items.filter((i) => !materialMap.has(i.materialId));
  if (missing.length) {
    return { ok: false, error: "存在しない資材が含まれています" };
  }

  if (optionIds.length > 0) {
    if (optRes.error) {
      console.error("submitOrderCore: spec_options lookup failed", optRes.error);
      return { ok: false, error: "発注の登録に失敗しました" };
    }
    type OptRow = {
      id: string;
      spec_group_id: string;
      is_active: boolean;
      spec_groups: { id: string; material_id: string; is_active: boolean } | null;
    };
    const optMap = new Map<string, OptRow>(
      ((optRes.data ?? []) as unknown as OptRow[]).map((o) => [o.id, o])
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
      intake_document_id: options?.intakeDocumentId ?? null,
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

  // 取り込みドキュメントを消費済みに更新（best-effort）。orders.intake_document_id は
  // 既に insert 時にセットしているので、ここはステータスのみ更新する。
  if (options?.intakeDocumentId) {
    await supabase
      .from("order_intake_documents")
      .update({ status: "consumed", consumed_order_id: order.id })
      .eq("id", options.intakeDocumentId)
      .eq("tenant_id", tenantId);
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
