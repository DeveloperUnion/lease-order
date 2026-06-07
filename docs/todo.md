# TODO

## アーキテクチャ決定事項

### 管理画面と発注画面の分離方針

- **パス分離 + 認証**方式を採用
  - `/admin` 以下 → 管理画面（Supabase Auth で認証保護）
  - `/` 以下 → 発注画面（ログイン不要）
- テナント展開時は**サブドメイン**でテナントを識別
  - 例: `sanshin.example.com/` → 三信の発注画面
  - 例: `sanshin.example.com/admin` → 三信の管理画面
- サブドメインで管理/発注を分けるのではなく、サブドメインはテナント識別に使う
- 1つの Next.js アプリ + 1つの Supabase DB で運用

### 画像管理

- Supabase Storage を使用（バケット: `materials`）
- パス構成: `{tenant_id}/{material_id}/{timestamp}.{ext}`
- テナントごとにパスで分離（バケットは1つ）

### ブランチ・環境戦略

- `develop` → staging（Vercel Preview + staging Supabase）
- `main` → production（Vercel Production + prod Supabase）
- ローカル開発は staging DB を共用
- GitHub Actions で `supabase/migrations/**` 変更時にマイグレーション自動実行

---

## タスク一覧

### インフラ・環境

- [ ] prod 用 Supabase プロジェクト作成・GitHub Secrets 登録（`SUPABASE_PROJECT_REF_PRD` / `SUPABASE_DB_PASSWORD_PRD`）
- [ ] Vercel 環境変数の設定（Preview → staging DB / Production → prod DB）

### 画像

- [ ] 既存画像（public/images/ 198ファイル）を Supabase Storage に一括移行スクリプト作成・実行
- [ ] DB の images / material_images テーブルを Storage URL に更新
- [ ] 移行完了後 public/images/ を git から削除

### 認証・テナント

- [x] テナント解決を ENV 駆動に（`TENANT_SLUG` → `tenants.slug` → UUID。`src/lib/tenant.ts`）
- [x] seed.sql に 2 tenant 投入（`union` = デモ汎用 / `sanshin` = 三信産業）
- [x] カテゴリ CRUD 管理画面（`/admin/categories`）
- [x] 管理画面（/admin）に Supabase Auth マジックリンク認証を追加（`src/proxy.ts` で保護 + `admin_users` 許可リスト）
- [ ] Supabase ダッシュボードで Email プロバイダ有効化 + Site URL / Redirect URL 設定（staging / prod）
- [x] テナント別サブドメインルーティングの実装（`src/lib/tenant.ts` で Host から `<slug>.lease-order.kensetsu-tech.com` パターンで動的抽出 → tenant_id 解決。`TENANT_SLUG` env var は override として継続）

### 機能実装（管理画面リワーク 2026-05）

- [x] 管理画面レイアウト: 左サイドバー化（Route Groups で public / admin 分離）
- [x] ダッシュボード再構成（統計カード + 直近発注リスト）
- [x] 営業所マスタ CRUD（`/admin/offices`）
- [x] 資材詳細ページ（`/admin/materials/[id]`）+ バリエーション インライン編集 + 画像 5 枚 drag&drop
- [x] `materials.slug` 廃止 + `material_variants.unit` 追加（migration 0006）
- [x] 発注カンバン（PC: ドラッグでステータス変更 / モバイル: フェーズタブ / 一覧トグル）
- [x] 発注: 承認/却下/出荷/完了/キャンセル + 数量修正 + 却下理由
- [x] メール送信基盤（Resend）+ テンプレ + 自動送信フック（受付/承認/却下/出荷/管理者向け新規受付）
- [x] メール送信ログ記録（`email_logs`、`RESEND_API_KEY` 未設定環境では `skipped` で記録）
- [x] 管理ユーザー（`admin_users`）の招待リスト管理（`/admin/users`）

---

## Phase 4 — 業務効率化（未着手）

発注の検索・絞り込み・出力・統計を強化する。

- [ ] 発注一覧の検索（顧客名・発注番号での絞り込み）
- [ ] 発注一覧の期間絞り込み（受付日 from / to）
- [ ] 発注 CSV エクスポート（経理連携用、選択された発注 or 期間内全件）
- [ ] 発注詳細の PDF 出力 / 印刷ビュー
- [ ] ダッシュボード統計の拡張
  - [ ] 月別発注件数の折れ線
  - [ ] 品目別ランキング（数量ベース / 期間指定）
  - [ ] ステータス分布のグラフ
- [ ] 通知履歴画面（`/admin/notifications`）— `email_logs` 一覧 + 失敗の再送ボタン

## Phase 5 — 監査・ハードニング（未着手）

- [ ] `audit_logs` 記録（資材 / カテゴリ / 営業所 / 発注のマスタ更新時）
- [ ] 監査ログ閲覧画面（`/admin/audit`）
- [ ] 削除/非公開時の影響確認 UI（既発注からの参照チェックを事前に表示）
- [ ] ロールベースの操作制限（管理ユーザー間で権限差を付ける場合）

## Phase 6 候補（保留中・別ブランチ進行中含む）

- [x] 顧客マスタ + 顧客側ログイン（id+pass、1社1アカウント想定）— `feature/function_of_return` で実装中
- [ ] 発注フォームに顧客情報のオートフィル / 再発注機能（顧客マスタ完成後）
- [ ] 発注フォームに任意の email 欄追加 → 顧客向け通知メールが自動的に動き出す（フックは Phase 3 で配置済）

### 借り主機能（function_of_return ブランチ）

- [x] 顧客ログイン（`/login`、bcrypt パスワード）
- [x] アカウント設定（`/account`、プロフィール / パスワード変更）
- [x] 発注履歴一覧（`/orders`、ステータスフィルタ）
- [x] レンタル詳細・返却フロー（`/rentals/[orderId]`、延長 / 返却）
- [x] 管理側 顧客マスタ CRUD（`/admin/customers`）
- [ ] 返却期限 N 日前のリマインドメール（Vercel cron + `email_logs`）
- [ ] 飛び込み発注の再有効化 + 管理側への通知 → アカウント発行プロンプト
- [ ] 1 会社 N ユーザー（`customer_users` テーブル、招待制）

---

## 運用準備（管理画面リワーク後に必要）

- [ ] **Supabase migration 0006 を staging / prod に適用**（未適用だと新規資材作成 / バリエーション編集が失敗する）
- [ ] **Resend** アカウント作成 + 送信ドメインの DNS 認証
- [ ] `RESEND_API_KEY` を `.env.local` / Vercel env に設定
- [ ] `EMAIL_FROM` を認証済みドメインのアドレスに設定（未設定時は `onboarding@resend.dev` フォールバック)
