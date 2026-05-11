-- ============================================================
-- 返却・延長を「申請 → 承認」ワークフローに変更
-- + アプリ内通知用 notifications テーブル
--
-- 顧客が申請しただけでは order_items は変わらず、管理者が
-- 「受領」した時点で order_items.returned_quantity / lease_end_date を反映する。
--
-- 前提:
--   0009 で lease_extensions に tenant_id が NOT NULL で追加済み。
--   0010 で全テナントスコープテーブルに tenant_isolation RLS が定義済み。
-- ============================================================

-- (1) lease_extensions: pending / acknowledged / rejected の状態を持たせる
do $migrate$
declare
  status_was_added boolean := false;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lease_extensions'
      and column_name = 'status'
  ) then
    alter table lease_extensions
      add column status text not null default 'pending'
        check (status in ('pending', 'acknowledged', 'rejected'));
    status_was_added := true;
  end if;

  alter table lease_extensions
    add column if not exists acknowledged_at timestamptz,
    add column if not exists acknowledged_by_admin_id uuid references admin_users(id),
    add column if not exists rejected_at timestamptz,
    add column if not exists reject_reason text;

  -- 既存運用は「申請＝即承認」だったため、初回マイグレーション時のみ
  -- 既存行をすべて acknowledged で埋める（過去データの互換維持）。
  if status_was_added then
    update lease_extensions
      set status = 'acknowledged',
          acknowledged_at = requested_at
      where status = 'pending';
  end if;
end
$migrate$;

create index if not exists idx_lease_extensions_status
  on lease_extensions(status) where status = 'pending';

-- (2) return_requests: 返却申請履歴（lease_extensions と対称な構造）
create table if not exists return_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  order_item_id uuid not null references order_items(id) on delete cascade,
  requested_quantity_delta int not null check (requested_quantity_delta > 0),
  status text not null default 'pending'
    check (status in ('pending', 'acknowledged', 'rejected')),
  reason text,
  reject_reason text,
  requested_by_customer_id uuid references customers(id),
  requested_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by_admin_id uuid references admin_users(id),
  rejected_at timestamptz
);
create index if not exists idx_return_requests_tenant on return_requests(tenant_id);
create index if not exists idx_return_requests_order_item on return_requests(order_item_id);
create index if not exists idx_return_requests_pending
  on return_requests(status) where status = 'pending';

alter table return_requests enable row level security;

create policy "tenant_isolation_select" on return_requests for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on return_requests for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on return_requests for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on return_requests for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

-- (3) notifications: アプリ内通知
--   recipient_id は admin_users.id または customers.id（多態関連、整合性はアプリ側で担保）
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  recipient_type text not null check (recipient_type in ('admin', 'customer')),
  recipient_id uuid not null,
  kind text not null,
  order_id uuid references orders(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_recipient
  on notifications(tenant_id, recipient_type, recipient_id, created_at desc);
create index if not exists idx_notifications_unread
  on notifications(tenant_id, recipient_type, recipient_id)
  where read_at is null;

alter table notifications enable row level security;

create policy "tenant_isolation_select" on notifications for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on notifications for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on notifications for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on notifications for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
