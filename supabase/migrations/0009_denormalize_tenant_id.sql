-- ============================================================
-- Junction / child tables に tenant_id を非正規化し、
-- RLS で直接テナント分離できるようにする。
--
-- 対象: material_variants, material_images, order_items, lease_extensions
-- 親テーブルから backfill → NOT NULL → FK → index の順。
-- ============================================================

-- ------------------------------------------------------------
-- material_variants
-- ------------------------------------------------------------
alter table material_variants add column if not exists tenant_id uuid;

update material_variants mv
  set tenant_id = m.tenant_id
  from materials m
  where mv.material_id = m.id
    and mv.tenant_id is null;

-- 親が見つからない孤児を検知（あれば NOT NULL 化で失敗するため事前に確認）
do $$
declare orphan_count int;
begin
  select count(*) into orphan_count from material_variants where tenant_id is null;
  if orphan_count > 0 then
    raise exception 'material_variants: % rows have no parent material (tenant_id backfill failed)', orphan_count;
  end if;
end $$;

alter table material_variants alter column tenant_id set not null;
alter table material_variants
  add constraint material_variants_tenant_id_fkey
    foreign key (tenant_id) references tenants(id);
create index if not exists idx_material_variants_tenant on material_variants(tenant_id);

-- ------------------------------------------------------------
-- material_images
-- ------------------------------------------------------------
alter table material_images add column if not exists tenant_id uuid;

update material_images mi
  set tenant_id = m.tenant_id
  from materials m
  where mi.material_id = m.id
    and mi.tenant_id is null;

do $$
declare orphan_count int;
begin
  select count(*) into orphan_count from material_images where tenant_id is null;
  if orphan_count > 0 then
    raise exception 'material_images: % rows have no parent material', orphan_count;
  end if;
end $$;

alter table material_images alter column tenant_id set not null;
alter table material_images
  add constraint material_images_tenant_id_fkey
    foreign key (tenant_id) references tenants(id);
create index if not exists idx_material_images_tenant on material_images(tenant_id);

-- ------------------------------------------------------------
-- order_items
-- ------------------------------------------------------------
alter table order_items add column if not exists tenant_id uuid;

update order_items oi
  set tenant_id = o.tenant_id
  from orders o
  where oi.order_id = o.id
    and oi.tenant_id is null;

do $$
declare orphan_count int;
begin
  select count(*) into orphan_count from order_items where tenant_id is null;
  if orphan_count > 0 then
    raise exception 'order_items: % rows have no parent order', orphan_count;
  end if;
end $$;

alter table order_items alter column tenant_id set not null;
alter table order_items
  add constraint order_items_tenant_id_fkey
    foreign key (tenant_id) references tenants(id);
create index if not exists idx_order_items_tenant on order_items(tenant_id);

-- ------------------------------------------------------------
-- lease_extensions
-- ------------------------------------------------------------
alter table lease_extensions add column if not exists tenant_id uuid;

update lease_extensions le
  set tenant_id = o.tenant_id
  from order_items oi
  join orders o on o.id = oi.order_id
  where le.order_item_id = oi.id
    and le.tenant_id is null;

do $$
declare orphan_count int;
begin
  select count(*) into orphan_count from lease_extensions where tenant_id is null;
  if orphan_count > 0 then
    raise exception 'lease_extensions: % rows have no parent order_item', orphan_count;
  end if;
end $$;

alter table lease_extensions alter column tenant_id set not null;
alter table lease_extensions
  add constraint lease_extensions_tenant_id_fkey
    foreign key (tenant_id) references tenants(id);
create index if not exists idx_lease_extensions_tenant on lease_extensions(tenant_id);
