-- ============================================================
-- 返却フローを「申請 → 予定確定 → 受領検品」の 3 段階に分解
--
-- 0011 までは return_requests.status は ('pending', 'acknowledged', 'rejected') で
-- 「acknowledged = 即受領完了」だったが、実運用では下記の 2 ステップが間に挟まる：
--   1. 輸送調整：顧客が輸送手段（pickup/dropoff）と希望日を申請に含め、
--      管理者が予定を確定 → 'scheduled'
--   2. 受領検品：当日、管理者が実受領数 / 損傷 / 残数の扱い（cancel/lost）を
--      入力して完了 → 'completed'
--
-- 既存の 'acknowledged' 行は backfill で 'completed' に変換し、互換性を保つ。
-- ============================================================

-- (1) return_requests に輸送・予定・受領のカラム群を追加
alter table return_requests
  add column if not exists transport_method text
    check (transport_method in ('pickup', 'dropoff')),
  add column if not exists desired_date date,
  add column if not exists dropoff_office_id uuid references offices(id),
  add column if not exists scheduled_date date,
  add column if not exists scheduled_at timestamptz,
  add column if not exists scheduled_by_admin_id uuid references admin_users(id),
  add column if not exists received_quantity int check (received_quantity is null or received_quantity >= 0),
  add column if not exists cancelled_quantity int not null default 0
    check (cancelled_quantity >= 0),
  add column if not exists lost_quantity int not null default 0
    check (lost_quantity >= 0),
  add column if not exists damaged_quantity int not null default 0
    check (damaged_quantity >= 0),
  add column if not exists damage_notes text,
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by_admin_id uuid references admin_users(id),
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by_admin_id uuid references admin_users(id),
  add column if not exists cancel_reason text;

-- (2) status 制約の差し替え
--   旧: ('pending', 'acknowledged', 'rejected')
--   新: ('pending', 'scheduled', 'completed', 'rejected', 'cancelled')
--   既存 acknowledged 行は完了済みとして 'completed' に backfill。
do $migrate_status$
begin
  -- check 制約を一旦外す（制約名はテーブル定義時の自動命名 or 既存と一致する想定）
  alter table return_requests
    drop constraint if exists return_requests_status_check;

  -- backfill: acknowledged → completed
  update return_requests
    set status = 'completed',
        completed_at = coalesce(completed_at, acknowledged_at),
        completed_by_admin_id = coalesce(completed_by_admin_id, acknowledged_by_admin_id),
        received_quantity = coalesce(received_quantity, requested_quantity_delta)
    where status = 'acknowledged';

  -- 新しい check 制約
  alter table return_requests
    add constraint return_requests_status_check
      check (status in ('pending', 'scheduled', 'completed', 'rejected', 'cancelled'));
end
$migrate_status$;

-- (3) 受領・残数の整合性を保証する CHECK 制約
--   completed 行では received + cancelled + lost == requested_quantity_delta
--   かつ damaged <= received
alter table return_requests
  drop constraint if exists return_requests_received_breakdown_check;
alter table return_requests
  add constraint return_requests_received_breakdown_check
    check (
      status <> 'completed'
      or (
        received_quantity is not null
        and received_quantity + cancelled_quantity + lost_quantity = requested_quantity_delta
        and damaged_quantity <= received_quantity
      )
    );

-- (4) インデックス：予定日でのカレンダー集計、scheduled な pending と同じ意味で
--     remaining 計算に絡む partial index
create index if not exists idx_return_requests_scheduled_date
  on return_requests(scheduled_date) where status = 'scheduled';
create index if not exists idx_return_requests_scheduled_item
  on return_requests(order_item_id) where status = 'scheduled';

-- (5) order_items に lost_quantity を追加。
--     完了判定は returned_quantity + lost_quantity >= quantity で行う。
alter table order_items
  add column if not exists lost_quantity int not null default 0
    check (lost_quantity >= 0);

-- 旧 check 制約 (returned_quantity <= quantity) は「物理的に戻ってきた数」の上限を
-- 表すものとして残せるが、「returned + lost <= quantity」の方が業務的に正しい。
-- 両方の和に対する制約に差し替える。
alter table order_items
  drop constraint if exists order_items_returned_qty_check;
alter table order_items
  add constraint order_items_returned_lost_check
    check (returned_quantity >= 0
       and lost_quantity >= 0
       and returned_quantity + lost_quantity <= quantity);
