import { NextResponse } from "next/server";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSupabaseTenant } from "@/lib/supabase-tenant";
import { getTenantId } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { currentAdminUserId } from "@/lib/current-admin";
import { IntakeExtractionSchema, type IntakeExtraction } from "@/lib/intake/types";
import {
  loadMaterialsForAiContext,
  resolveIntakeExtraction,
} from "@/lib/intake/material-matcher";

export const dynamic = "force-dynamic";

const BUCKET = "order-intake-documents";
const MODEL = "gemini-2.5-pro";
const SIGNED_URL_TTL = 60 * 10; // 10 分
const MAX_INLINE_BYTES = 20 * 1024 * 1024; // Gemini inlineData の上限は 20MB

// 起動時に SDK を初期化。GEMINI_API_KEY が未設定でもモジュール読み込みは
// 通って、リクエスト時に丁寧なエラーを返せるようにする。
const apiKey = process.env.GEMINI_API_KEY;
const genai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// POST /api/intake/extract
// body: { documentId: string }
// 既に extracted 済みでも upload 直後でも、何度でも呼び直し可能（ai_inference を上書き）。
export async function POST(req: Request) {
  try {
    if (!genai) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY が未設定です。サーバー管理者に連絡してください。" },
        { status: 500 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as { documentId?: string };
    const documentId = body.documentId;
    if (!documentId || typeof documentId !== "string") {
      return NextResponse.json({ error: "documentId が必要です" }, { status: 400 });
    }

    const tenantId = await getTenantId();
    const supabase = await getSupabaseTenant();

    const { data: doc } = await supabase
      .from("order_intake_documents")
      .select(
        "id, tenant_id, source, customer_id, storage_path, mime_type, status, consumed_order_id"
      )
      .eq("id", documentId)
      .maybeSingle();
    if (!doc || doc.tenant_id !== tenantId) {
      return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    }
    if (doc.status === "consumed") {
      return NextResponse.json(
        { error: "既に発注に変換されています" },
        { status: 409 }
      );
    }

    // 顧客 self はその顧客本人のみ。admin_proxy は管理者セッション必須。
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

    // ステータスを extracting に進める（ベストエフォート）
    await supabase
      .from("order_intake_documents")
      .update({ status: "extracting", ai_error: null })
      .eq("id", documentId);

    // 署名 URL からファイル本体を取り寄せて base64 化（Gemini は inlineData で直接受ける）。
    // Supabase 署名 URL は外部 URL なので fileUri 直渡しでは Gemini が拒否する。
    // 10MB 上限の中なので memory に乗せて問題ない。
    const { data: signed, error: sigErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path as string, SIGNED_URL_TTL);
    if (sigErr || !signed) {
      const msg = `署名URLの生成に失敗: ${sigErr?.message ?? "unknown"}`;
      await supabase
        .from("order_intake_documents")
        .update({ status: "failed", ai_error: msg })
        .eq("id", documentId);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    let inlineBase64: string;
    try {
      const fileRes = await fetch(signed.signedUrl);
      if (!fileRes.ok) {
        throw new Error(`fetch ${fileRes.status} ${fileRes.statusText}`);
      }
      const buf = Buffer.from(await fileRes.arrayBuffer());
      if (buf.byteLength > MAX_INLINE_BYTES) {
        throw new Error(`ファイルが大きすぎます（${MAX_INLINE_BYTES} bytes 上限）`);
      }
      inlineBase64 = buf.toString("base64");
    } catch (e) {
      const msg = `ファイル取得に失敗: ${e instanceof Error ? e.message : String(e)}`;
      await supabase
        .from("order_intake_documents")
        .update({ status: "failed", ai_error: msg })
        .eq("id", documentId);
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    // AI に渡す資材マスタ候補（id, name, category）
    const catalog = await loadMaterialsForAiContext(supabase, tenantId);
    const catalogBlock = JSON.stringify(catalog.slice(0, 200));

    const systemPrompt =
      "あなたは建設資材リース会社の発注書 OCR アシスタントです。" +
      "添付された発注書（画像 or PDF）から、現場・期間・配送・明細を読み取り、" +
      "指定スキーマに従って JSON で返してください。\n" +
      "- 各明細の matched_material_id は『資材マスタ候補』中の id をそのまま選ぶ。該当しないなら null。\n" +
      "- 日付は西暦の YYYY-MM-DD。和暦・曖昧な記述は変換できる場合のみ埋める。\n" +
      "- 数量は整数。読み取れなければ 1。\n" +
      "- delivery_method は配送指示があれば 'delivery'、引取・営業所pickup なら 'pickup'、判別不能は 'unknown'。\n" +
      "- confidence は文字の鮮明さ・記載の明確さで控えめに付ける。\n";

    const userText =
      `資材マスタ候補（id と name と category）。matched_material_id は必ずこの中の id を使う：\n${catalogBlock}\n\n` +
      "添付ファイルを読み取って IntakeExtraction スキーマで返してください。";

    // Zod スキーマを JSON Schema に変換して Gemini の responseJsonSchema に渡す。
    // Zod v4 のクラスメソッドを使用。
    const responseJsonSchema = z.toJSONSchema(IntakeExtractionSchema);

    let extraction: IntakeExtraction;
    let usedModel = MODEL;
    try {
      const aiRes = await genai.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { text: `${systemPrompt}\n\n${userText}` },
              {
                inlineData: {
                  mimeType: (doc.mime_type as string) || "application/octet-stream",
                  data: inlineBase64,
                },
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema,
        },
      });

      const rawText = aiRes.text;
      if (!rawText) throw new Error("AI から空レスポンスが返ってきました");
      const parsed = JSON.parse(rawText);
      const validated = IntakeExtractionSchema.safeParse(parsed);
      if (!validated.success) {
        throw new Error(
          `AI 出力がスキーマ違反: ${validated.error.issues.slice(0, 3).map((e) => e.message).join(", ")}`
        );
      }
      extraction = validated.data;
      usedModel = MODEL;
    } catch (err) {
      const msg = `AI 抽出に失敗しました: ${err instanceof Error ? err.message : String(err)}`;
      console.error("intake/extract: AI error", err);
      await supabase
        .from("order_intake_documents")
        .update({
          status: "failed",
          ai_model: MODEL,
          ai_invoked_at: new Date().toISOString(),
          ai_error: msg,
        })
        .eq("id", documentId);
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    // audit 保存（raw 結果）
    await supabase
      .from("order_intake_documents")
      .update({
        ai_inference: extraction as unknown as Record<string, unknown>,
        ai_model: usedModel,
        ai_invoked_at: new Date().toISOString(),
        ai_error: null,
        status: "extracted",
      })
      .eq("id", documentId);

    // material_id 解決
    const resolved = await resolveIntakeExtraction(
      supabase,
      tenantId,
      documentId,
      extraction,
      usedModel
    );

    return NextResponse.json({ ok: true, resolved });
  } catch (e) {
    console.error("intake/extract: unhandled", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "不明なエラーが発生しました" },
      { status: 500 }
    );
  }
}
