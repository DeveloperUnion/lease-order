import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntakeExtraction, ResolvedIntake, ResolvedIntakeItem } from "./types";

type MaterialRow = { id: string; name: string };

// 表記揺れ吸収のための簡易ノーマライザ。全角/半角・空白・括弧を統一。
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[　\s]+/g, "")
    .replace(/[（）()【】\[\]「」『』]/g, "");
}

// 1. AI が選んだ matched_material_id が active な materials に存在すれば採用
// 2. material_name_raw を完全一致でルックアップ（normalize 後）
// 3. ILIKE 部分一致でフォールバック
// 4. それでも見つからなければ null（未マッチ）
function resolveOne(
  raw: string,
  aiPickedId: string | null,
  byId: Map<string, MaterialRow>,
  byNormalizedName: Map<string, MaterialRow>,
  rows: MaterialRow[]
): { id: string | null; name: string | null } {
  if (aiPickedId && byId.has(aiPickedId)) {
    const m = byId.get(aiPickedId)!;
    return { id: m.id, name: m.name };
  }
  const norm = normalizeForMatch(raw);
  if (!norm) return { id: null, name: null };
  const exact = byNormalizedName.get(norm);
  if (exact) return { id: exact.id, name: exact.name };

  // ILIKE 相当: 正規化済の name を含むか、name に含まれるか
  // （短い略称が長い正式名にマッチするケースを救う）
  for (const r of rows) {
    const rn = normalizeForMatch(r.name);
    if (rn && (rn.includes(norm) || norm.includes(rn))) {
      return { id: r.id, name: r.name };
    }
  }
  return { id: null, name: null };
}

export async function resolveIntakeExtraction(
  supabase: SupabaseClient,
  tenantId: string,
  documentId: string,
  extraction: IntakeExtraction,
  aiModel: string
): Promise<ResolvedIntake> {
  const { data: matRows, error } = await supabase
    .from("materials")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  if (error) throw error;

  const rows = (matRows ?? []) as MaterialRow[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const byNormalizedName = new Map<string, MaterialRow>();
  for (const r of rows) {
    const k = normalizeForMatch(r.name);
    if (k && !byNormalizedName.has(k)) byNormalizedName.set(k, r);
  }

  const items: ResolvedIntakeItem[] = extraction.items.map((it) => {
    const { id, name } = resolveOne(
      it.material_name_raw,
      it.matched_material_id,
      byId,
      byNormalizedName,
      rows
    );
    return {
      material_name_raw: it.material_name_raw,
      material_id: id,
      material_name: name,
      spec_hints: it.spec_hints,
      quantity: it.quantity,
      confidence: it.confidence,
      note: it.note,
    };
  });

  return {
    document_id: documentId,
    status: "extracted",
    form_fields: {
      site_name: extraction.site_name,
      company_name: extraction.company_name,
      contact_name: extraction.contact_name,
      phone: extraction.phone,
      rental_start_date: extraction.rental_start_date,
      rental_end_date: extraction.rental_end_date,
      delivery_method: extraction.delivery_method,
      delivery_address: extraction.delivery_address,
      pickup_office_hint: extraction.pickup_office_hint,
      note: extraction.note,
    },
    items,
    overall_confidence: extraction.overall_confidence,
    overall_notes: extraction.overall_notes,
    ai_model: aiModel,
  };
}

// AI に渡す「資材マスタ候補リスト」をサイズ制限つきで構築。
// 数百件規模を想定しているが、将来的に大量になったら category で絞る。
export async function loadMaterialsForAiContext(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ id: string; name: string; category_name: string | null }[]> {
  const { data, error } = await supabase
    .from("materials")
    .select("id, name, categories(name)")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(500);
  if (error) throw error;
  type Row = {
    id: string;
    name: string;
    categories: { name: string } | { name: string }[] | null;
  };
  return ((data ?? []) as Row[]).map((m) => {
    const cat = Array.isArray(m.categories) ? m.categories[0] ?? null : m.categories;
    return {
      id: m.id,
      name: m.name,
      category_name: cat?.name ?? null,
    };
  });
}
