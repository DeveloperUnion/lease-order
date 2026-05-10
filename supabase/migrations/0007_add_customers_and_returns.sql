-- ============================================================
-- 借り主アカウント + 現場 + 部分返却 + 延長履歴
-- 1 会社 1 アカウント（パスワード共有運用）。管理側が手動発行。
-- 返却・延長は資材（order_items）単位。
-- ============================================================

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  company_id text not null,                              -- "C-2026-001" 形式の人間可読 ID
  name text not null,                                    -- 会社名
  password_hash text not null,                           -- bcrypt
  phone text,
  default_address text,                                  -- 配送先プリフィル用
  contact_email text,
  is_active boolean not null default true,
  must_change_password boolean not null default true,    -- Phase 2 hook
  created_at timestamptz not null default now(),
  unique (tenant_id, company_id)
);
create index if not exists idx_customers_tenant on customers(tenant_id);
create index if not exists idx_customers_active on customers(is_active) where is_active = true;

alter table orders
  add column if not exists customer_id uuid references customers(id),  -- nullable: Phase 2 飛び込み再開用
  add column if not exists site_name text;
create index if not exists idx_orders_customer on orders(customer_id);
create index if not exists idx_orders_site on orders(tenant_id, site_name);

alter table order_items
  add column if not exists returned_quantity int not null default 0,
  add column if not exists lease_end_date date;          -- 資材単位の返却期限。発注時 orders.lease_end_date を複製
alter table order_items
  drop constraint if exists order_items_returned_qty_check;
alter table order_items
  add constraint order_items_returned_qty_check
    check (returned_quantity >= 0 and returned_quantity <= quantity);

-- 既存 order_items に lease_end_date を補完（migration 適用時の既存レコード救済）
update order_items oi
  set lease_end_date = o.lease_end_date
  from orders o
  where oi.order_id = o.id and oi.lease_end_date is null;

create table if not exists lease_extensions (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  previous_end_date date not null,
  new_end_date date not null,
  reason text,
  requested_by_customer_id uuid references customers(id),
  requested_at timestamptz not null default now()
);
create index if not exists idx_lease_extensions_order_item on lease_extensions(order_item_id);

-- RLS: admin_users (0005) と同様 enable のみ。anon ポリシー無し → service_role でのみアクセス。
alter table customers enable row level security;
alter table lease_extensions enable row level security;
