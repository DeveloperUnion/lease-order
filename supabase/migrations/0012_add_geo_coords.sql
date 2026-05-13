-- ============================================================
-- 配送先・営業所の座標（緯度/経度）を追加
-- 発注フォームで Google Maps にドラッグ可能ピンを表示し、
-- 顧客が現場の正確な位置を指定できるようにする。
-- ============================================================

alter table orders
  add column if not exists delivery_lat numeric(9, 6),
  add column if not exists delivery_lng numeric(9, 6);

alter table orders
  drop constraint if exists orders_delivery_lat_range,
  drop constraint if exists orders_delivery_lng_range;

alter table orders
  add constraint orders_delivery_lat_range
    check (delivery_lat is null or (delivery_lat between -90 and 90)),
  add constraint orders_delivery_lng_range
    check (delivery_lng is null or (delivery_lng between -180 and 180));

alter table offices
  add column if not exists lat numeric(9, 6),
  add column if not exists lng numeric(9, 6);

alter table offices
  drop constraint if exists offices_lat_range,
  drop constraint if exists offices_lng_range;

alter table offices
  add constraint offices_lat_range
    check (lat is null or (lat between -90 and 90)),
  add constraint offices_lng_range
    check (lng is null or (lng between -180 and 180));
