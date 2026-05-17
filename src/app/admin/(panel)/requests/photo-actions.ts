"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSupabaseTenant } from "@/lib/supabase-tenant";
import { getTenantId } from "@/lib/tenant";
import { currentAdminUserId } from "./_helpers";

const BUCKET = "return-photos";
const MAX_BYTES = 6 * 1024 * 1024; // 6MB
const SIGNED_URL_TTL = 60 * 15; // 15 分

export type ReturnPhoto = {
  id: string;
  signedUrl: string;
  uploadedAt: string;
};

async function loadScheduledReturn(requestId: string, tenantId: string) {
  const supabase = await getSupabaseTenant();
  const { data } = await supabase
    .from("return_requests")
    .select("id, status, tenant_id, order_item_id, requested_quantity_delta, order_items(orders(id))")
    .eq("id", requestId)
    .maybeSingle();
  if (!data || data.tenant_id !== tenantId) return null;
  const orderId = ((data as unknown) as {
    order_items: { orders: { id: string } | null } | null;
  }).order_items?.orders?.id ?? null;
  return {
    id: data.id as string,
    status: data.status as string,
    requestedDelta: data.requested_quantity_delta as number,
    orderId,
  };
}

function extOf(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && /^[a-z0-9]{2,5}$/i.test(fromName)) return fromName.toLowerCase();
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

async function signedUrl(path: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (error || !data) throw new Error(`署名URLの生成に失敗: ${error?.message ?? "unknown"}`);
  return data.signedUrl;
}

export async function uploadReturnPhoto(
  requestId: string,
  formData: FormData
): Promise<ReturnPhoto> {
  const tenantId = await getTenantId();
  const loaded = await loadScheduledReturn(requestId, tenantId);
  if (!loaded) throw new Error("対象の予定が見つかりません");
  if (loaded.status !== "scheduled") {
    throw new Error("受領待ち以外の予定には写真を追加できません");
  }

  const file = formData.get("photo");
  if (!(file instanceof File)) throw new Error("ファイルが添付されていません");
  if (!file.type.startsWith("image/")) throw new Error("画像ファイルを選択してください");
  if (file.size > MAX_BYTES) throw new Error("ファイルサイズが大きすぎます（6MB 以下）");

  const adminId = await currentAdminUserId(tenantId);
  const supabase = await getSupabaseTenant();
  const { data: existing } = await supabase
    .from("return_photos")
    .select("id")
    .eq("return_request_id", requestId);
  const sortOrder = existing?.length ?? 0;

  // パス：先頭セグメントを tenant_id にして Storage RLS の foldername(name)[1] と一致させる
  const path = `${tenantId}/${requestId}/${crypto.randomUUID()}.${extOf(file)}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw new Error(`画像アップロードに失敗: ${upErr.message}`);

  const { data: row, error: insErr } = await supabase
    .from("return_photos")
    .insert({
      tenant_id: tenantId,
      return_request_id: requestId,
      storage_path: path,
      sort_order: sortOrder,
      uploaded_by_admin_id: adminId,
    })
    .select("id, uploaded_at")
    .single();
  if (insErr || !row) {
    // 失敗時はオブジェクトを巻き戻す
    await supabaseAdmin.storage.from(BUCKET).remove([path]).catch(() => {});
    throw new Error(`写真メタの保存に失敗: ${insErr?.message ?? "unknown"}`);
  }

  return {
    id: row.id as string,
    signedUrl: await signedUrl(path),
    uploadedAt: row.uploaded_at as string,
  };
}

export async function deleteReturnPhoto(photoId: string): Promise<void> {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const { data: photo } = await supabase
    .from("return_photos")
    .select("id, storage_path, return_request_id, tenant_id, return_requests(status)")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo || photo.tenant_id !== tenantId) throw new Error("対象の写真が見つかりません");
  const status = ((photo as unknown) as {
    return_requests: { status: string } | null;
  }).return_requests?.status;
  if (status !== "scheduled") {
    throw new Error("受領待ち以外の予定の写真は削除できません");
  }

  await supabaseAdmin.storage.from(BUCKET).remove([photo.storage_path as string]).catch(() => {});
  const { error } = await supabase.from("return_photos").delete().eq("id", photoId);
  if (error) throw error;
}

export async function listReturnPhotos(requestId: string): Promise<ReturnPhoto[]> {
  const tenantId = await getTenantId();
  const loaded = await loadScheduledReturn(requestId, tenantId);
  if (!loaded) return [];
  const supabase = await getSupabaseTenant();
  const { data, error } = await supabase
    .from("return_photos")
    .select("id, storage_path, uploaded_at")
    .eq("return_request_id", requestId)
    .order("sort_order", { ascending: true });
  if (error) throw error;

  const out: ReturnPhoto[] = [];
  for (const row of data ?? []) {
    out.push({
      id: row.id as string,
      signedUrl: await signedUrl(row.storage_path as string),
      uploadedAt: row.uploaded_at as string,
    });
  }
  return out;
}

// 受領済み return_request 向け：完了した行の写真を取得（履歴ビュー用）。
// status は完了系（completed / cancelled / rejected）のみ許可。
export async function listCompletedReturnPhotos(requestId: string): Promise<ReturnPhoto[]> {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const { data: req } = await supabase
    .from("return_requests")
    .select("id, status, tenant_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!req || req.tenant_id !== tenantId) return [];

  const { data: photos, error } = await supabase
    .from("return_photos")
    .select("id, storage_path, uploaded_at")
    .eq("return_request_id", requestId)
    .order("sort_order", { ascending: true });
  if (error) throw error;

  const out: ReturnPhoto[] = [];
  for (const row of photos ?? []) {
    out.push({
      id: row.id as string,
      signedUrl: await signedUrl(row.storage_path as string),
      uploadedAt: row.uploaded_at as string,
    });
  }
  return out;
}

