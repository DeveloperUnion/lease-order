"use server";

import { revalidatePath } from "next/cache";
import { notifyCustomer } from "@/lib/notifications";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSupabaseTenant } from "@/lib/supabase-tenant";
import { getTenantId } from "@/lib/tenant";

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
  variant_name: string | null;
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
    .select("id, material_name, variant_name, quantity, created_at")
    .eq("order_id", orderId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((it) => ({
    id: it.id,
    material_name: it.material_name,
    variant_name: it.variant_name,
    quantity: it.quantity,
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
};

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
  const imageFile = formData.get("image") as File | null;

  const { data, error } = await supabase
    .from("categories")
    .insert({
      tenant_id: tenantId,
      name: input.name,
      slug: input.slug,
      sort_order: input.sortOrder,
    })
    .select("id")
    .single();
  if (error) throw new Error(`カテゴリの作成に失敗しました: ${error.message}`);

  if (imageFile && imageFile.size > 0) {
    const url = await uploadImageToStorage(
      imageFile,
      tenantId,
      `categories/${data.id}`
    );
    const { error: updErr } = await supabase
      .from("categories")
      .update({ image_url: url })
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (updErr) throw updErr;
  }

  revalidatePath("/admin/categories");
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function updateCategory(categoryId: string, formData: FormData) {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const input = parseCategoryInput(formData);
  const imageFile = formData.get("image") as File | null;

  const update: {
    name: string;
    slug: string;
    image_url?: string;
  } = {
    name: input.name,
    slug: input.slug,
  };

  if (imageFile && imageFile.size > 0) {
    update.image_url = await uploadImageToStorage(
      imageFile,
      tenantId,
      `categories/${categoryId}`
    );
  }

  const { error } = await supabase
    .from("categories")
    .update(update)
    .eq("id", categoryId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`カテゴリの更新に失敗しました: ${error.message}`);

  revalidatePath("/admin/categories");
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath(`/category/${input.slug}`);
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
}

// ============================================================
// Material variants
// ============================================================

type VariantInput = {
  name: string;
  unit: string | null;
  sku: string | null;
  sortOrder: number;
  isActive: boolean;
};

function parseVariantInput(formData: FormData): VariantInput {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("バリエーション名は必須です");
  const get = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v.length > 0 ? v : null;
  };
  return {
    name,
    unit: get("unit"),
    sku: get("sku"),
    sortOrder: Number(formData.get("sort_order") ?? 0) || 0,
    isActive:
      formData.get("is_active") === "on" || formData.get("is_active") === "true",
  };
}

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

export async function addVariant(materialId: string, formData: FormData) {
  const tenantId = await getTenantId();
  await assertMaterialOwnedByTenant(materialId, tenantId);
  const supabase = await getSupabaseTenant();
  const input = parseVariantInput(formData);

  const { error } = await supabase.from("material_variants").insert({
    tenant_id: tenantId,
    material_id: materialId,
    name: input.name,
    unit: input.unit,
    sku: input.sku,
    spec: {},
    sort_order: input.sortOrder,
    is_active: input.isActive,
  });
  if (error) throw new Error(`バリエーションの追加に失敗しました: ${error.message}`);

  revalidatePath(`/admin/materials/${materialId}`);
}

export async function updateVariant(
  materialId: string,
  variantId: string,
  formData: FormData
) {
  const tenantId = await getTenantId();
  await assertMaterialOwnedByTenant(materialId, tenantId);
  const supabase = await getSupabaseTenant();
  const input = parseVariantInput(formData);

  const { error } = await supabase
    .from("material_variants")
    .update({
      name: input.name,
      unit: input.unit,
      sku: input.sku,
      sort_order: input.sortOrder,
      is_active: input.isActive,
    })
    .eq("id", variantId)
    .eq("material_id", materialId);
  if (error) throw new Error(`バリエーションの更新に失敗しました: ${error.message}`);

  revalidatePath(`/admin/materials/${materialId}`);
}

export async function deleteVariant(materialId: string, variantId: string) {
  const tenantId = await getTenantId();
  await assertMaterialOwnedByTenant(materialId, tenantId);
  const supabase = await getSupabaseTenant();

  const { count, error: countErr } = await supabase
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("variant_id", variantId);
  if (countErr) throw countErr;
  if ((count ?? 0) > 0) {
    throw new Error(
      "このバリエーションは過去の発注で使われているため削除できません。非公開にしてください。"
    );
  }

  const { error } = await supabase
    .from("material_variants")
    .delete()
    .eq("id", variantId)
    .eq("material_id", materialId);
  if (error) throw new Error(`バリエーションの削除に失敗しました: ${error.message}`);

  revalidatePath(`/admin/materials/${materialId}`);
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
}


// ============================================================
// Admin users (allowlist)
// ============================================================

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function addAdminUser(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new Error("有効なメールアドレスを入力してください");
  }
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const { error } = await supabase
    .from("admin_users")
    .insert({ tenant_id: tenantId, email });
  if (error) {
    if (error.code === "23505") {
      throw new Error("このメールアドレスは既に登録されています");
    }
    throw new Error(`登録に失敗しました: ${error.message}`);
  }
  revalidatePath("/admin/users");
}

export async function removeAdminUser(id: string) {
  const tenantId = await getTenantId();
  const ssr = await createSupabaseServerClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user?.email) throw new Error("認証情報を取得できませんでした");

  const supabase = await getSupabaseTenant();
  const { data: target, error: targetErr } = await supabase
    .from("admin_users")
    .select("email, tenant_id")
    .eq("id", id)
    .maybeSingle();
  if (targetErr) throw targetErr;
  if (!target || target.tenant_id !== tenantId) {
    throw new Error("対象ユーザーが見つかりません");
  }
  if (target.email.toLowerCase() === user.email.toLowerCase()) {
    throw new Error("自分自身は削除できません");
  }

  const { error } = await supabase
    .from("admin_users")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`削除に失敗しました: ${error.message}`);
  revalidatePath("/admin/users");
}

// ============================================================
// Spec groups / options / variant ↔ option binding
// ============================================================

// 全 active spec_groups × spec_options のクロスプロダクトから不足する variant
// を自動生成。既存 variants は触らず、組み合わせが一致する variant が無いもの
// だけを追加する。SKU や単位は admin が後で個別調整できるよう空のままにする。
async function syncVariantsForMaterial(
  materialId: string,
  tenantId: string
): Promise<void> {
  const supabase = await getSupabaseTenant();

  // 全 active spec_groups + active spec_options をロード
  const { data: groupsData, error: gErr } = await supabase
    .from("spec_groups")
    .select(
      "id, name, sort_order, spec_options(id, label, sort_order, is_active)"
    )
    .eq("material_id", materialId)
    .eq("is_active", true)
    .order("sort_order");
  if (gErr) throw new Error(`仕様読み込みに失敗: ${gErr.message}`);

  type GroupRow = {
    id: string;
    name: string;
    sort_order: number;
    spec_options:
      | { id: string; label: string; sort_order: number; is_active: boolean }[]
      | null;
  };
  const groups = (groupsData ?? []) as unknown as GroupRow[];
  const activeGroups = groups
    .map((g) => ({
      ...g,
      options: (g.spec_options ?? [])
        .filter((o) => o.is_active)
        .sort((a, b) => a.sort_order - b.sort_order),
    }))
    .filter((g) => g.options.length > 0);

  // 仕様グループも選択肢もなければ variant の追加は不要
  if (activeGroups.length === 0) return;

  // 既存 variants と紐付をロード
  const { data: variantsData, error: vErr } = await supabase
    .from("material_variants")
    .select(
      "id, sort_order, material_variant_options(spec_group_id, spec_option_id)"
    )
    .eq("material_id", materialId);
  if (vErr) throw new Error(`バリエーション読み込みに失敗: ${vErr.message}`);

  type VariantRow = {
    id: string;
    sort_order: number;
    material_variant_options:
      | { spec_group_id: string; spec_option_id: string }[]
      | null;
  };
  const variants = (variantsData ?? []) as unknown as VariantRow[];

  // 既存 variant の組み合わせシグネチャ
  const signatureOf = (
    selections: { spec_group_id: string; spec_option_id: string }[]
  ) =>
    [...selections]
      .map((s) => `${s.spec_group_id}=${s.spec_option_id}`)
      .sort()
      .join("|");
  const existing = new Set<string>();
  for (const v of variants) {
    const sels = v.material_variant_options ?? [];
    if (sels.length !== activeGroups.length) continue;
    existing.add(signatureOf(sels));
  }

  // 全組み合わせを生成
  type Combo = {
    selections: { spec_group_id: string; spec_option_id: string }[];
    name: string;
  };
  const combos: Combo[] = [];
  function expand(idx: number, sel: Combo["selections"], labels: string[]) {
    if (idx === activeGroups.length) {
      combos.push({ selections: [...sel], name: labels.join(" / ") });
      return;
    }
    const g = activeGroups[idx];
    for (const o of g.options) {
      sel.push({ spec_group_id: g.id, spec_option_id: o.id });
      labels.push(o.label);
      expand(idx + 1, sel, labels);
      sel.pop();
      labels.pop();
    }
  }
  expand(0, [], []);

  // 不足分のみ insert
  let nextSort = (variants.reduce((m, v) => Math.max(m, v.sort_order), 0) || 0) + 1;
  for (const c of combos) {
    if (existing.has(signatureOf(c.selections))) continue;

    const { data: variantRow, error: insErr } = await supabase
      .from("material_variants")
      .insert({
        tenant_id: tenantId,
        material_id: materialId,
        name: c.name,
        spec: {},
        sort_order: nextSort++,
        is_active: true,
      })
      .select("id")
      .single();
    if (insErr || !variantRow) {
      throw new Error(`バリエーション自動追加に失敗: ${insErr?.message ?? "unknown"}`);
    }
    const { error: linkErr } = await supabase
      .from("material_variant_options")
      .insert(
        c.selections.map((s) => ({
          variant_id: variantRow.id,
          spec_group_id: s.spec_group_id,
          spec_option_id: s.spec_option_id,
          tenant_id: tenantId,
        }))
      );
    if (linkErr) {
      throw new Error(`バリエーション紐付に失敗: ${linkErr.message}`);
    }
  }
}

export type SpecGroupInput = {
  name: string;
  description: string | null;
  selectionType: "single" | "multi";
  isRequired: boolean;
  sortOrder: number;
  isActive: boolean;
};

export type SpecOptionInput = {
  label: string;
  shortCode: string | null;
  sortOrder: number;
  isActive: boolean;
};

export async function createSpecGroup(
  materialId: string,
  input: SpecGroupInput
) {
  const tenantId = await getTenantId();
  await assertMaterialOwnedByTenant(materialId, tenantId);
  if (!input.name.trim()) throw new Error("仕様名は必須です");
  const supabase = await getSupabaseTenant();
  const { error } = await supabase.from("spec_groups").insert({
    tenant_id: tenantId,
    material_id: materialId,
    name: input.name.trim(),
    description: input.description,
    selection_type: input.selectionType,
    is_required: input.isRequired,
    sort_order: input.sortOrder,
    is_active: input.isActive,
  });
  if (error) throw new Error(`仕様の追加に失敗しました: ${error.message}`);
  await syncVariantsForMaterial(materialId, tenantId);
  revalidatePath(`/admin/materials/${materialId}`);
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
      description: input.description,
      selection_type: input.selectionType,
      is_required: input.isRequired,
      sort_order: input.sortOrder,
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", groupId)
    .eq("material_id", materialId);
  if (error) throw new Error(`仕様の更新に失敗しました: ${error.message}`);
  await syncVariantsForMaterial(materialId, tenantId);
  revalidatePath(`/admin/materials/${materialId}`);
}

export async function deleteSpecGroup(materialId: string, groupId: string) {
  const tenantId = await getTenantId();
  await assertMaterialOwnedByTenant(materialId, tenantId);
  const supabase = await getSupabaseTenant();

  const { count, error: countErr } = await supabase
    .from("material_variant_options")
    .select("variant_id", { count: "exact", head: true })
    .eq("spec_group_id", groupId);
  if (countErr) throw countErr;
  if ((count ?? 0) > 0) {
    throw new Error(
      "この仕様はバリエーションに紐付いているため削除できません。非公開にしてください。"
    );
  }

  const { error } = await supabase
    .from("spec_groups")
    .delete()
    .eq("id", groupId)
    .eq("material_id", materialId);
  if (error) throw new Error(`仕様の削除に失敗しました: ${error.message}`);
  revalidatePath(`/admin/materials/${materialId}`);
}

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
  const { error } = await supabase.from("spec_options").insert({
    tenant_id: tenantId,
    spec_group_id: groupId,
    label: input.label.trim(),
    short_code: input.shortCode,
    sort_order: input.sortOrder,
    is_active: input.isActive,
  });
  if (error) throw new Error(`バリエーションの追加に失敗しました: ${error.message}`);
  await syncVariantsForMaterial(materialId, tenantId);
  revalidatePath(`/admin/materials/${materialId}`);
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
      short_code: input.shortCode,
      sort_order: input.sortOrder,
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", optionId)
    .eq("spec_group_id", groupId);
  if (error) throw new Error(`バリエーションの更新に失敗しました: ${error.message}`);
  await syncVariantsForMaterial(materialId, tenantId);
  revalidatePath(`/admin/materials/${materialId}`);
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

  const { count, error: countErr } = await supabase
    .from("material_variant_options")
    .select("variant_id", { count: "exact", head: true })
    .eq("spec_option_id", optionId);
  if (countErr) throw countErr;
  if ((count ?? 0) > 0) {
    throw new Error(
      "このバリエーションは既存の組み合わせで使われているため削除できません。非公開にしてください。"
    );
  }

  const { error } = await supabase
    .from("spec_options")
    .delete()
    .eq("id", optionId)
    .eq("spec_group_id", groupId);
  if (error) throw new Error(`バリエーションの削除に失敗しました: ${error.message}`);
  revalidatePath(`/admin/materials/${materialId}`);
}

// variant の仕様選択（spec_group ごとに 1 option）を一括 replace
export async function setVariantSpecOptions(
  materialId: string,
  variantId: string,
  selections: { spec_group_id: string; spec_option_id: string }[]
) {
  const tenantId = await getTenantId();
  await assertMaterialOwnedByTenant(materialId, tenantId);
  const supabase = await getSupabaseTenant();

  // variant が material に属するか確認
  const { data: variant, error: vErr } = await supabase
    .from("material_variants")
    .select("id")
    .eq("id", variantId)
    .eq("material_id", materialId)
    .maybeSingle();
  if (vErr) throw vErr;
  if (!variant) throw new Error("対象のバリエーションが見つかりません");

  // 既存を全削除して入れ直す（数は高々数件）
  const { error: delErr } = await supabase
    .from("material_variant_options")
    .delete()
    .eq("variant_id", variantId);
  if (delErr) throw new Error(`既存の紐付削除に失敗しました: ${delErr.message}`);

  if (selections.length === 0) {
    revalidatePath(`/admin/materials/${materialId}`);
    return;
  }

  const rows = selections.map((s) => ({
    variant_id: variantId,
    spec_group_id: s.spec_group_id,
    spec_option_id: s.spec_option_id,
    tenant_id: tenantId,
  }));
  const { error } = await supabase.from("material_variant_options").insert(rows);
  if (error) throw new Error(`仕様紐付の保存に失敗しました: ${error.message}`);

  revalidatePath(`/admin/materials/${materialId}`);
}
