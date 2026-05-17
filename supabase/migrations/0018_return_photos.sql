-- ============================================================
-- 受領検品に写真 + AI 自動読み取りを追加
--
--  1. return_photos テーブル：1 受領 (return_request) : N 写真
--  2. return_requests に AI 推定の audit カラムを追加
--  3. return-photos Storage bucket（private）を作成し、
--     tenant_id をパス先頭にした自動分離 RLS を付与
-- ============================================================

-- (1) return_photos テーブル
create table if not exists return_photos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  return_request_id uuid not null references return_requests(id) on delete cascade,
  storage_path text not null,
  sort_order int not null default 0,
  uploaded_at timestamptz not null default now(),
  uploaded_by_admin_id uuid references admin_users(id)
);
create index if not exists idx_return_photos_request on return_photos(return_request_id);
create index if not exists idx_return_photos_tenant on return_photos(tenant_id);

alter table return_photos enable row level security;

create policy "tenant_isolation_select" on return_photos for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on return_photos for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on return_photos for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on return_photos for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

-- (2) return_requests に AI 推定情報の audit カラムを追加
alter table return_requests
  add column if not exists ai_inference jsonb,
  add column if not exists ai_model text,
  add column if not exists ai_invoked_at timestamptz;

-- (3) Storage bucket（private）
insert into storage.buckets (id, name, public)
values ('return-photos', 'return-photos', false)
on conflict (id) do nothing;

-- Storage RLS：パス先頭が tenant_id であることを要求して tenant 分離。
-- アプリ側からのアップロード／読み込みは supabaseAdmin（service_role）で
-- 行うので service_role は RLS をバイパスする。authenticated 経由で誤って
-- 他テナントのオブジェクトを触れないように policy を貼っておく。
create policy "return_photos_tenant_select" on storage.objects for select
  to authenticated
  using (
    bucket_id = 'return-photos'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );

create policy "return_photos_tenant_insert" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'return-photos'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );

create policy "return_photos_tenant_update" on storage.objects for update
  to authenticated
  using (
    bucket_id = 'return-photos'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );

create policy "return_photos_tenant_delete" on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'return-photos'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );
