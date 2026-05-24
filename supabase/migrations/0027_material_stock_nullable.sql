-- ============================================================
-- 在庫数量カラムを nullable に変更
--
-- 0026 で stock_quantity を default 0 / not null で導入したが、これでは
--   「管理者がまだ在庫を設定していない（未設定）」
--   「実在庫が 0（在庫切れ）」
-- を区別できず、未設定の資材まで「残 0 / 在庫切れ」表示になってしまう。
--
-- 区別できるよう nullable に変更し、default も外す。
-- 0026 直後の運用前提なので、現存する 0 はすべて「未設定」とみなし null に
-- 戻す。0026 適用後すぐに 0027 を当てない場合（管理者が既に 0 を入力済の
-- ケース）は、この backfill がユーザー入力を上書きする点に注意。
-- ============================================================

alter table materials alter column stock_quantity drop default;
alter table materials alter column stock_quantity drop not null;
update materials set stock_quantity = null where stock_quantity = 0;

alter table spec_options alter column stock_quantity drop default;
alter table spec_options alter column stock_quantity drop not null;
update spec_options set stock_quantity = null where stock_quantity = 0;
