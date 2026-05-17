-- ============================================================
-- 資材の「仕様選択」機能
--
-- 1 つの資材に複数の「仕様（spec_groups）」を持たせ、各仕様に任意個の
-- 「バリエーション（spec_options）」を持つ。顧客は仕様ごとにラジオで 1
-- option を選び、modal 全体に 1 つの数量を入れる。1 注文明細 = 1 組み合わせ
-- × 数量。
--
-- 例:
--   仕様: 色 → バリエーション: 赤 / 青 / 黄
--   仕様: サイズ → バリエーション: S / M
--
-- 選ばれた仕様は order_item_spec_options に多対多で記録（snapshot 込み）。
-- 在庫数管理はスコープ外。将来「赤×前方=5個」のような組み合わせ別在庫が
-- 必要になったら spec_combo_stock のようなテーブルを別途追加する想定。
--
-- 注意:
--   このプロジェクトの一部 DB（staging 等）には旧 0016 の v1 スキーマ
--   （material_variants / material_variant_options、spec_groups の
--   selection_type カラム等）が残っている可能性がある。冪等に v3 形へ
--   持っていくため、冒頭で旧構造を drop してから create する。
-- ============================================================

-- ------------------------------------------------------------
-- 0. 旧 v1 構造のクリーンアップ（残っていれば drop / 無ければ no-op）
-- ------------------------------------------------------------
drop table if exists material_variant_options;
drop table if exists material_variants;
drop table if exists order_item_spec_options;
drop table if exists spec_options;
drop table if exists spec_groups;
alter table order_items drop column if exists variant_id;
alter table order_items drop column if exists variant_name;

-- ------------------------------------------------------------
-- 仕様
-- ------------------------------------------------------------
create table spec_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  material_id uuid not null references materials(id) on delete cascade,
  name text not null,
  is_required boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (material_id, name)
);
create index spec_groups_tenant_idx on spec_groups (tenant_id);
create index spec_groups_material_sort_idx on spec_groups (material_id, sort_order);

-- ------------------------------------------------------------
-- バリエーション
-- ------------------------------------------------------------
create table spec_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  spec_group_id uuid not null references spec_groups(id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (spec_group_id, label),
  -- order_item_spec_options からの複合 FK 用
  unique (spec_group_id, id)
);
create index spec_options_tenant_idx on spec_options (tenant_id);
create index spec_options_group_sort_idx on spec_options (spec_group_id, sort_order);

-- ------------------------------------------------------------
-- order_item ↔ spec_option の多対多紐付け
-- ------------------------------------------------------------
create table order_item_spec_options (
  order_item_id uuid not null references order_items(id) on delete cascade,
  spec_group_id uuid not null references spec_groups(id) on delete restrict,
  spec_option_id uuid not null references spec_options(id) on delete restrict,
  tenant_id uuid not null references tenants(id) on delete cascade,
  -- 表示用 snapshot（option を後で改名/削除しても発注履歴が残る）
  group_name_snapshot text not null,
  option_label_snapshot text not null,
  created_at timestamptz not null default now(),
  primary key (order_item_id, spec_group_id),
  foreign key (spec_group_id, spec_option_id)
    references spec_options(spec_group_id, id)
);
create index order_item_spec_options_tenant_idx on order_item_spec_options (tenant_id);
create index order_item_spec_options_option_idx on order_item_spec_options (spec_option_id);

-- ------------------------------------------------------------
-- RLS（0010 と同パターン: tenant_id = jwt.tenant_id）
-- ------------------------------------------------------------
alter table spec_groups enable row level security;
create policy "tenant_isolation_select" on spec_groups for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on spec_groups for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on spec_groups for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on spec_groups for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

alter table spec_options enable row level security;
create policy "tenant_isolation_select" on spec_options for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on spec_options for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on spec_options for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on spec_options for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

alter table order_item_spec_options enable row level security;
create policy "tenant_isolation_select" on order_item_spec_options for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on order_item_spec_options for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on order_item_spec_options for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on order_item_spec_options for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
