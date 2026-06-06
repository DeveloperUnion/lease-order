-- ============================================================
-- Super-admin（運営者）allowlist
-- ここに 1 行あるメールは super-admin.lease-order... コンソールに
-- マジックリンクでサインインでき、全テナントを横断管理できる。
-- admin_users と違い tenant_id を持たない（=グローバル）。
-- auth.users 行は初回サインイン時に Supabase Auth が遅延作成する。
-- このテーブルはあくまでゲート。
-- ============================================================

create table super_admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table super_admins enable row level security;
-- anon ポリシー無し → publishable key では読めない。
-- super-admin コンソールは tenant JWT を一切発行せず、service_role
-- (supabaseAdmin) でのみこのテーブルを参照する（admin_users と同 posture）。

-- 初期 super-admin（運営者）。再実行しても安全なよう on conflict do nothing。
insert into super_admins (email) values ('admin@kensetsu-tech.com')
on conflict (email) do nothing;
