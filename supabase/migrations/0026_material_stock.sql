-- ============================================================
-- 資材の在庫数量管理
--
-- 0019 のコメントで「将来 spec_combo_stock 想定」と書かれていた件の最初の実装。
-- 組み合わせ別の保有数ではなく、まずは spec_option 単位（および仕様無し材料の
-- materials 単位）でマスタの保有数を持つ。残数は派生計算（order_items の
-- quantity - returned_quantity - lost_quantity から「貸出中」を引く）。
--
-- 複数 spec_group がある材料で「赤×M を 5」発注すると、赤と M の双方の在庫から
-- 5 ずつ引かれる。この割り切りは MVP の前提。
-- ============================================================

alter table materials
  add column if not exists stock_quantity int not null default 0
    check (stock_quantity >= 0);

alter table spec_options
  add column if not exists stock_quantity int not null default 0
    check (stock_quantity >= 0);
