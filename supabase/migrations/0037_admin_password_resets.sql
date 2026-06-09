-- ============================================================
-- 管理者(admin)のセルフサービス パスワード再設定トークン。
-- /admin/forgot-password でメール送信 → リンクの token で /admin/reset-password。
--
--   - token_hash : raw トークンは保存せず SHA-256 ハッシュのみ保存する
--                  （DB 漏洩時に元トークンを復元させない）。
--   - expires_at : 有効期限（アプリ側で既定 60 分）。
--   - used_at    : 単回使用フラグ。消費時に条件付き UPDATE で立てて二重消費を防ぐ。
--
-- admin_users と同 posture：RLS 有効・ポリシー無し＝service_role(supabaseAdmin)
-- でのみ発行/検証/消費する。publishable key では読めない。
-- ============================================================

create table admin_password_resets (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references admin_users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_admin_password_resets_token on admin_password_resets(token_hash);
create index idx_admin_password_resets_admin on admin_password_resets(admin_user_id);

alter table admin_password_resets enable row level security;
-- anon ポリシー無し → publishable key では読めない。
