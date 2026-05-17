-- 管理画面の会話一覧で「per-conversation の未読数」を取りたい。
-- これまでは listConversationsForAdmin が「テナント内の customer 発・未読行」を
-- 全件 SELECT して JS で grouping していた。会話数 × 未読件数に応じて転送量が線形に
-- 増えるので、Postgres 側で group by + count に置き換えて per-tenant 1 クエリにする。
--
-- security definer：messages の RLS は (auth.jwt() ->> 'tenant_id') による絞り込みで
-- 既に効くが、この RPC は supabaseAdmin (service_role) から呼ぶ前提なので、
-- 二重防御として WHERE tenant_id = p_tenant_id を必須にする。
create or replace function chat_unread_counts_by_conversation(p_tenant_id uuid)
returns table(conversation_id uuid, unread_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select conversation_id, count(*)::bigint as unread_count
  from messages
  where tenant_id = p_tenant_id
    and sender_type = 'customer'
    and read_at is null
  group by conversation_id;
$$;

revoke all on function chat_unread_counts_by_conversation(uuid) from public;
grant execute on function chat_unread_counts_by_conversation(uuid) to service_role;
