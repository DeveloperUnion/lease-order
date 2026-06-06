"use server";

import { revalidatePath } from "next/cache";
import { notifyCustomer } from "@/lib/notifications";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSupabaseTenant } from "@/lib/supabase-tenant";
import { getTenantId } from "@/lib/tenant";
import { revalidateCatalog } from "@/lib/catalog-cache";
import { generateTempPassword } from "@/lib/temp-password";

function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "-")
    .replace(/[^\w\-]+/g, "");
  return base || `m-${Date.now().toString(36)}`;
}

// ============================================================
// Orders
// ============================================================

async function assertOrderOwnedByTenant(
  orderId: string,
  tenantId: string
): Promise<void> {
  const supabase = await getSupabaseTenant();
  const { data, error } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("対象の発注が見つかりません");
}

export type ApprovalItem = {
  id: string;
  material_name: string;
  spec_summary: string | null;
  quantity: number;
};

export async function fetchOrderItemsForApproval(
  orderId: string
): Promise<ApprovalItem[]> {
  const tenantId = await getTenantId();
  await assertOrderOwnedByTenant(orderId, tenantId);
  const supabase = await getSupabaseTenant();
  const { data, error } = await supabase
    .from("order_items")
    .select(
      `id, material_name, quantity, created_at,
       order_item_spec_options(group_name_snapshot, option_label_snapshot)`
    )
    .eq("order_id", orderId)
    .order("created_at");
  if (error) throw error;
  type Row = {
    id: string;
    material_name: string;
    quantity: number;
    order_item_spec_options:
      | { group_name_snapshot: string; option_label_snapshot: string }[]
      | null;
  };
  return ((data ?? []) as unknown as Row[]).map((it) => ({
    id: it.id,
    material_name: it.material_name,
    quantity: it.quantity,
    spec_summary: (it.order_item_spec_options ?? []).length
      ? (it.order_item_spec_options ?? [])
          .map((s) => `${s.group_name_snapshot}: ${s.option_label_snapshot}`)
          .join(" / ")
      : null,
  }));
}

export async function approveOrder(
  orderId: string,
  approvedQuantities: { itemId: string; approvedQuantity: number }[]
) {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const now = new Date().toISOString();

  for (const { itemId, approvedQuantity } of approvedQuantities) {
    const { error } = await supabase
      .from("order_items")
      .update({ approved_quantity: approvedQuantity })
      .eq("id", itemId)
      .eq("order_id", orderId);
    if (error) throw error;
  }

  const { error } = await supabase
    .from("orders")
    .update({ status: "approved", approved_at: now })
    .eq("id", orderId)
    .eq("tenant_id", tenantId);
  if (error) throw error;

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin");
  await notifyCustomer(orderId, "order_approved");
}

export async function rejectOrder(orderId: string, reason: string) {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("orders")
    .update({
      status: "rejected",
      reject_reason: reason,
      rejected_at: now,
    })
    .eq("id", orderId)
    .eq("tenant_id", tenantId);
  if (error) throw error;

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin");
  // 引き当て中の在庫が解放されるので catalog を invalidate
  await revalidateCatalog();
  await notifyCustomer(orderId, "order_rejected", { rejectReason: reason });
}

export async function shipOrder(orderId: string) {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("orders")
    .update({ status: "renting", shipped_at: now })
    .eq("id", orderId)
    .eq("tenant_id", tenantId);
  if (error) throw error;

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  await notifyCustomer(orderId, "order_shipped");
}

export async function cancelOrder(orderId: string) {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const { error } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .eq("tenant_id", tenantId);
  if (error) throw error;

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin");
  // 引き当て中の在庫が解放されるので catalog を invalidate
  await revalidateCatalog();
  await notifyCustomer(orderId, "order_cancelled");
}

// ============================================================
// Materials
// ============================================================

type MaterialInput = {
  categoryId: string;
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  // undefined = フォームに入力欄が無かった（既存値を保持）, null = 空でクリア
  dailyPrice: number | null | undefined;
  monthlyPrice: number | null | undefined;
};

// 価格欄を解釈する。未送信(undefined)・空(null)・数値 を区別する。
function parsePrice(formData: FormData, key: string): number | null | undefined {
  if (!formData.has(key)) return undefined;
  const raw = String(formData.get(key) ?? "").trim();
  if (raw === "") return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseMaterialInput(formData: FormData): MaterialInput {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("資材名は必須です");

  const categoryId = String(formData.get("category_id") ?? "").trim();
  if (!categoryId) throw new Error("カテゴリは必須です");

  return {
    categoryId,
    name,
    description: String(formData.get("description") ?? "").trim(),
    sortOrder: Number(formData.get("sort_order") ?? 0) || 0,
    isActive: formData.get("is_active") === "on" || formData.get("is_active") === "true",
    dailyPrice: parsePrice(formData, "daily_price"),
    monthlyPrice: parsePrice(formData, "monthly_price"),
  };
}

async function uploadImageToStorage(
  file: File,
  tenantId: string,
  pathPrefix: string
): Promise<string> {
  const ext = file.name.split(".").pop() ?? "webp";
  const path = `${tenantId}/${pathPrefix}/${Date.now()}.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from("materials")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw new Error(`画像アップロードに失敗しました: ${error.message}`);

  const { data } = supabaseAdmin.storage.from("materials").getPublicUrl(path);
  return data.publicUrl;
}

async function upsertMaterialImage(
  tenantId: string,
  materialId: string,
  imageUrl: string
): Promise<void> {
  const supabase = await getSupabaseTenant();
  const { data: existing } = await supabase
    .from("images")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("url", imageUrl)
    .maybeSingle();

  const imageId =
    existing?.id ??
    (
      await supabase
        .from("images")
        .insert({ tenant_id: tenantId, url: imageUrl })
        .select("id")
        .single()
        .then(({ data, error }) => {
          if (error) throw error;
          return data;
        })
    ).id;

  await supabase.from("material_images").upsert(
    {
      tenant_id: tenantId,
      material_id: materialId,
      image_id: imageId,
      sort_order: 0,
      is_primary: true,
    },
    { onConflict: "material_id,image_id" }
  );
}

export async function createMaterial(formData: FormData) {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const input = parseMaterialInput(formData);
  const imageFile = formData.get("image") as File | null;

  const { data, error } = await supabase
    .from("materials")
    .insert({
      tenant_id: tenantId,
      category_id: input.categoryId,
      name: input.name,
      description: input.description || null,
      spec: {},
      daily_price: input.dailyPrice ?? null,
      monthly_price: input.monthlyPrice ?? null,
      sort_order: input.sortOrder,
      is_active: input.isActive,
    })
    .select("id")
    .single();
  if (error) throw error;

  if (imageFile && imageFile.size > 0) {
    const url = await uploadImageToStorage(imageFile, tenantId, data.id);
    await upsertMaterialImage(tenantId, data.id, url);
  }

  revalidatePath("/admin/materials");
  revalidatePath("/admin");
  await revalidateCatalog();
  return data.id as string;
}

export async function updateMaterial(materialId: string, formData: FormData) {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const input = parseMaterialInput(formData);
  const imageFile = formData.get("image") as File | null;

  const { error } = await supabase
    .from("materials")
    .update({
      category_id: input.categoryId,
      name: input.name,
      description: input.description || null,
      is_active: input.isActive,
      ...(input.dailyPrice !== undefined ? { daily_price: input.dailyPrice } : {}),
      ...(input.monthlyPrice !== undefined ? { monthly_price: input.monthlyPrice } : {}),
    })
    .eq("id", materialId)
    .eq("tenant_id", tenantId);
  if (error) throw error;

  if (imageFile && imageFile.size > 0) {
    const url = await uploadImageToStorage(imageFile, tenantId, materialId);
    await upsertMaterialImage(tenantId, materialId, url);
  }

  revalidatePath("/admin/materials");
  revalidatePath("/admin");
  await revalidateCatalog();
}

export async function duplicateMaterial(sourceMaterialId: string): Promise<string> {
  const tenantId = await getTenantId();
  await assertMaterialOwnedByTenant(sourceMaterialId, tenantId);
  const supabase = await getSupabaseTenant();

  const { data: src, error: srcErr } = await supabase
    .from("materials")
    .select("category_id, name, description, spec, daily_price, monthly_price")
    .eq("id", sourceMaterialId)
    .single();
  if (srcErr || !src) throw new Error("コピー元の資材が見つかりません");

  const { data: lastRow } = await supabase
    .from("materials")
    .select("sort_order")
    .eq("tenant_id", tenantId)
    .eq("category_id", src.category_id)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSort = (lastRow?.[0]?.sort_order ?? 0) + 1;

  const { data: newMat, error: insErr } = await supabase
    .from("materials")
    .insert({
      tenant_id: tenantId,
      category_id: src.category_id,
      name: `${src.name}のコピー`,
      description: src.description,
      spec: src.spec ?? {},
      daily_price: src.daily_price,
      monthly_price: src.monthly_price,
      sort_order: nextSort,
      is_active: false,
    })
    .select("id")
    .single();
  if (insErr || !newMat) {
    throw new Error(`複製に失敗しました: ${insErr?.message ?? "unknown"}`);
  }

  try {
    const { data: oldGroups, error: gFetchErr } = await supabase
      .from("spec_groups")
      .select("id, name, is_required, sort_order, is_active")
      .eq("material_id", sourceMaterialId)
      .order("sort_order");
    if (gFetchErr) throw new Error(`仕様グループの取得に失敗: ${gFetchErr.message}`);

    const groupIdMap = new Map<string, string>();
    for (const g of oldGroups ?? []) {
      const { data: newGroup, error: gErr } = await supabase
        .from("spec_groups")
        .insert({
          tenant_id: tenantId,
          material_id: newMat.id,
          name: g.name,
          is_required: g.is_required,
          sort_order: g.sort_order,
          is_active: g.is_active,
        })
        .select("id")
        .single();
      if (gErr || !newGroup) {
        throw new Error(`仕様グループの複製に失敗: ${gErr?.message ?? "unknown"}`);
      }
      groupIdMap.set(g.id, newGroup.id);
    }

    if (groupIdMap.size > 0) {
      const { data: oldOptions, error: oFetchErr } = await supabase
        .from("spec_options")
        .select("spec_group_id, label, sort_order, is_active")
        .in("spec_group_id", [...groupIdMap.keys()]);
      if (oFetchErr) throw new Error(`バリエーションの取得に失敗: ${oFetchErr.message}`);

      const optionRows = (oldOptions ?? []).map((o) => ({
        tenant_id: tenantId,
        spec_group_id: groupIdMap.get(o.spec_group_id)!,
        label: o.label,
        sort_order: o.sort_order,
        is_active: o.is_active,
      }));
      if (optionRows.length > 0) {
        const { error: oErr } = await supabase
          .from("spec_options")
          .insert(optionRows);
        if (oErr) throw new Error(`バリエーションの複製に失敗: ${oErr.message}`);
      }
    }

    const { data: oldImgs, error: imgFetchErr } = await supabase
      .from("material_images")
      .select("image_id, sort_order, is_primary")
      .eq("material_id", sourceMaterialId);
    if (imgFetchErr) throw new Error(`画像の取得に失敗: ${imgFetchErr.message}`);

    if ((oldImgs?.length ?? 0) > 0) {
      const imgRows = oldImgs!.map((i) => ({
        tenant_id: tenantId,
        material_id: newMat.id,
        image_id: i.image_id,
        sort_order: i.sort_order,
        is_primary: i.is_primary,
      }));
      const { error: imgErr } = await supabase
        .from("material_images")
        .insert(imgRows);
      if (imgErr) throw new Error(`画像の複製に失敗: ${imgErr.message}`);
    }
  } catch (e) {
    await supabase.from("materials").delete().eq("id", newMat.id);
    throw e;
  }

  revalidatePath("/admin/materials");
  revalidatePath(`/admin/materials/${newMat.id}`);
  revalidatePath("/admin");
  await revalidateCatalog();
  return newMat.id as string;
}

export async function reorderMaterials(
  categoryId: string,
  orderedMaterialIds: string[]
) {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  for (let i = 0; i < orderedMaterialIds.length; i++) {
    const { error } = await supabase
      .from("materials")
      .update({ sort_order: i })
      .eq("id", orderedMaterialIds[i])
      .eq("tenant_id", tenantId)
      .eq("category_id", categoryId);
    if (error) throw new Error(`並び替えに失敗しました: ${error.message}`);
  }

  revalidatePath("/admin/materials");
  revalidatePath("/admin");
  revalidatePath("/");
  await revalidateCatalog();
}

export async function setMaterialActive(materialId: string, active: boolean) {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const { error } = await supabase
    .from("materials")
    .update({ is_active: active })
    .eq("id", materialId)
    .eq("tenant_id", tenantId);
  if (error) throw error;

  revalidatePath("/admin/materials");
  revalidatePath("/admin");
  await revalidateCatalog();
}

// ============================================================
// Categories
// ============================================================

type CategoryInput = {
  name: string;
  slug: string;
  sortOrder: number;
};

function parseCategoryInput(formData: FormData): CategoryInput {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("カテゴリ名は必須です");

  const rawSlug = String(formData.get("slug") ?? "").trim();
  const slug = rawSlug ? slugify(rawSlug) : slugify(name);

  return {
    name,
    slug,
    sortOrder: Number(formData.get("sort_order") ?? 0) || 0,
  };
}

export async function createCategory(formData: FormData) {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const input = parseCategoryInput(formData);

  const { error } = await supabase
    .from("categories")
    .insert({
      tenant_id: tenantId,
      name: input.name,
      slug: input.slug,
      sort_order: input.sortOrder,
    });
  if (error) throw new Error(`カテゴリの作成に失敗しました: ${error.message}`);

  revalidatePath("/admin/categories");
  revalidatePath("/admin");
  revalidatePath("/");
  await revalidateCatalog();
}

export async function updateCategory(categoryId: string, formData: FormData) {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const input = parseCategoryInput(formData);

  const { error } = await supabase
    .from("categories")
    .update({
      name: input.name,
      slug: input.slug,
    })
    .eq("id", categoryId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`カテゴリの更新に失敗しました: ${error.message}`);

  revalidatePath("/admin/categories");
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath(`/category/${input.slug}`);
  await revalidateCatalog();
}

export async function reorderCategories(orderedCategoryIds: string[]) {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  for (let i = 0; i < orderedCategoryIds.length; i++) {
    const { error } = await supabase
      .from("categories")
      .update({ sort_order: i })
      .eq("id", orderedCategoryIds[i])
      .eq("tenant_id", tenantId);
    if (error) throw new Error(`並び替えに失敗しました: ${error.message}`);
  }

  revalidatePath("/admin/categories");
  revalidatePath("/admin");
  revalidatePath("/");
  await revalidateCatalog();
}

export async function deleteCategory(categoryId: string) {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();

  const { count, error: countErr } = await supabase
    .from("materials")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("category_id", categoryId);
  if (countErr) throw countErr;
  if ((count ?? 0) > 0) {
    throw new Error("このカテゴリには資材が紐付いているため削除できません");
  }

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`カテゴリの削除に失敗しました: ${error.message}`);

  revalidatePath("/admin/categories");
  revalidatePath("/admin");
  revalidatePath("/");
  await revalidateCatalog();
}

// ============================================================
// Offices
// ============================================================

type OfficeInput = {
  name: string;
  area: string | null;
  address: string | null;
  phone: string | null;
  fax: string | null;
  lat: number | null;
  lng: number | null;
  sortOrder: number;
  isActive: boolean;
};

function parseOfficeInput(formData: FormData): OfficeInput {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("営業所名は必須です");
  const get = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v.length > 0 ? v : null;
  };
  const getCoord = (k: string, min: number, max: number): number | null => {
    const raw = String(formData.get(k) ?? "").trim();
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < min || n > max) return null;
    return n;
  };
  return {
    name,
    area: get("area"),
    address: get("address"),
    phone: get("phone"),
    fax: get("fax"),
    lat: getCoord("lat", -90, 90),
    lng: getCoord("lng", -180, 180),
    sortOrder: Number(formData.get("sort_order") ?? 0) || 0,
    isActive:
      formData.get("is_active") === "on" || formData.get("is_active") === "true",
  };
}

export async function createOffice(formData: FormData) {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const input = parseOfficeInput(formData);
  const { error } = await supabase.from("offices").insert({
    tenant_id: tenantId,
    name: input.name,
    area: input.area,
    address: input.address,
    phone: input.phone,
    fax: input.fax,
    lat: input.lat,
    lng: input.lng,
    sort_order: input.sortOrder,
    is_active: input.isActive,
  });
  if (error) throw new Error(`営業所の作成に失敗しました: ${error.message}`);

  revalidatePath("/admin/offices");
  revalidatePath("/cart");
  await revalidateCatalog();
}

export async function updateOffice(officeId: string, formData: FormData) {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const input = parseOfficeInput(formData);
  const { error } = await supabase
    .from("offices")
    .update({
      name: input.name,
      area: input.area,
      address: input.address,
      phone: input.phone,
      fax: input.fax,
      lat: input.lat,
      lng: input.lng,
      is_active: input.isActive,
    })
    .eq("id", officeId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`営業所の更新に失敗しました: ${error.message}`);

  revalidatePath("/admin/offices");
  revalidatePath("/cart");
  await revalidateCatalog();
}

export async function reorderOffices(orderedOfficeIds: string[]) {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  for (let i = 0; i < orderedOfficeIds.length; i++) {
    const { error } = await supabase
      .from("offices")
      .update({ sort_order: i })
      .eq("id", orderedOfficeIds[i])
      .eq("tenant_id", tenantId);
    if (error) throw new Error(`並び替えに失敗しました: ${error.message}`);
  }

  revalidatePath("/admin/offices");
  revalidatePath("/cart");
  await revalidateCatalog();
}

export async function deleteOffice(officeId: string) {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();

  const { count, error: countErr } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("pickup_office_id", officeId);
  if (countErr) throw countErr;
  if ((count ?? 0) > 0) {
    throw new Error(
      "この営業所は過去の発注で使われているため削除できません。非公開にしてください。"
    );
  }

  const { error } = await supabase
    .from("offices")
    .delete()
    .eq("id", officeId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`営業所の削除に失敗しました: ${error.message}`);

  revalidatePath("/admin/offices");
  revalidatePath("/cart");
  await revalidateCatalog();
}

// ============================================================
// Material ownership helper（spec_groups / spec_options が共有して使う）
// ============================================================

async function assertMaterialOwnedByTenant(
  materialId: string,
  tenantId: string
): Promise<void> {
  const supabase = await getSupabaseTenant();
  const { data, error } = await supabase
    .from("materials")
    .select("id")
    .eq("id", materialId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("対象の資材が見つかりません");
}

// ============================================================
// Material images (max 5 per material)
// ============================================================

const MAX_IMAGES_PER_MATERIAL = 5;

export async function addMaterialImage(materialId: string, formData: FormData) {
  const tenantId = await getTenantId();
  await assertMaterialOwnedByTenant(materialId, tenantId);
  const supabase = await getSupabaseTenant();

  const file = formData.get("image") as File | null;
  if (!file || file.size === 0) throw new Error("画像ファイルを選択してください");

  const { data: existing, error: existErr } = await supabase
    .from("material_images")
    .select("image_id, sort_order, is_primary")
    .eq("material_id", materialId);
  if (existErr) throw existErr;

  if ((existing?.length ?? 0) >= MAX_IMAGES_PER_MATERIAL) {
    throw new Error(`画像は最大${MAX_IMAGES_PER_MATERIAL}枚までです`);
  }

  const url = await uploadImageToStorage(file, tenantId, materialId);

  const { data: img, error: imgErr } = await supabase
    .from("images")
    .upsert(
      { tenant_id: tenantId, url },
      { onConflict: "tenant_id,url" }
    )
    .select("id")
    .single();
  if (imgErr) throw imgErr;

  const nextSort =
    (existing?.reduce((m, e) => Math.max(m, e.sort_order), -1) ?? -1) + 1;
  const isPrimary = (existing?.length ?? 0) === 0;

  const { error } = await supabase
    .from("material_images")
    .insert({
      tenant_id: tenantId,
      material_id: materialId,
      image_id: img.id,
      sort_order: nextSort,
      is_primary: isPrimary,
    });
  if (error) throw new Error(`画像の追加に失敗しました: ${error.message}`);

  revalidatePath(`/admin/materials/${materialId}`);
  revalidatePath("/admin/materials");
  revalidatePath("/");
  await revalidateCatalog();
}

export async function removeMaterialImage(
  materialId: string,
  imageId: string
) {
  const tenantId = await getTenantId();
  await assertMaterialOwnedByTenant(materialId, tenantId);
  const supabase = await getSupabaseTenant();

  const { data: target } = await supabase
    .from("material_images")
    .select("is_primary")
    .eq("material_id", materialId)
    .eq("image_id", imageId)
    .maybeSingle();

  const { error } = await supabase
    .from("material_images")
    .delete()
    .eq("material_id", materialId)
    .eq("image_id", imageId);
  if (error) throw new Error(`画像の削除に失敗しました: ${error.message}`);

  // If we just removed the primary image, promote the first remaining one.
  if (target?.is_primary) {
    const { data: rest } = await supabase
      .from("material_images")
      .select("image_id, sort_order")
      .eq("material_id", materialId)
      .order("sort_order")
      .limit(1);
    if (rest && rest.length > 0) {
      await supabase
        .from("material_images")
        .update({ is_primary: true })
        .eq("material_id", materialId)
        .eq("image_id", rest[0].image_id);
    }
  }

  revalidatePath(`/admin/materials/${materialId}`);
  revalidatePath("/admin/materials");
  revalidatePath("/");
  await revalidateCatalog();
}

export async function setPrimaryMaterialImage(
  materialId: string,
  imageId: string
) {
  const tenantId = await getTenantId();
  await assertMaterialOwnedByTenant(materialId, tenantId);
  const supabase = await getSupabaseTenant();

  const { error: clearErr } = await supabase
    .from("material_images")
    .update({ is_primary: false })
    .eq("material_id", materialId);
  if (clearErr) throw clearErr;

  const { error } = await supabase
    .from("material_images")
    .update({ is_primary: true })
    .eq("material_id", materialId)
    .eq("image_id", imageId);
  if (error) throw new Error(`代表画像の更新に失敗しました: ${error.message}`);

  revalidatePath(`/admin/materials/${materialId}`);
  revalidatePath("/admin/materials");
  revalidatePath("/");
  await revalidateCatalog();
}

export async function reorderMaterialImages(
  materialId: string,
  orderedImageIds: string[]
) {
  const tenantId = await getTenantId();
  await assertMaterialOwnedByTenant(materialId, tenantId);
  const supabase = await getSupabaseTenant();

  for (let i = 0; i < orderedImageIds.length; i++) {
    const { error } = await supabase
      .from("material_images")
      .update({ sort_order: i })
      .eq("material_id", materialId)
      .eq("image_id", orderedImageIds[i]);
    if (error) throw error;
  }

  revalidatePath(`/admin/materials/${materialId}`);
  revalidatePath("/admin/materials");
  revalidatePath("/");
  await revalidateCatalog();
}


// ============================================================
// Admin users (allowlist)
// ============================================================

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// admin は Supabase Auth ユーザーとしてパスワードを持つ。allowlist (admin_users)
// への追加時に auth.users を作成し、その id を admin_users.auth_user_id に保持する。
// 既に auth.users に存在するメール（マジックリンク時代の残存など）はパスワードを
// 更新して再利用する。
async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error || !data?.users?.length) return null;
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureAuthUser(email: string, password: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error && data?.user) return data.user.id;

  const existingId = await findAuthUserIdByEmail(email);
  if (existingId) {
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(
      existingId,
      { password, email_confirm: true }
    );
    if (updErr) {
      throw new Error(`認証ユーザーの更新に失敗しました: ${updErr.message}`);
    }
    return existingId;
  }
  throw new Error(
    `認証ユーザーの作成に失敗しました: ${error?.message ?? "unknown"}`
  );
}

export async function addAdminUser(
  formData: FormData
): Promise<{ email: string; tempPassword: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new Error("有効なメールアドレスを入力してください");
  }
  const tenantId = await getTenantId();

  // admin_users.email は global unique。auth ユーザーを無駄に作る前に弾く。
  const { data: existing } = await supabaseAdmin
    .from("admin_users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    throw new Error("このメールアドレスは既に登録されています");
  }

  const tempPassword = generateTempPassword();
  const authUserId = await ensureAuthUser(email, tempPassword);

  const { error } = await supabaseAdmin.from("admin_users").insert({
    tenant_id: tenantId,
    email,
    auth_user_id: authUserId,
    must_change_password: true,
  });
  if (error) {
    if (error.code === "23505") {
      throw new Error("このメールアドレスは既に登録されています");
    }
    throw new Error(`登録に失敗しました: ${error.message}`);
  }
  revalidatePath("/admin/users");
  return { email, tempPassword };
}

export async function resetAdminPassword(
  id: string
): Promise<{ email: string; tempPassword: string }> {
  const tenantId = await getTenantId();
  const { data: target, error: targetErr } = await supabaseAdmin
    .from("admin_users")
    .select("email, tenant_id, auth_user_id")
    .eq("id", id)
    .maybeSingle();
  if (targetErr) throw targetErr;
  if (!target || target.tenant_id !== tenantId) {
    throw new Error("対象ユーザーが見つかりません");
  }

  const tempPassword = generateTempPassword();
  let authUserId = target.auth_user_id as string | null;
  if (authUserId) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
      password: tempPassword,
      email_confirm: true,
    });
    if (error) {
      throw new Error(`パスワードのリセットに失敗しました: ${error.message}`);
    }
  } else {
    // マジックリンク時代の行は auth_user_id 未設定。email から解決し直す。
    authUserId = await ensureAuthUser(target.email, tempPassword);
    await supabaseAdmin
      .from("admin_users")
      .update({ auth_user_id: authUserId })
      .eq("id", id)
      .eq("tenant_id", tenantId);
  }

  await supabaseAdmin
    .from("admin_users")
    .update({ must_change_password: true })
    .eq("id", id)
    .eq("tenant_id", tenantId);
  revalidatePath("/admin/users");
  return { email: target.email, tempPassword };
}

// ログイン中の管理者自身がパスワードを変更する（初回パスワード変更の強制フロー含む）。
// Supabase Auth のパスワードを更新し、admin_users.must_change_password を下ろす。
export async function changeAdminPassword(input: {
  newPassword: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.newPassword || input.newPassword.length < 8) {
    return { ok: false, error: "新しいパスワードは 8 文字以上で入力してください" };
  }
  const ssr = await createSupabaseServerClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user?.email) {
    return { ok: false, error: "認証情報を取得できませんでした" };
  }
  const { error } = await ssr.auth.updateUser({ password: input.newPassword });
  if (error) {
    return { ok: false, error: "パスワードの更新に失敗しました" };
  }
  const tenantId = await getTenantId();
  await supabaseAdmin
    .from("admin_users")
    .update({ must_change_password: false })
    .eq("tenant_id", tenantId)
    .eq("email", user.email.toLowerCase());
  revalidatePath("/admin");
  return { ok: true };
}

export async function removeAdminUser(id: string) {
  const tenantId = await getTenantId();
  const ssr = await createSupabaseServerClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user?.email) throw new Error("認証情報を取得できませんでした");

  const { data: target, error: targetErr } = await supabaseAdmin
    .from("admin_users")
    .select("email, tenant_id, auth_user_id")
    .eq("id", id)
    .maybeSingle();
  if (targetErr) throw targetErr;
  if (!target || target.tenant_id !== tenantId) {
    throw new Error("対象ユーザーが見つかりません");
  }
  if (target.email.toLowerCase() === user.email.toLowerCase()) {
    throw new Error("自分自身は削除できません");
  }

  const { error } = await supabaseAdmin
    .from("admin_users")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`削除に失敗しました: ${error.message}`);
  // allowlist から外したら Auth ユーザーも削除し、同じメールの再登録をクリーンにする。
  if (target.auth_user_id) {
    await supabaseAdmin.auth.admin
      .deleteUser(target.auth_user_id as string)
      .catch(() => {});
  }
  revalidatePath("/admin/users");
}

// ============================================================
// Spec groups / spec options（v3: variants 廃止、仕様＝バリエーションの 2 層のみ）
//
// - admin は「+ 仕様追加」フォームで仕様名 + バリエーション複数行を一括登録
// - 並び替えは DnD（reorderSpecGroups / reorderSpecOptions）
// - 「削除」は論理削除（is_active=false）。物理削除は admin UI から提供しない
// ============================================================

export type SpecGroupInput = {
  name: string;
};

export type SpecOptionInput = {
  label: string;
};

async function assertSpecGroupOwnedByMaterial(
  groupId: string,
  materialId: string,
  tenantId: string
): Promise<void> {
  const supabase = await getSupabaseTenant();
  const { data, error } = await supabase
    .from("spec_groups")
    .select("id")
    .eq("id", groupId)
    .eq("material_id", materialId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("対象の仕様が見つかりません");
}

async function nextSpecGroupSortOrder(
  materialId: string
): Promise<number> {
  const supabase = await getSupabaseTenant();
  const { data, error } = await supabase
    .from("spec_groups")
    .select("sort_order")
    .eq("material_id", materialId)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0]?.sort_order ?? 0) + 1;
}

async function nextSpecOptionSortOrder(groupId: string): Promise<number> {
  const supabase = await getSupabaseTenant();
  const { data, error } = await supabase
    .from("spec_options")
    .select("sort_order")
    .eq("spec_group_id", groupId)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0]?.sort_order ?? 0) + 1;
}

// 仕様 + バリエーションを 1 操作で作成（フォーム送信のメインルート）
export async function createSpecGroupWithOptions(
  materialId: string,
  input: SpecGroupInput,
  options: SpecOptionInput[]
) {
  const tenantId = await getTenantId();
  await assertMaterialOwnedByTenant(materialId, tenantId);
  if (!input.name.trim()) throw new Error("仕様名は必須です");
  const cleanedOptions = options
    .map((o) => ({ label: o.label.trim() }))
    .filter((o) => o.label.length > 0);
  if (cleanedOptions.length === 0) {
    throw new Error("バリエーションを 1 件以上入力してください");
  }
  const supabase = await getSupabaseTenant();
  const sortOrder = await nextSpecGroupSortOrder(materialId);

  const { data: group, error: gErr } = await supabase
    .from("spec_groups")
    .insert({
      tenant_id: tenantId,
      material_id: materialId,
      name: input.name.trim(),
      is_required: true, // v3: 仕様は常に必須として扱う
      sort_order: sortOrder,
      is_active: true,
    })
    .select("id")
    .single();
  if (gErr || !group) {
    throw new Error(`仕様の追加に失敗しました: ${gErr?.message ?? "unknown"}`);
  }

  const optionRows = cleanedOptions.map((o, idx) => ({
    tenant_id: tenantId,
    spec_group_id: group.id,
    label: o.label,
    sort_order: idx + 1,
    is_active: true,
  }));
  const { error: oErr } = await supabase.from("spec_options").insert(optionRows);
  if (oErr) {
    // 仕様グループも巻き戻し（cascade で options も消える）
    await supabase.from("spec_groups").delete().eq("id", group.id);
    throw new Error(`バリエーションの追加に失敗しました: ${oErr.message}`);
  }

  revalidatePath(`/admin/materials/${materialId}`);
  await revalidateCatalog();
}

export async function updateSpecGroup(
  materialId: string,
  groupId: string,
  input: SpecGroupInput
) {
  const tenantId = await getTenantId();
  await assertMaterialOwnedByTenant(materialId, tenantId);
  if (!input.name.trim()) throw new Error("仕様名は必須です");
  const supabase = await getSupabaseTenant();
  const { error } = await supabase
    .from("spec_groups")
    .update({
      name: input.name.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", groupId)
    .eq("material_id", materialId);
  if (error) throw new Error(`仕様の更新に失敗しました: ${error.message}`);
  revalidatePath(`/admin/materials/${materialId}`);
  await revalidateCatalog();
}

// 論理削除（is_active=false）。物理削除は不要なので提供しない。
// order_item_spec_options から FK restrict されるが、is_active を倒すだけなら制約に
// 抵触しないので過去発注履歴を壊さずに非表示にできる。
export async function deleteSpecGroup(materialId: string, groupId: string) {
  const tenantId = await getTenantId();
  await assertMaterialOwnedByTenant(materialId, tenantId);
  const supabase = await getSupabaseTenant();
  const { error } = await supabase
    .from("spec_groups")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", groupId)
    .eq("material_id", materialId);
  if (error) throw new Error(`仕様の削除に失敗しました: ${error.message}`);
  revalidatePath(`/admin/materials/${materialId}`);
  await revalidateCatalog();
}

export async function reorderSpecGroups(
  materialId: string,
  orderedGroupIds: string[]
) {
  const tenantId = await getTenantId();
  await assertMaterialOwnedByTenant(materialId, tenantId);
  const supabase = await getSupabaseTenant();

  for (let i = 0; i < orderedGroupIds.length; i++) {
    const { error } = await supabase
      .from("spec_groups")
      .update({ sort_order: i + 1 })
      .eq("id", orderedGroupIds[i])
      .eq("material_id", materialId)
      .eq("tenant_id", tenantId);
    if (error) {
      throw new Error(`仕様の並び替えに失敗しました: ${error.message}`);
    }
  }
  revalidatePath(`/admin/materials/${materialId}`);
  await revalidateCatalog();
}

export async function createSpecOption(
  materialId: string,
  groupId: string,
  input: SpecOptionInput
) {
  const tenantId = await getTenantId();
  await assertMaterialOwnedByTenant(materialId, tenantId);
  await assertSpecGroupOwnedByMaterial(groupId, materialId, tenantId);
  if (!input.label.trim()) throw new Error("バリエーション名は必須です");
  const supabase = await getSupabaseTenant();
  const sortOrder = await nextSpecOptionSortOrder(groupId);
  const { error } = await supabase.from("spec_options").insert({
    tenant_id: tenantId,
    spec_group_id: groupId,
    label: input.label.trim(),
    sort_order: sortOrder,
    is_active: true,
  });
  if (error) throw new Error(`バリエーションの追加に失敗しました: ${error.message}`);
  revalidatePath(`/admin/materials/${materialId}`);
  await revalidateCatalog();
}

export async function updateSpecOption(
  materialId: string,
  groupId: string,
  optionId: string,
  input: SpecOptionInput
) {
  const tenantId = await getTenantId();
  await assertMaterialOwnedByTenant(materialId, tenantId);
  await assertSpecGroupOwnedByMaterial(groupId, materialId, tenantId);
  if (!input.label.trim()) throw new Error("バリエーション名は必須です");
  const supabase = await getSupabaseTenant();
  const { error } = await supabase
    .from("spec_options")
    .update({
      label: input.label.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", optionId)
    .eq("spec_group_id", groupId);
  if (error) throw new Error(`バリエーションの更新に失敗しました: ${error.message}`);
  revalidatePath(`/admin/materials/${materialId}`);
  await revalidateCatalog();
}

export async function deleteSpecOption(
  materialId: string,
  groupId: string,
  optionId: string
) {
  const tenantId = await getTenantId();
  await assertMaterialOwnedByTenant(materialId, tenantId);
  await assertSpecGroupOwnedByMaterial(groupId, materialId, tenantId);
  const supabase = await getSupabaseTenant();
  const { error } = await supabase
    .from("spec_options")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", optionId)
    .eq("spec_group_id", groupId);
  if (error) throw new Error(`バリエーションの削除に失敗しました: ${error.message}`);
  revalidatePath(`/admin/materials/${materialId}`);
  await revalidateCatalog();
}

export async function reorderSpecOptions(
  materialId: string,
  groupId: string,
  orderedOptionIds: string[]
) {
  const tenantId = await getTenantId();
  await assertMaterialOwnedByTenant(materialId, tenantId);
  await assertSpecGroupOwnedByMaterial(groupId, materialId, tenantId);
  const supabase = await getSupabaseTenant();

  for (let i = 0; i < orderedOptionIds.length; i++) {
    const { error } = await supabase
      .from("spec_options")
      .update({ sort_order: i + 1 })
      .eq("id", orderedOptionIds[i])
      .eq("spec_group_id", groupId)
      .eq("tenant_id", tenantId);
    if (error) {
      throw new Error(`バリエーションの並び替えに失敗しました: ${error.message}`);
    }
  }
  revalidatePath(`/admin/materials/${materialId}`);
  await revalidateCatalog();
}

// ============================================================
// 在庫数量（マスタ）の更新
//
// 派生計算（quantity - returned - lost）で残数を出すため、ここで設定するのは
// 保有数（マスタ値）。0 以上の整数のみ受け付ける。
// ============================================================

// null は「未設定」を意味し、明示的にクリアできる。空文字や未指定も null 扱い。
function parseStockQuantity(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("在庫数は 0 以上の整数で入力してください");
  }
  return n;
}

export async function updateMaterialStock(
  materialId: string,
  quantity: number | null
) {
  const tenantId = await getTenantId();
  await assertMaterialOwnedByTenant(materialId, tenantId);
  const value = parseStockQuantity(quantity);
  const supabase = await getSupabaseTenant();
  const { error } = await supabase
    .from("materials")
    .update({ stock_quantity: value })
    .eq("id", materialId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`在庫の更新に失敗しました: ${error.message}`);
  revalidatePath(`/admin/materials/${materialId}`);
  await revalidateCatalog();
}

export async function updateSpecOptionStock(
  materialId: string,
  groupId: string,
  optionId: string,
  quantity: number | null
) {
  const tenantId = await getTenantId();
  await assertMaterialOwnedByTenant(materialId, tenantId);
  await assertSpecGroupOwnedByMaterial(groupId, materialId, tenantId);
  const value = parseStockQuantity(quantity);
  const supabase = await getSupabaseTenant();
  const { error } = await supabase
    .from("spec_options")
    .update({ stock_quantity: value, updated_at: new Date().toISOString() })
    .eq("id", optionId)
    .eq("spec_group_id", groupId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`在庫の更新に失敗しました: ${error.message}`);
  revalidatePath(`/admin/materials/${materialId}`);
  await revalidateCatalog();
}
