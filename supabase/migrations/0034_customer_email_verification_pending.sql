-- ============================================================
-- 顧客の「通知メール」登録／変更時のメール認証で、検証中（pending）の
-- メールアドレスを保持する列を追加する。
--
-- フロー:
--   1. 顧客が /account でメールを入力 → customer_email_verifications に
--      pending email + code_hash を保存し、コードを送信。
--   2. コード一致で customers.contact_email = pending email,
--      email_verified = true に確定。
-- これにより contact_email には常に「検証済みアドレス」だけが入る。
-- （会員登録 self-registration は廃止。customer_email_verifications は本用途に転用）
-- ============================================================

alter table customer_email_verifications
  add column email text;
