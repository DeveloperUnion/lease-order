-- カテゴリ画像は UI から全廃したため、DB カラムを削除する。
-- 既存の Supabase Storage オブジェクト (`materials` バケット内
-- `{tenantId}/categories/...`) は本 migration では削除しない。
-- 必要に応じて運用者が Supabase Studio から手動削除すること。

alter table categories drop column if exists image_url;
