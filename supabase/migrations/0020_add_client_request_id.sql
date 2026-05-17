-- ============================================================
-- 発注のオフライン送信向け冪等化
--
--   オフライン端末で「発注確定」を押した発注は、回線復帰後に
--   client 側 outbox から POST /api/orders へ再送される。
--   ネットワーク再送・複数タブ並走・タイムアウト後成功などで
--   同じ payload が複数回到達しても、orders に重複行が出来ない
--   ようにする。
--
--   * client_request_id は client 側で UUID v4 を採番
--   * 既存行は NULL のまま許容（後方互換）
--   * 新規行は (tenant_id, client_request_id) が一意
-- ============================================================

alter table orders
  add column if not exists client_request_id uuid;

create unique index if not exists orders_tenant_client_request_id_idx
  on orders (tenant_id, client_request_id)
  where client_request_id is not null;
