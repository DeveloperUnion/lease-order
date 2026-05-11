-- ============================================================
-- Realtime: notifications テーブルの INSERT イベントを
-- ブラウザの supabase-js channel に配信する。
--
-- RLS の tenant_id ポリシーが Realtime にも適用されるため、
-- ブラウザ側で送る JWT に tenant_id claim があれば、
-- 他テナントの行は WebSocket レベルでも届かない。
-- ============================================================

alter publication supabase_realtime add table notifications;
