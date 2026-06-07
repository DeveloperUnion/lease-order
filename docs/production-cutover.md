# 本番 (production) Cutover Runbook

`main` への push で本番 Supabase に migration を適用し、本番を立ち上げるための手順書。
初回 cutover とテナント/管理者オンボーディングの両方をカバーする。

## 前提となる仕組み

- **migration CI**: `.github/workflows/migrate.yml`。`develop`→staging / `main`→prod に
  振り分けて `supabase db push` する。migration を push したら**自動適用**（main も自動）。
  `workflow_dispatch` で手動実行も可能（初回 cutover や再適用の保険）。
- **初期データは migration が seed する**。`0035_create_super_admins.sql` が初期 super-admin
  `admin@kensetsu-tech.com` を `on conflict do nothing` で投入。
  → product 側の `tenants` / `admin_users` は **super-admin コンソールから実行時に作る**ので
  事前投入は不要。
- **認証モデル**:
  - super-admin: マジックリンク（Supabase Auth `signInWithOtp`）。ホスト
    `super-admin.lease-order.kensetsu-tech.com`、callback `/super-admin/auth/callback`。
  - テナント admin: email + password（`signInWithPassword`）。super-admin コンソールが
    auth ユーザー＋ `admin_users` を作成し、初期パスワードを Resend で招待メール送信
    （`src/lib/mailer.ts`。未設定時は画面表示の temp パスワードを手動共有）。
- ドメイン定数（`src/lib/tenant.ts`）:
  - product: `lease-order.kensetsu-tech.com`（fallback slug = `union`）
  - staging: `<slug>.staging.lease-order.kensetsu-tech.com`
  - super-admin: 先頭ラベルが `super-admin` のホスト

---

## 1. GitHub リポジトリ Secrets

`migrate.yml` が参照する。未設定だと workflow は error で fail する（緑のまま素通りさせない）。

- [ ] `SUPABASE_ACCESS_TOKEN`（共通 / Supabase CLI のアクセストークン）
- [ ] `SUPABASE_PROJECT_REF_PRD`（本番プロジェクト ref）
- [ ] `SUPABASE_DB_PASSWORD_PRD`（本番 DB パスワード）
- [ ] `SUPABASE_PROJECT_REF_STG` / `SUPABASE_DB_PASSWORD_STG`（staging 分。未設定なら追加）

設定場所: GitHub → Settings → Secrets and variables → Actions → Repository secrets

---

## 2. Supabase 本番プロジェクト設定（ダッシュボード）

### JWT Keys（ES256）
per-request の tenant JWT 署名（`src/lib/supabase-jwt.ts`）に必須。

- [ ] API → JWT Keys で ES256 (P-256 ECDSA) 秘密鍵を **Standby Key として import** → **Current** に昇格
- [ ] PKCS#8 PEM を Vercel 本番 `SUPABASE_JWT_PRIVATE_KEY` に設定
- [ ] Current Key の ID を Vercel 本番 `SUPABASE_JWT_KID` に設定
- ⚠️ private key と kid は必ずペアで管理（ズレると Realtime だけ落ちる）

### Auth → URL Configuration
super-admin のマジックリンク redirect 許可に必要。

- [ ] Redirect URLs に `https://super-admin.lease-order.kensetsu-tech.com/super-admin/auth/callback` を追加
- [ ] Site URL を本番ドメインに設定

### Auth Email
super-admin ログイン＝Supabase Auth のメール送信が必須。

- [ ] 既定 SMTP のレート上限を確認（super-admin 1名なら可）。信頼性重視なら custom SMTP を設定

### Storage
- [ ] migration 0003 が作成するバケットが適用後に存在し、公開/ポリシー設定が想定通りか確認

---

## 3. Vercel 本番 env（Production スコープ）

### DB 側（本番プロジェクトを指す値。**Production スコープ必須**）
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `SUPABASE_JWT_PRIVATE_KEY`（上の JWT 鍵）
- [ ] `SUPABASE_JWT_KID`（上の kid）
- [ ] `CUSTOMER_SESSION_SECRET`（256bit ランダム値を生成して Vercel のみに設定。
      生成: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`。
      **値はこのファイルやコミットに絶対書かない**）
- ⚠️ 現状これらが **Preview のみ** になっているものがある → Production スコープを必ず追加すること

### Production / Preview 共通でよい（外部 API キー）
- [ ] `GEMINI_API_KEY`
- [ ] `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` / `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`
- [ ] `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET`（Slack App の redirect URI に本番ドメイン登録が前提）
- [ ] `RESEND_API_KEY` / `EMAIL_FROM`（招待・通知メール。検証済みドメイン推奨。未設定でも
      招待は best-effort で画面の temp パスワード手動共有にフォールバック）

### 要整理
- [ ] `REDIS_URL` を削除（コードは `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
      しか読まない。`@upstash/redis` 未 install のため現状 Redis は no-op）

---

## 4. Cutover 実行順

1. [ ] §1 GitHub Secrets（本番）登録
2. [ ] §2 Supabase 本番で JWT 鍵 import → §3 Vercel 本番 env を全て Production スコープで設定
3. [ ] §2 Supabase 本番 Auth の redirect URL / メール設定
4. [ ] `develop` → `main` を merge（PR）/ push
   - GitHub Actions が migration を自動適用（super_admin seed 込み）
   - Vercel は native git 連携で本番ビルド/デプロイ（Actions と並行。空 DB の間は一時的に
     エラーになり得るが migration 完了後に解消）
   - ※ もし自動で流れない場合は `migrate.yml` を Actions → Run workflow で `main` 指定して手動実行
5. [ ] `super-admin.lease-order.kensetsu-tech.com` にマジックリンクでログイン
6. [ ] コンソールでテナント作成 → テナント admin 招待

---

## 5. 検証

- [ ] `migrate.yml` 実行ログで 0001〜0036 が適用され成功
- [ ] 本番 `super_admins` に `admin@kensetsu-tech.com` が 1 行存在
- [ ] super-admin コンソールにマジックリンクでログインできる（Auth メール到達確認）
- [ ] コンソールでテナント 1 件作成 → そのサブドメインで product トップが
      `tenant not found` を出さず表示される
- [ ] テナント admin 招待 → 招待メール（または画面 temp パスワード）で `<slug>/admin` に
      password ログインできる
