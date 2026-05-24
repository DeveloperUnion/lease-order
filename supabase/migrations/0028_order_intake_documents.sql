-- ============================================================
-- 紙/FAX/PDF 発注書を AI で読み取り、発注ドラフトを生成するための
-- 取り込みドキュメント（intake）と監査保存を追加。
--
--   1. order_intake_documents テーブル
--        アップロードされた発注書 1 ファイル = 1 行。
--        AI 抽出の raw 結果（ai_inference）と監査メタを保存する。
--   2. orders.intake_document_id を追加し、最終的に発注に変換された
--      ドキュメントを発注側から辿れるようにする。
--   3. order-intake-documents Storage bucket（private）を作成し、
--      tenant_id をパス先頭にした自動分離 RLS を付与。
-- ============================================================

-- (1) Enum 群
do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_intake_source') then
    create type order_intake_source as enum ('customer_self', 'admin_proxy');
  end if;
  if not exists (select 1 from pg_type where typname = 'order_intake_status') then
    create type order_intake_status as enum (
      'uploaded',    -- ファイルだけ届いた状態
      'extracting',  -- AI 呼び出し中
      'extracted',   -- 抽出完了、編集待ち
      'failed',      -- AI 失敗。ai_error に詳細
      'consumed'     -- 発注に変換済み（orders 行が出来た）
    );
  end if;
end$$;

-- (2) order_intake_documents
create table if not exists order_intake_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source order_intake_source not null,
  customer_id uuid references customers(id) on delete set null,
  uploaded_by_admin_id uuid references admin_users(id),
  uploaded_by_customer_id uuid references customers(id),
  storage_path text not null,
  mime_type text not null,
  status order_intake_status not null default 'uploaded',
  ai_model text,
  ai_invoked_at timestamptz,
  ai_inference jsonb,
  ai_error text,
  consumed_order_id uuid references orders(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_oid_tenant_status on order_intake_documents(tenant_id, status);
create index if not exists idx_oid_customer on order_intake_documents(customer_id);

alter table order_intake_documents enable row level security;

create policy "tenant_isolation_select" on order_intake_documents for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on order_intake_documents for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on order_intake_documents for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on order_intake_documents for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

-- (3) orders に取り込み元への参照を追加
alter table orders
  add column if not exists intake_document_id uuid
    references order_intake_documents(id) on delete set null;
create index if not exists idx_orders_intake_document on orders(intake_document_id);

-- (4) Storage bucket（private）
insert into storage.buckets (id, name, public)
values ('order-intake-documents', 'order-intake-documents', false)
on conflict (id) do nothing;

-- Storage RLS：パス先頭が tenant_id であることを要求して tenant 分離。
-- 実際の upload/read はアプリの supabaseAdmin（service_role）が行うが、
-- authenticated 経由の誤操作を防ぐため policy を貼っておく。
create policy "order_intake_documents_tenant_select" on storage.objects for select
  to authenticated
  using (
    bucket_id = 'order-intake-documents'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );

create policy "order_intake_documents_tenant_insert" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'order-intake-documents'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );

create policy "order_intake_documents_tenant_update" on storage.objects for update
  to authenticated
  using (
    bucket_id = 'order-intake-documents'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );

create policy "order_intake_documents_tenant_delete" on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'order-intake-documents'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );
