-- ============================================================
-- 顧客の会員登録（self-registration）＋メール認証。
--
--   - customers.email_verified : メール認証済みか。admin 発行の既存顧客は
--                                 検証不要なのでデフォルト true。会員登録の顧客は
--                                 false で作成し、コード検証で true にする。
--   - customers.self_registered: 会員登録由来の顧客か（admin 発行と区別）。
--   - customer_email_verifications: 6桁コードのハッシュと有効期限を保持。
--
-- tenants/customers と同様に customer_email_verifications も RLS 有効・ポリシー無し
-- （登録/検証は未認証文脈で起きるため service_role 経由でのみ読み書きする）。
-- ============================================================

alter table customers
  add column email_verified boolean not null default true,
  add column self_registered boolean not null default false;

create table customer_email_verifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index idx_customer_email_verifications_customer
  on customer_email_verifications(customer_id);

alter table customer_email_verifications enable row level security;
-- ポリシーを意図的に作らない → service_role 経由のみ。
