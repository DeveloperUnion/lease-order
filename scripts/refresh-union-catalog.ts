/**
 * union テナントのカタログ（categories / materials）を seed-source.ts の
 * tenantData.union に合わせて入れ替える。`supabase db reset` を使わず、
 * 稼働中の DB に対して直接適用するためのバッチ。
 *
 * - 正データは scripts/seed-source.ts の tenantData.union（単一の真実）
 * - union 分のみを対象。sanshin のデータには一切触れない
 * - 冪等。再実行すると毎回 union カタログを定義どおりに作り直す
 *
 * 削除の連鎖（union の既存カタログを消すため）:
 *   1. order_items を消す（material_id 参照は ON DELETE RESTRICT なので先に消す）
 *      → order_item_spec_options は order_item_id 経由の CASCADE で同時に消える
 *   2. materials を消す
 *      → material_variants / material_images / spec_groups は CASCADE で同時に消える
 *   3. categories を消す（materials を先に消しているので安全）
 *   ⚠️ union の発注明細（order_items / order_item_spec_options）も消える点に注意。
 *
 * 実行:
 *   npx tsx --env-file=.env.local scripts/refresh-union-catalog.ts
 */

import { createClient } from "@supabase/supabase-js";
import { tenantData } from "./seed-source";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定。.env.local を確認してください。"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const UNION_SLUG = "union";

function die(msg: string, err?: unknown): never {
  console.error(`✗ ${msg}`);
  if (err) console.error(err);
  process.exit(1);
}

async function main() {
  const data = tenantData[UNION_SLUG];
  if (!data) die(`tenantData['${UNION_SLUG}'] が見つかりません`);

  // --- union tenant_id を解決 ---
  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", UNION_SLUG)
    .single();
  if (tenantErr || !tenant) die("union テナントが見つかりません", tenantErr);
  const tenantId = tenant.id as string;
  console.log(`union tenant_id = ${tenantId}`);

  // seed-source 内部の category id（"union-cat-N"）→ slug の対応
  const internalCatIdToSlug = new Map<string, string>(
    data.categories.map((c) => [c.id, c.slug])
  );

  // --- 1. 既存 union materials を取得（order_items 削除のため id が要る）---
  const { data: existingMats, error: existErr } = await supabase
    .from("materials")
    .select("id")
    .eq("tenant_id", tenantId);
  if (existErr) die("既存 materials の取得に失敗", existErr);
  const existingMatIds = (existingMats ?? []).map((m) => m.id as string);
  console.log(`既存 union materials: ${existingMatIds.length} 件`);

  // --- 2. union の order_items を削除（order_item_spec_options は CASCADE）---
  if (existingMatIds.length > 0) {
    const { error: oiErr } = await supabase
      .from("order_items")
      .delete()
      .in("material_id", existingMatIds);
    if (oiErr) die("order_items の削除に失敗", oiErr);
    console.log("order_items（union の発注明細）を削除");
  }

  // --- 3. 既存 union materials を削除（variants / images / spec_groups は CASCADE）---
  {
    const { error } = await supabase
      .from("materials")
      .delete()
      .eq("tenant_id", tenantId);
    if (error) die("materials の削除に失敗", error);
    console.log("既存 union materials を削除");
  }

  // --- 4. 既存 union categories を削除 ---
  {
    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("tenant_id", tenantId);
    if (error) die("categories の削除に失敗", error);
    console.log("既存 union categories を削除");
  }

  // --- 5. 新 categories を挿入し、slug → DB id の対応を得る ---
  const categoryRows = data.categories.map((c) => ({
    tenant_id: tenantId,
    name: c.name,
    slug: c.slug,
    sort_order: c.sort_order,
  }));
  const { data: insertedCats, error: catErr } = await supabase
    .from("categories")
    .insert(categoryRows)
    .select("id, slug");
  if (catErr || !insertedCats) die("categories の挿入に失敗", catErr);
  const slugToDbId = new Map<string, string>(
    insertedCats.map((c) => [c.slug as string, c.id as string])
  );
  console.log(`新 categories を挿入: ${insertedCats.length} 件`);

  // --- 6. 新 materials を挿入 ---
  const materialRows = data.materials.map((m) => {
    const catSlug = internalCatIdToSlug.get(m.category_id);
    const categoryId = catSlug ? slugToDbId.get(catSlug) : undefined;
    if (!categoryId) {
      die(`material "${m.name}" の category_id 解決に失敗 (slug=${catSlug})`);
    }
    return {
      tenant_id: tenantId,
      category_id: categoryId,
      name: m.name,
      description: m.description,
      spec: m.spec,
      daily_price: m.daily_price ?? null,
      monthly_price: m.monthly_price ?? null,
      sort_order: m.sort_order,
      is_active: m.is_active,
    };
  });
  const { error: matErr, count } = await supabase
    .from("materials")
    .insert(materialRows, { count: "exact" });
  if (matErr) die("materials の挿入に失敗", matErr);
  console.log(`新 materials を挿入: ${count ?? materialRows.length} 件`);

  // --- 7. union の課金ルールを月額に（default も monthly なので実質確認用） ---
  {
    const { error } = await supabase
      .from("tenants")
      .update({ billing_rule: { type: "monthly" } })
      .eq("id", tenantId);
    if (error) die("billing_rule の更新に失敗", error);
    console.log("union の billing_rule を monthly に設定");
  }

  console.log("\n✓ union カタログを seed-source の定義どおりに更新しました。");
}

main().catch((e) => die("予期しないエラー", e));
