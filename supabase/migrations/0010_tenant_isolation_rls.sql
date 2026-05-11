-- ============================================================
-- Tenant 分離 RLS ポリシー
--
-- 0009 で全 tenant スコープテーブルに tenant_id が揃ったので、
-- `authenticated` role 向けに JWT claim (auth.jwt() ->> 'tenant_id') による
-- 直接フィルタリングを RLS で強制する。
--
-- これにより、アプリ層の `.eq('tenant_id', ...)` フィルタを 1 行忘れた
-- ところで cross-tenant leak しなくなる（防御深化）。
--
-- 注意:
--   - `service_role` は引き続き RLS をバイパスする。bootstrap 操作
--     （src/lib/tenant.ts の slug→id lookup、login 時の credentials 照合、
--     管理者 email の allowlist 確認、メール通知）は意図的に
--     service_role を継続使用。
--   - 既存の anon ポリシー（公開カタログ用 `using (true)` 系）は撤去する。
--     proxy.ts がカタログ閲覧時に customer session を要求するため、
--     現状の anon 読取は使われていない。
-- ============================================================

-- ------------------------------------------------------------
-- 既存の anon ポリシーを撤去
-- ------------------------------------------------------------
drop policy if exists "anon read tenants" on tenants;
drop policy if exists "anon read categories" on categories;
drop policy if exists "anon read materials" on materials;
drop policy if exists "anon read material_variants" on material_variants;
drop policy if exists "anon read images" on images;
drop policy if exists "anon read material_images" on material_images;
drop policy if exists "anon read offices" on offices;

-- ------------------------------------------------------------
-- tenant_isolation policy generator
--
-- 共通パターン:
--   - SELECT/UPDATE/DELETE: USING (tenant_id::text = jwt.tenant_id)
--   - INSERT/UPDATE: WITH CHECK (tenant_id::text = jwt.tenant_id)
-- ------------------------------------------------------------

-- categories
create policy "tenant_isolation_select" on categories for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on categories for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on categories for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on categories for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

-- materials
create policy "tenant_isolation_select" on materials for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on materials for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on materials for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on materials for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

-- material_variants
create policy "tenant_isolation_select" on material_variants for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on material_variants for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on material_variants for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on material_variants for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

-- material_images
create policy "tenant_isolation_select" on material_images for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on material_images for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on material_images for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on material_images for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

-- images
create policy "tenant_isolation_select" on images for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on images for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on images for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on images for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

-- offices
create policy "tenant_isolation_select" on offices for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on offices for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on offices for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on offices for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

-- orders
create policy "tenant_isolation_select" on orders for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on orders for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on orders for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on orders for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

-- order_items
create policy "tenant_isolation_select" on order_items for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on order_items for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on order_items for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on order_items for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

-- email_logs
create policy "tenant_isolation_select" on email_logs for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on email_logs for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on email_logs for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on email_logs for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

-- audit_logs
create policy "tenant_isolation_select" on audit_logs for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on audit_logs for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on audit_logs for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on audit_logs for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

-- admin_users
create policy "tenant_isolation_select" on admin_users for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on admin_users for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on admin_users for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on admin_users for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

-- customers
create policy "tenant_isolation_select" on customers for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on customers for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on customers for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on customers for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

-- lease_extensions
create policy "tenant_isolation_select" on lease_extensions for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_insert" on lease_extensions for insert to authenticated
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_update" on lease_extensions for update to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
create policy "tenant_isolation_delete" on lease_extensions for delete to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

-- tenants は意図的にポリシーなし → authenticated でもアクセス不可。
-- src/lib/tenant.ts の slug→id lookup は service_role bypass で行う。
