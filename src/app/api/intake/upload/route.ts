import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSupabaseTenant } from "@/lib/supabase-tenant";
import { getTenantId } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { currentAdminUserId } from "@/lib/current-admin";
import { buildIntakeStoragePath } from "@/lib/intake/types";

export const dynamic = "force-dynamic";

const BUCKET = "order-intake-documents";
const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ACCEPTED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

// POST /api/intake/upload
// multipart/form-data:
//   - file: File   （必須）
//   - source: 'customer_self' | 'admin_proxy'   （必須）
//   - customerId: string   （source='admin_proxy' のときのみ。管理者代行で発注先となる顧客）
export async function POST(req: Request) {
  try {
    const tenantId = await getTenantId();
    const form = await req.formData();
    const file = form.get("file");
    const source = String(form.get("source") ?? "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "ファイルが添付されていません" }, { status: 400 });
    }
    if (!ACCEPTED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: "対応していないファイル形式です（JPEG/PNG/WebP/PDF）" },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "ファイルサイズが大きすぎます（10MB 以下）" },
        { status: 400 }
      );
    }

    let customerId: string | null = null;
    let uploadedByAdminId: string | null = null;
    let uploadedByCustomerId: string | null = null;

    if (source === "customer_self") {
      const customer = await getCurrentCustomer();
      if (!customer) {
        return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
      }
      if (customer.tenant_id !== tenantId) {
        return NextResponse.json({ error: "テナントが一致しません" }, { status: 403 });
      }
      customerId = customer.id;
      uploadedByCustomerId = customer.id;
    } else if (source === "admin_proxy") {
      const adminId = await currentAdminUserId(tenantId);
      if (!adminId) {
        return NextResponse.json({ error: "管理者認証が必要です" }, { status: 401 });
      }
      const cidRaw = form.get("customerId");
      const cid = typeof cidRaw === "string" ? cidRaw : "";
      if (!cid) {
        return NextResponse.json({ error: "顧客が指定されていません" }, { status: 400 });
      }
      // 同テナントの customer であることを確認
      const supabase = await getSupabaseTenant();
      const { data: cust } = await supabase
        .from("customers")
        .select("id, tenant_id, is_active")
        .eq("id", cid)
        .maybeSingle();
      if (!cust || cust.tenant_id !== tenantId || !cust.is_active) {
        return NextResponse.json({ error: "顧客が見つかりません" }, { status: 404 });
      }
      customerId = cust.id;
      uploadedByAdminId = adminId;
    } else {
      return NextResponse.json({ error: "source が不正です" }, { status: 400 });
    }

    const documentId = crypto.randomUUID();
    const storagePath = buildIntakeStoragePath(tenantId, documentId, file.name);

    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (upErr) {
      return NextResponse.json(
        { error: `アップロードに失敗しました: ${upErr.message}` },
        { status: 500 }
      );
    }

    const supabase = await getSupabaseTenant();
    const { error: insErr } = await supabase.from("order_intake_documents").insert({
      id: documentId,
      tenant_id: tenantId,
      source,
      customer_id: customerId,
      uploaded_by_admin_id: uploadedByAdminId,
      uploaded_by_customer_id: uploadedByCustomerId,
      storage_path: storagePath,
      mime_type: file.type,
      status: "uploaded",
    });
    if (insErr) {
      await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      return NextResponse.json(
        { error: `登録に失敗しました: ${insErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, documentId });
  } catch (e) {
    console.error("intake/upload: unhandled", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "不明なエラーが発生しました" },
      { status: 500 }
    );
  }
}
