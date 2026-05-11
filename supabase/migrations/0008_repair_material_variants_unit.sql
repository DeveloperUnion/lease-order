-- ============================================================
-- Repair: material_variants.unit が一部環境で欠落していた状態を補正。
-- 0006 で追加したはずだが、staging で schema_migrations と実体が乖離していたため、
-- if not exists で冪等に再追加する。
-- ============================================================

alter table material_variants add column if not exists unit text;
