-- ============================================================
-- テナントのトライアル（無料体験）機能。
--   - status:
--       'active'    (デフォルト) … 通常テナント（本契約）。ロックされない。
--       'trial'                  … トライアル中。trial_ends_at を過ぎると完全ロック。
--       'suspended'              … 運営が手動停止。即時・完全ロック。
--   - trial_ends_at: トライアル期限（status='trial' のときのみ意味を持つ）。
--
-- 付与・延長・本契約化・停止はすべて super-admin コンソールから運営が手動操作する。
-- ロック判定は遅延評価（cron 不要）：
--   ロック = status='suspended' OR (status='trial' AND trial_ends_at < now())
-- proxy（middleware）が host からこれを引き、ロック中は /trial-expired へ rewrite する。
-- 既存テナントは status='active' になるためロックされない。
-- ============================================================

alter table tenants
  add column status text not null default 'active'
    check (status in ('trial', 'active', 'suspended')),
  add column trial_ends_at timestamptz;
