-- ============================================================
-- 管理者認証をマジックリンク → email+password に移行する準備。
--
-- これまで admin_users は「メール allowlist」で、auth.users 行はマジック
-- リンク初回ログイン時に遅延作成されていた。パスワード認証では作成時に
-- 明示的に auth.users を作る必要があるため、その id を保持する。
--
--   - auth_user_id        : 対応する Supabase Auth (auth.users) の id。
--                           リセット（updateUserById）・削除（deleteUser）で使う。
--                           既存行（マジックリンク時代）は NULL のままになり得るので
--                           nullable。アプリ側は addAdminUser でこれを埋める。
--   - must_change_password: 初回発行/リセットした temp パスワードを初回ログイン後に
--                           変更させるフラグ（顧客 customers.must_change_password と対称）。
--
-- 既存の管理者（マジックリンクで運用していた行）は、本移行後にパスワードが
-- 未設定のためログインできない。各テナント管理者がパスワードリセットで
-- 初期パスワードを発行し直す運用とする（オンボーディング Runbook 参照）。
-- ============================================================

alter table admin_users
  add column auth_user_id uuid,
  add column must_change_password boolean not null default true;
