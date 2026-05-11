-- ============================================================
-- RLS テナント分離検証スクリプト
--
-- 使い方:
--   psql "$DATABASE_URL" -f scripts/verify-rls-isolation.sql
--
-- もしくは Supabase Studio → SQL Editor に貼り付け。
--
-- 期待値: 全クエリで `cross_tenant_visible = 0` が出ること。
-- 1 行でも > 0 が出たら RLS ポリシーが緩いので即対応。
--
-- 仕組み:
--   PostgREST のリクエストを模擬するために authenticated role + JWT claim 偽装。
--   `set request.jwt.claims to ...` は PostgREST が GUC に設定する値と同じ。
--   `auth.jwt()` 関数はこの GUC を読む。
-- ============================================================

\set tenant_union '00000000-0000-0000-0000-000000000001'
\set tenant_sanshin '00000000-0000-0000-0000-000000000002'

-- ------------------------------------------------------------
-- Tenant A (union) として認証した状態で、Tenant B (sanshin) の
-- データを見ようとする → 全テーブルで 0 行が返るはず
-- ------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","aud":"authenticated","tenant_id":"00000000-0000-0000-0000-000000000001"}';

select 'categories' as table_name,
       count(*) as cross_tenant_visible
  from categories where tenant_id = '00000000-0000-0000-0000-000000000002'
union all select 'materials',
       count(*) from materials where tenant_id = '00000000-0000-0000-0000-000000000002'
union all select 'material_variants',
       count(*) from material_variants where tenant_id = '00000000-0000-0000-0000-000000000002'
union all select 'material_images',
       count(*) from material_images where tenant_id = '00000000-0000-0000-0000-000000000002'
union all select 'images',
       count(*) from images where tenant_id = '00000000-0000-0000-0000-000000000002'
union all select 'offices',
       count(*) from offices where tenant_id = '00000000-0000-0000-0000-000000000002'
union all select 'orders',
       count(*) from orders where tenant_id = '00000000-0000-0000-0000-000000000002'
union all select 'order_items',
       count(*) from order_items where tenant_id = '00000000-0000-0000-0000-000000000002'
union all select 'email_logs',
       count(*) from email_logs where tenant_id = '00000000-0000-0000-0000-000000000002'
union all select 'audit_logs',
       count(*) from audit_logs where tenant_id = '00000000-0000-0000-0000-000000000002'
union all select 'admin_users',
       count(*) from admin_users where tenant_id = '00000000-0000-0000-0000-000000000002'
union all select 'customers',
       count(*) from customers where tenant_id = '00000000-0000-0000-0000-000000000002'
union all select 'lease_extensions',
       count(*) from lease_extensions where tenant_id = '00000000-0000-0000-0000-000000000002'
union all select 'tenants (no policy → all 0)',
       count(*) from tenants;
commit;

-- ------------------------------------------------------------
-- 同じ JWT で自テナント (union) のデータは見える → > 0 が期待
-- （seed されていれば）
-- ------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","aud":"authenticated","tenant_id":"00000000-0000-0000-0000-000000000001"}';

select 'sanity: own tenant categories' as check, count(*) as visible from categories
union all select 'sanity: own tenant materials', count(*) from materials
union all select 'sanity: own tenant offices', count(*) from offices;
commit;

-- ------------------------------------------------------------
-- INSERT WITH CHECK: 別テナントの tenant_id を埋めて INSERT しようとすると
-- 弾かれる（RLS 違反で error）
-- ------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","aud":"authenticated","tenant_id":"00000000-0000-0000-0000-000000000001"}';

-- これは ERROR になるべき（catch して報告）
do $$
begin
  insert into categories (tenant_id, name, slug, sort_order)
  values ('00000000-0000-0000-0000-000000000002', 'forbidden', 'forbidden', 0);
  raise notice 'FAIL: cross-tenant insert was allowed (RLS WITH CHECK is missing)';
exception when others then
  raise notice 'OK: cross-tenant insert was blocked (% / %)', sqlstate, sqlerrm;
end $$;
rollback;
