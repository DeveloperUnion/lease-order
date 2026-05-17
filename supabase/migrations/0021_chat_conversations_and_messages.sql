-- ============================================================
-- チャット機能: conversations / messages
--
-- 設計:
--   * 顧客 1 ↔ リース会社 1 の会話。tenant_id + customer_id で UNIQUE。
--   * メッセージは1スレッドの中で sender_type ('customer'|'admin') で識別。
--   * 未読は messages.read_at NULL を都度 COUNT（denormalize しない）。
--   * conversations.last_message_at は AFTER INSERT トリガで更新し、
--     管理側の「未読順並べ」で使う。
--   * 添付ファイルは attachments jsonb 配列に { path, name, size, mime } を格納。
--     実体は chat-attachments storage bucket（private, tenant-prefixed）。
--   * オフライン送信のため client_request_id で冪等化（既存 orders と同方式）。
-- ============================================================

-- (1) conversations
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_sender_type text check (last_message_sender_type in ('customer', 'admin')),
  created_at timestamptz not null default now(),
  unique (tenant_id, customer_id)
);
create index if not exists idx_conversations_tenant_last_at
  on conversations(tenant_id, last_message_at desc nulls last);

alter table conversations enable row level security;

create policy "tenant_isolation_select" on conversations for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on conversations for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on conversations for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on conversations for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

-- (2) messages
--   sender_id は sender_type に応じて customers.id か admin_users.id を指す（多態関連）。
--   FK は張らずアプリ側で整合性を担保（notifications テーブルと同方針）。
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer', 'admin')),
  sender_id uuid not null,
  body text,
  attachments jsonb not null default '[]'::jsonb,
  order_id uuid references orders(id) on delete set null,
  client_request_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (body is not null or attachments <> '[]'::jsonb)
);
create index if not exists idx_messages_conversation_created
  on messages(conversation_id, created_at);
create index if not exists idx_messages_tenant on messages(tenant_id);
create index if not exists idx_messages_unread
  on messages(conversation_id, sender_type)
  where read_at is null;

-- 冪等性: 同一会話・同一送信者からの同じ client_request_id は1行にする
create unique index if not exists idx_messages_idempotency
  on messages(conversation_id, sender_type, sender_id, client_request_id)
  where client_request_id is not null;

alter table messages enable row level security;

create policy "tenant_isolation_select" on messages for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on messages for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on messages for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on messages for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

-- (3) AFTER INSERT トリガで conversations のサマリを更新
--   last_message_preview は本文先頭 80 文字（NULL なら "(添付)"）。
create or replace function chat_update_conversation_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update conversations
    set last_message_at = new.created_at,
        last_message_sender_type = new.sender_type,
        last_message_preview = coalesce(
          nullif(left(new.body, 80), ''),
          '(添付)'
        )
    where id = new.conversation_id;
  return new;
end
$$;

drop trigger if exists messages_after_insert_update_summary on messages;
create trigger messages_after_insert_update_summary
  after insert on messages
  for each row execute function chat_update_conversation_summary();

-- (4) Realtime: messages の INSERT イベントを supabase-js channel に配信
alter publication supabase_realtime add table messages;

-- (5) Storage bucket（private）
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

-- パス先頭が tenant_id であることを要求して tenant 分離。
-- アップロード／署名 URL 取得はアプリ側 service_role で行う想定だが、
-- 万一 authenticated で直接叩かれた場合の防壁として policy を貼っておく。
create policy "chat_attachments_tenant_select" on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );

create policy "chat_attachments_tenant_insert" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );

create policy "chat_attachments_tenant_update" on storage.objects for update
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );

create policy "chat_attachments_tenant_delete" on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );
