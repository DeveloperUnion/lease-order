import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSupabaseTenant } from "@/lib/supabase-tenant";
import { getTenantId } from "@/lib/tenant";
import { currentAdminUserId } from "@/app/admin/(panel)/requests/_helpers";

export const dynamic = "force-dynamic";

// 暫定で intake と同じ Gemini を使う。自社の機械学習モデルが完成したら
// （HuggingFace 等にデプロイ予定）こちらに差し替える。
const MODEL = "gemini-3.1-flash-lite";
const SIGNED_URL_TTL = 60 * 10; // 10 分（AI 推論の所要時間に余裕を持たせる）
const MAX_INLINE_BYTES = 20 * 1024 * 1024;

const apiKey = process.env.GEMINI_API_KEY;
const genai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const InspectionResult = z.object({
  items: z
    .array(
      z.object({
        material_name: z
          .string()
          .describe("期待される資材リストに含まれる名前を可能な限りそのまま入れる。該当しない場合は 'unknown'。"),
        detected_quantity: z.number().int().min(0).describe("写真に写っている本数の合計"),
        damaged_quantity: z
          .number()
          .int()
          .min(0)
          .describe("曲がり・割れ・著しい汚れ等、損傷していると判断される本数（detected_quantity 以下）"),
        confidence: z.number().min(0).max(1).describe("0-1 の自信度。曖昧なら低めに付ける"),
        notes: z.string().optional().describe("補足コメント（個別の所見）"),
      })
    )
    .describe("写真から読み取れた資材ごとの集計"),
  overall_notes: z
    .string()
    .optional()
    .describe("全体としての所感（写真の枚数不足、判別不能、複数発注混在の可能性など）"),
});

type InspectionResult = z.infer<typeof InspectionResult>;

type ExpectedItem = {
  order_item_id: string;
  material_name: string;
  variant_name: string | null;
  requested_quantity_delta: number;
};

export async function POST(req: Request) {
  try {
    if (!genai) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY が未設定です。サーバー管理者に連絡してください。" },
        { status: 500 }
      );
    }
    const body = (await req.json()) as { returnRequestId?: string };
    const requestId = body.returnRequestId;
    if (!requestId || typeof requestId !== "string") {
      return NextResponse.json({ error: "returnRequestId が必要です" }, { status: 400 });
    }

    const tenantId = await getTenantId();
    const adminId = await currentAdminUserId(tenantId);
    if (!adminId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const supabase = await getSupabaseTenant();

    // 受領対象の return_request を読み込み、scheduled 状態のみ受け付ける
    const { data: rr } = await supabase
      .from("return_requests")
      .select("id, status, tenant_id, order_item_id, requested_quantity_delta, order_items(id, order_id)")
      .eq("id", requestId)
      .maybeSingle();
    if (!rr || rr.tenant_id !== tenantId) {
      return NextResponse.json({ error: "対象の予定が見つかりません" }, { status: 404 });
    }
    if (rr.status !== "scheduled") {
      return NextResponse.json({ error: "受領待ち以外の予定では実行できません" }, { status: 400 });
    }
    const orderId =
      ((rr as unknown) as { order_items: { order_id: string } | null }).order_items?.order_id ?? null;
    if (!orderId) {
      return NextResponse.json({ error: "発注が特定できません" }, { status: 404 });
    }

    // 同じ発注で未返却が残っている明細をまとめて「期待リスト」にする。
    // この受領で扱う 1 件だけだと AI が誤検出しがちなので、発注全体を文脈として渡す。
    const { data: itemsRaw } = await supabase
      .from("order_items")
      .select("id, material_name, variant_name, quantity, returned_quantity, lost_quantity")
      .eq("order_id", orderId);
    const expected: ExpectedItem[] = [];
    for (const it of itemsRaw ?? []) {
      const remaining =
        (it.quantity as number) -
        (it.returned_quantity as number) -
        ((it.lost_quantity as number | null) ?? 0);
      if (remaining <= 0) continue;
      expected.push({
        order_item_id: it.id as string,
        material_name: it.material_name as string,
        variant_name: (it.variant_name as string | null) ?? null,
        requested_quantity_delta:
          it.id === rr.order_item_id ? (rr.requested_quantity_delta as number) : remaining,
      });
    }

    // 写真の signed URL を発行（AI が直接 GET できるよう）
    const { data: photoRows } = await supabase
      .from("return_photos")
      .select("id, storage_path")
      .eq("return_request_id", requestId)
      .order("sort_order", { ascending: true });
    const photoEntries = photoRows ?? [];
    if (photoEntries.length === 0) {
      return NextResponse.json({ error: "写真が登録されていません" }, { status: 400 });
    }

    // Supabase 署名 URL は外部 URL なので Gemini が直接読めない。
    // 各写真を fetch して base64 inlineData として渡す。
    const photos: { id: string; base64: string; mimeType: string }[] = [];
    for (const row of photoEntries) {
      const { data: signed, error: sigErr } = await supabaseAdmin.storage
        .from("return-photos")
        .createSignedUrl(row.storage_path as string, SIGNED_URL_TTL);
      if (sigErr || !signed) {
        return NextResponse.json(
          { error: `署名URLの生成に失敗: ${sigErr?.message ?? "unknown"}` },
          { status: 500 }
        );
      }
      try {
        const r = await fetch(signed.signedUrl);
        if (!r.ok) throw new Error(`fetch ${r.status} ${r.statusText}`);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.byteLength > MAX_INLINE_BYTES) {
          throw new Error("写真サイズが大きすぎます");
        }
        const mime = r.headers.get("content-type") ?? "image/jpeg";
        photos.push({
          id: row.id as string,
          base64: buf.toString("base64"),
          mimeType: mime,
        });
      } catch (e) {
        return NextResponse.json(
          {
            error: `写真の取得に失敗: ${e instanceof Error ? e.message : String(e)}`,
          },
          { status: 502 }
        );
      }
    }

    const expectedBlock = expected
      .map(
        (e, i) =>
          `${i + 1}. ${e.material_name}${e.variant_name ? `（${e.variant_name}）` : ""} ×${e.requested_quantity_delta}`
      )
      .join("\n");

    const systemPrompt =
      "あなたは建設資材リース会社の検品アシスタントです。提供された写真群から、戻ってきた資材の種類と本数を読み取ってください。" +
      "可能な限り material_name は与えられた期待リスト中の文字列にそのまま揃え、該当しないものは 'unknown' にしてください。" +
      "複数の写真に同じ資材が写っている場合は重複カウントを避け、写真全体での合計本数を返してください。" +
      "明らかな曲がり・割れ・著しい汚れ等を damaged_quantity として別途数えてください（detected_quantity 以下）。" +
      "判別が難しい場合は confidence を下げ、overall_notes に理由を書いてください。";

    const userText =
      `期待される資材リスト（残レンタル中の本数）:\n${expectedBlock}\n\n` +
      `この受領で特に対象となっている明細：${
        expected.find((e) => e.order_item_id === rr.order_item_id)?.material_name ?? "(不明)"
      }`;

    const responseJsonSchema = z.toJSONSchema(InspectionResult);

    let result: InspectionResult;
    let usedModel = MODEL;
    try {
      const aiRes = await genai.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { text: `${systemPrompt}\n\n${userText}` },
              ...photos.map((p) => ({
                inlineData: { mimeType: p.mimeType, data: p.base64 },
              })),
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
      const validated = InspectionResult.safeParse(parsed);
      if (!validated.success) {
        throw new Error(
          `AI 出力がスキーマ違反: ${validated.error.issues.slice(0, 3).map((e) => e.message).join(", ")}`
        );
      }
      result = validated.data;
      usedModel = MODEL;
    } catch (err) {
      console.error("inspect-return: AI 呼び出し失敗", err);
      return NextResponse.json(
        { error: `AI 読み取りに失敗しました: ${err instanceof Error ? err.message : String(err)}` },
        { status: 502 }
      );
    }

    // 監査用に raw 結果を保存
    await supabase
      .from("return_requests")
      .update({
        ai_inference: result as unknown as Record<string, unknown>,
        ai_model: usedModel,
        ai_invoked_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    // この受領で対象となっている明細に紐づく値を抽出して prefill する
    const targetExpected = expected.find((e) => e.order_item_id === rr.order_item_id);
    const targetName = targetExpected?.material_name ?? null;
    const matched = targetName
      ? result.items.find((it) => it.material_name === targetName) ?? null
      : null;

    const requested = rr.requested_quantity_delta as number;
    let received = 0;
    let damaged = 0;
    if (matched) {
      received = Math.min(matched.detected_quantity, requested);
      damaged = Math.min(matched.damaged_quantity, received);
    }
    const lost = Math.max(0, requested - received); // 検出されなかった分は「損失」候補としてプリフィル
    const cancelled = 0;

    return NextResponse.json({
      ok: true,
      model: usedModel,
      expected,
      result,
      prefill: {
        receivedQuantity: received,
        cancelledQuantity: cancelled,
        lostQuantity: lost,
        damagedQuantity: damaged,
        damageNotes: matched?.notes ?? null,
        overallNotes: result.overall_notes ?? null,
      },
      matched: matched
        ? {
            material_name: matched.material_name,
            detected_quantity: matched.detected_quantity,
            damaged_quantity: matched.damaged_quantity,
            confidence: matched.confidence,
            notes: matched.notes ?? null,
          }
        : null,
    });
  } catch (e) {
    console.error("inspect-return: unhandled", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "不明なエラーが発生しました" },
      { status: 500 }
    );
  }
}
