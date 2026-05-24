import { z } from "zod";

// AI（Gemini）が発注書から抽出する生の構造。
// material_name_raw / matched_material_id を両方持たせ、サーバ側の
// material-matcher.ts が最終的な material_id を決める。
export const IntakeExtractionSchema = z.object({
  site_name: z.string().nullable().describe("現場名（書面に書かれていれば）"),
  company_name: z.string().nullable().describe("発注元会社名（あれば）"),
  contact_name: z.string().nullable().describe("担当者名"),
  phone: z.string().nullable().describe("連絡先電話番号"),
  rental_start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .describe("リース開始日 YYYY-MM-DD。曖昧なら null"),
  rental_end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .describe("リース終了日 YYYY-MM-DD。曖昧なら null"),
  delivery_method: z
    .enum(["delivery", "pickup", "unknown"])
    .describe("配送方法。判別不能なら 'unknown'"),
  delivery_address: z.string().nullable().describe("配送先住所（delivery のとき）"),
  pickup_office_hint: z
    .string()
    .nullable()
    .describe("引取営業所名の手がかり（pickup のとき）"),
  note: z.string().nullable().describe("特記事項・備考"),
  items: z
    .array(
      z.object({
        material_name_raw: z.string().describe("書面に書かれた資材名そのまま"),
        matched_material_id: z
          .string()
          .nullable()
          .describe(
            "渡された資材マスタ候補リスト中の id を選ぶ。該当なしなら null"
          ),
        spec_hints: z
          .array(
            z.object({
              group_name: z.string(),
              option_label: z.string(),
            })
          )
          .describe("仕様の手がかり（長さ、サイズなど）。なければ空配列"),
        quantity: z
          .number()
          .int()
          .min(1)
          .describe("数量。読み取れなければ 1 にしておく"),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .describe("行ごとの自信度。曖昧なら低く"),
        note: z.string().nullable().describe("行ごとの補足"),
      })
    )
    .describe("発注明細"),
  overall_confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("全体の自信度"),
  overall_notes: z
    .string()
    .nullable()
    .describe("全体としての所感（読み取り困難、複数発注混在、宛名不一致など）"),
});

export type IntakeExtraction = z.infer<typeof IntakeExtractionSchema>;

// 抽出結果を material-matcher で解決した後の、クライアントに返す形。
export type ResolvedIntakeItem = {
  material_name_raw: string;
  material_id: string | null; // null なら未マッチ。UI で人が選択するまでカート投入不可
  material_name: string | null; // マッチした場合の表示名
  spec_hints: { group_name: string; option_label: string }[];
  quantity: number;
  confidence: number;
  note: string | null;
};

export type ResolvedIntake = {
  document_id: string;
  status: "extracted" | "failed" | "consumed";
  form_fields: {
    site_name: string | null;
    company_name: string | null;
    contact_name: string | null;
    phone: string | null;
    rental_start_date: string | null;
    rental_end_date: string | null;
    delivery_method: "delivery" | "pickup" | "unknown";
    delivery_address: string | null;
    pickup_office_hint: string | null;
    note: string | null;
  };
  items: ResolvedIntakeItem[];
  overall_confidence: number;
  overall_notes: string | null;
  ai_model: string | null;
};

// Storage 上のオブジェクトキーは tenant_id 配下にフラットに置く。
// RLS で `(storage.foldername(name))[1] = tenant_id` を要求するため、
// 必ず "<tenant_id>/..." 形式にすること。
export function buildIntakeStoragePath(
  tenantId: string,
  documentId: string,
  filename: string
): string {
  const safeName = filename.replace(/[^\w.\-]/g, "_");
  return `${tenantId}/${documentId}/${safeName}`;
}
