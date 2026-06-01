-- レンタル価格機能。
--   - materials に単価カラム（日額 / 月額。円・税抜。会社が使う単位だけ埋める想定）
--   - tenants に課金ルール billing_rule（jsonb）。一旦は全テナント月額をデフォルトに
--   - order_items に発注時スナップショット（価格改定後も過去注文を不変に保つ）
--
-- billing_rule の形:
--   {"type":"daily"}
--   {"type":"monthly"}
--   {"type":"threshold","threshold_days":30,"under":"day","over":"month"}

alter table materials
  add column daily_price integer,
  add column monthly_price integer;

alter table tenants
  add column billing_rule jsonb not null default '{"type":"monthly"}'::jsonb;

-- 発注時の単価・金額スナップショット
alter table order_items
  add column price_unit text check (price_unit in ('day', 'month')),
  add column unit_price integer,
  add column billed_units integer,        -- 課金された日数 or 月数
  add column amount integer,               -- 明細金額 = unit_price * billed_units * quantity
  add column billing_rule_snapshot jsonb;  -- 発注時の課金ルール（監査用）
