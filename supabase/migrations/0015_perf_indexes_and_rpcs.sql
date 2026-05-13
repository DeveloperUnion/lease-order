-- Performance: composite indexes and overdue-count RPC
--
-- 既存の単一カラム index ((tenant_id) / (status)) では admin / 顧客 layout で多用される
-- (tenant_id, status) や (tenant_id, customer_id, status) の絞り込みで効きにくいため、
-- 複合 index を追加する。pending な return_requests / lease_extensions は部分 index で軽量に。
--
-- countOverdueForCustomer はアプリ側で orders + order_items を全件メモリロードしていたが、
-- (quantity - returned_quantity) > 0 のような算術述語は PostgREST で直接表現できないため
-- RPC として SQL で完結させる。

-- ============================================================
-- 複合インデックス
-- ============================================================

create index if not exists idx_orders_tenant_status
  on orders (tenant_id, status);

create index if not exists idx_orders_tenant_customer_status
  on orders (tenant_id, customer_id, status);

-- 返却・延長の pending 申請を一気に拾う用途。WHERE 句で絞った partial index は軽い。
create index if not exists idx_return_requests_pending_item
  on return_requests (order_item_id)
  where status = 'pending';

create index if not exists idx_lease_extensions_pending_item
  on lease_extensions (order_item_id)
  where status = 'pending';

-- 通知の unread 集計用。read_at IS NULL の部分 index。
create index if not exists idx_notifications_recipient_unread
  on notifications (recipient_id)
  where read_at is null;

-- overdue 計算で lease_end_date によるレンジクエリが走るため tenant スコープと組み合わせて index。
create index if not exists idx_order_items_tenant_lease_end
  on order_items (tenant_id, lease_end_date)
  where lease_end_date is not null;

-- ============================================================
-- RPC: 顧客の overdue な order_item 数を 1 query で数える
-- ============================================================
--
-- 引数:
--   p_customer  対象顧客の uuid
--   p_tenant    テナントの uuid (アプリ側で session から渡す)
--
-- 戻り値:
--   返却完了していない (quantity - returned_quantity > 0) かつ lease_end_date が
--   today (UTC) より過去で、かつ status が cancelled/completed/rejected でない
--   order_item の総数。
--
-- SECURITY: 呼び出し元は service_role を想定しているが、authenticated にも GRANT
-- することで RLS 経由でも呼べるようにしておく (将来 client から直接叩く場合の備え)。

create or replace function public.count_overdue_for_customer(
  p_customer uuid,
  p_tenant uuid
) returns integer
language sql
stable
as $$
  select count(*)::int
  from order_items oi
  join orders o on o.id = oi.order_id
  where oi.tenant_id = p_tenant
    and o.customer_id = p_customer
    and o.status not in ('cancelled', 'completed', 'rejected')
    and oi.lease_end_date is not null
    and oi.lease_end_date < current_date
    and (oi.quantity - oi.returned_quantity) > 0;
$$;

grant execute on function public.count_overdue_for_customer(uuid, uuid)
  to authenticated, anon, service_role;
