import { NextResponse } from "next/server";
import { getSupabaseTenant } from "@/lib/supabase-tenant";
import { getTenantId } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { currentAdminUserId } from "@/lib/current-admin";
import {
  IntakeExtractionSchema,
  type IntakeExtraction,
  type ResolvedIntake,
} from "@/lib/intake/types";
import { resolveIntakeExtraction } from "@/lib/intake/material-matcher";

export const dynamic = "force-dynamic";

// GET /api/intake/:id
// 既に AI 抽出済み（status='extracted'）のドキュメントを再表示用に取得する。
// 抽出前なら 409。
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();

  const { data: doc } = await supabase
    .from("order_intake_documents")
    .select(
      "id, tenant_id, source, customer_id, mime_type, status, ai_inference, ai_model, ai_error, consumed_order_id"
    )
    .eq("id", id)
    .maybeSingle();
  if (!doc || doc.tenant_id !== tenantId) {
    return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
  }

  if (doc.source === "customer_self") {
    const customer = await getCurrentCustomer();
    if (!customer || customer.id !== doc.customer_id) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }
  } else {
    const adminId = await currentAdminUserId(tenantId);
    if (!adminId) {
      return NextResponse.json({ error: "管理者認証が必要です" }, { status: 401 });
    }
  }

  if (doc.status === "failed") {
    return NextResponse.json(
      { status: "failed", error: doc.ai_error ?? "AI 抽出に失敗しました" },
      { status: 200 }
    );
  }
  if (doc.status === "uploaded" || doc.status === "extracting") {
    return NextResponse.json(
      { status: doc.status, error: "まだ抽出が完了していません" },
      { status: 200 }
    );
  }

  // extracted / consumed のケースで ai_inference を再解決して返す
  const parsed = IntakeExtractionSchema.safeParse(doc.ai_inference ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { status: "failed", error: "保存された抽出結果の形式が不正です" },
      { status: 500 }
    );
  }
  const inference: IntakeExtraction = parsed.data;
  const resolved: ResolvedIntake = await resolveIntakeExtraction(
    supabase,
    tenantId,
    id,
    inference,
    (doc.ai_model as string | null) ?? "unknown"
  );
  if (doc.status === "consumed") resolved.status = "consumed";
  return NextResponse.json({
    ok: true,
    resolved,
    consumed_order_id: doc.consumed_order_id ?? null,
  });
}
