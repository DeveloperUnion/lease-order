import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { resolveRecipientIdentity } from "@/lib/supabase-tenant";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const BUCKET = "chat-attachments";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_PREFIXES = ["image/", "application/pdf"];

export async function POST(req: Request): Promise<Response> {
  const identity = await resolveRecipientIdentity();
  if (identity.audience === "anonymous") {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid form" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file が必要です" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "ファイルサイズが上限を超えています" },
      { status: 413 }
    );
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_PREFIXES.some((p) => mime.startsWith(p))) {
    return NextResponse.json(
      { ok: false, error: "対応していない形式です" },
      { status: 415 }
    );
  }

  // パスは tenant_id/<sender>/<uuid>/<original-name> 形式。
  // 先頭セグメントが tenant_id であることで storage の RLS が効く。
  const safeName = file.name.replace(/[^\w.\-]/g, "_").slice(0, 80) || "file";
  const path = `${identity.tenantId}/${identity.audience}-${identity.recipientId}/${randomUUID()}/${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, Buffer.from(arrayBuffer), {
      contentType: mime,
      upsert: false,
    });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    attachment: { path, name: file.name, mime, size: file.size },
  });
}
