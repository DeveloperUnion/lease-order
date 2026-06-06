-- ============================================================
-- テナント単位の顧客アクセス設定。
--
--   - customer_access_mode:
--       'guest_browse' (デフォルト) … カタログ入口は誰でも閲覧可。
--                                       発注・履歴・rentals はログイン必須。
--       'login'                      … 入口からログイン必須（従来の全ゲート挙動）。
--   - customer_self_registration:
--       顧客の会員登録（self-registration）導線を有効にするか。
--       false の間は /signup を無効化し、admin 発行アカウントのみ。
--
-- リース会社が管理コンソール（/admin/settings）から自分で切り替える。
-- 既存テナントは migration 後デフォルトで guest_browse（カタログ公開）になる。
-- 入口を塞ぎたいテナントは設定で 'login' に変更する。
-- ============================================================

alter table tenants
  add column customer_access_mode text not null default 'guest_browse'
    check (customer_access_mode in ('login', 'guest_browse')),
  add column customer_self_registration boolean not null default false;
