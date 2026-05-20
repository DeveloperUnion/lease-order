-- ============================================================
-- 0006 で drop したはずの materials.slug を、改めて drop する。
--
-- 経緯:
--   - 0006 の version 番号が過去に別 migration (add_customers_and_returns)
--     と衝突したまま staging/prod に記録されており、本来の 0006
--     (drop_material_slug_add_variant_unit) の内容が適用されないまま
--     残っていた。
--   - 結果として slug カラムが NOT NULL UNIQUE のまま残り、resource を
--     新規作成しようとすると not-null 制約違反になる。
--
-- マテリアルの slug はソースコード全体で未使用（顧客側ルーティングは
-- UUID 経由、admin は uuid + name 表示のみ）のため安全に削除可能。
-- cascade で unique(tenant_id, slug) 制約も同時に落ちる。
--
-- if exists でローカル DB（既に 0006 が正常適用済み）でも冪等。
-- ============================================================

alter table materials drop column if exists slug cascade;
