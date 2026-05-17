-- ============================================================
-- 資材の「仕様選択」機能
--
-- 1 つの資材に複数の「仕様グループ（軸）」を持たせ、各グループに
-- 任意個の「選択肢」を持つ。仕様の組み合わせは material_variants
-- （= 在庫 SKU）に紐付けて管理する。
--
-- 例:
--   spec_groups:  格納タイプ (multi, 必須) / シフトレバー (single, 任意)
--   spec_options: 前方, 後方 / マニュアル, オートマ
--   material_variant_options: variantA = {格納タイプ:前方, シフトレバー:MT}
--
-- 顧客側は modal で軸を選択 → 該当 variant を解決 → cart に積み、
-- 複数選択軸は option ごとに別 order_item として展開する。
-- ============================================================

-- ------------------------------------------------------------
-- 仕様グループ（軸）
-- ------------------------------------------------------------
create table spec_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  material_id uuid not null references materials(id) on delete cascade,
  name text not null,
  description text,
  selection_type text not null check (selection_type in ('single','multi')),
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
-- 選択肢
-- ------------------------------------------------------------
create table spec_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  spec_group_id uuid not null references spec_groups(id) on delete cascade,
  label text not null,
  short_code text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (spec_group_id, label),
  -- material_variant_options からの複合 FK 用
  unique (spec_group_id, id)
);
create index spec_options_tenant_idx on spec_options (tenant_id);
create index spec_options_group_sort_idx on spec_options (spec_group_id, sort_order);

-- ------------------------------------------------------------
-- variant ↔ spec_option の紐付け（軸ごとに 1 option）
-- ------------------------------------------------------------
create table material_variant_options (
  variant_id uuid not null references material_variants(id) on delete cascade,
  spec_group_id uuid not null references spec_groups(id) on delete restrict,
  spec_option_id uuid not null references spec_options(id) on delete restrict,
  tenant_id uuid not null references tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (variant_id, spec_group_id),
  -- option が宣言した group に属することを強制
  foreign key (spec_group_id, spec_option_id)
    references spec_options (spec_group_id, id)
);
create index material_variant_options_option_idx on material_variant_options (spec_option_id);
create index material_variant_options_tenant_idx on material_variant_options (tenant_id);
create index material_variant_options_variant_idx on material_variant_options (variant_id);

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

alter table material_variant_options enable row level security;
create policy "tenant_isolation_select" on material_variant_options for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on material_variant_options for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on material_variant_options for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on material_variant_options for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
