-- 通知連携先のテナント別設定。
--   - Slack / Chatwork / LINE WORKS など「共有チャンネルに投げる」連携先を管理画面から設定する
--   - 1テナント × 1連携先 = 1行（unique）。enabled で ON/OFF
--   - config は連携先ごとに必要項目が違うため jsonb で吸収
--       slack: {"webhookUrl":...,"channelName":"#...","teamName":...,"incomingWebhookChannelId":...}
--   - Webhook URL 等の秘匿情報を含むため RLS で tenant 分離（notifications と同方式）

create table if not exists notification_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  channel text not null check (channel in ('slack', 'chatwork', 'line_works')),
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, channel)
);

alter table notification_channels enable row level security;

create policy "tenant_isolation_select" on notification_channels for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on notification_channels for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on notification_channels for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on notification_channels for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
