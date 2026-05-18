import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mintTenantJwt } from "./supabase-jwt";
import { getTenantId } from "./tenant";
import {
  Category,
  Material,
  Office,
  SpecGroup,
  SpecOption,
} from "./types";

type MaterialImageJoin = {
  sort_order: number;
  is_primary: boolean;
  images: { url: string } | null;
};

type SpecOptionRow = {
  id: string;
  spec_group_id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};

type SpecGroupRow = {
  id: string;
  material_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  spec_options: SpecOptionRow[] | null;
};

type MaterialRow = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  spec: Record<string, string> | null;
  sort_order: number;
  is_active: boolean;
  material_images: MaterialImageJoin[] | null;
  spec_groups: SpecGroupRow[] | null;
};

function mapSpecOption(row: SpecOptionRow): SpecOption {
  return {
    id: row.id,
    spec_group_id: row.spec_group_id,
    label: row.label,
    sort_order: row.sort_order,
  };
}

function mapSpecGroup(row: SpecGroupRow): SpecGroup {
  const options = (row.spec_options ?? [])
    .filter((o) => o.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(mapSpecOption);
  return {
    id: row.id,
    material_id: row.material_id,
    name: row.name,
    sort_order: row.sort_order,
    options,
  };
}

function mapMaterial(row: MaterialRow): Material {
  const imgs = (row.material_images ?? [])
    .filter((mi) => mi.images?.url)
    .sort((a, b) => a.sort_order - b.sort_order);
  const primary = imgs.find((i) => i.is_primary) ?? imgs[0];
  const spec_groups = (row.spec_groups ?? [])
    .filter((g) => g.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(mapSpecGroup);
  return {
    id: row.id,
    category_id: row.category_id,
    name: row.name,
    image_url: primary?.images?.url ?? null,
    description: row.description,
    spec: row.spec,
    sort_order: row.sort_order,
    is_active: row.is_active,
    catalog_pages: imgs.map((i) => i.images!.url),
    spec_groups,
  };
}

// unstable_cache は cookies()/headers() を読むコードを内側に持てないため、
// tenantId を引数化してキャッシュキーに含める。中で短期 JWT を都度 mint して
// RLS（tenant_id claim 必須）を通過させる。サブジェクトは `tenant:<id>` 固定で
// 良い（テナント全体に公開のカタログデータなので customer 単位のキャッシュ分離
// は不要）。
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

function createTenantClient(tenantId: string): SupabaseClient {
  const jwt = mintTenantJwt({ tenantId, subject: `tenant:${tenantId}` });
  return createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const fetchCategoriesCached = unstable_cache(
  async (tenantId: string): Promise<Category[]> => {
    const supabase = createTenantClient(tenantId);
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug, image_url, sort_order")
      .eq("tenant_id", tenantId)
      .order("sort_order");
    if (error) throw error;
    return data ?? [];
  },
  ["catalog:categories"],
  { tags: ["catalog"], revalidate: 3600 }
);

// 4 階層 nested JOIN を cold で叩くとプランナーが重いので、
//   1) materials + material_images + images
//   2) spec_groups + spec_options
// の 2 クエリを並列で投げ、JS 側で material_id 別に merge する。
// 戻り型は MaterialRow と同じなので、既存の mapMaterial をそのまま使える。
const fetchAllMaterialsCached = unstable_cache(
  async (tenantId: string): Promise<Material[]> => {
    const supabase = createTenantClient(tenantId);
    const [matsRes, groupsRes] = await Promise.all([
      supabase
        .from("materials")
        .select(
          "id, category_id, name, description, spec, sort_order, is_active, material_images(sort_order, is_primary, images(url))"
        )
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("spec_groups")
        .select(
          "id, material_id, name, sort_order, is_active, spec_options(id, spec_group_id, label, sort_order, is_active)"
        )
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("sort_order"),
    ]);
    if (matsRes.error) throw matsRes.error;
    if (groupsRes.error) throw groupsRes.error;

    const groupsByMaterial = new Map<string, SpecGroupRow[]>();
    for (const g of (groupsRes.data ?? []) as unknown as SpecGroupRow[]) {
      const arr = groupsByMaterial.get(g.material_id) ?? [];
      arr.push(g);
      groupsByMaterial.set(g.material_id, arr);
    }

    return (matsRes.data ?? []).map((row) => {
      const r = row as unknown as Omit<MaterialRow, "spec_groups"> & {
        spec_groups?: SpecGroupRow[] | null;
      };
      r.spec_groups = groupsByMaterial.get(r.id) ?? null;
      return mapMaterial(r as MaterialRow);
    });
  },
  ["catalog:materials"],
  { tags: ["catalog"], revalidate: 3600 }
);

const fetchOfficesCached = unstable_cache(
  async (tenantId: string): Promise<Office[]> => {
    const supabase = createTenantClient(tenantId);
    const { data, error } = await supabase
      .from("offices")
      .select("id, name, area, address, phone, fax, lat, lng, sort_order, is_active")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw error;
    return data ?? [];
  },
  ["catalog:offices"],
  { tags: ["catalog"], revalidate: 3600 }
);

export const getCategories = cache(async (): Promise<Category[]> => {
  const tenantId = await getTenantId();
  return fetchCategoriesCached(tenantId);
});

export const getAllMaterials = cache(async (): Promise<Material[]> => {
  const tenantId = await getTenantId();
  return fetchAllMaterialsCached(tenantId);
});

export const getOffices = cache(async (): Promise<Office[]> => {
  const tenantId = await getTenantId();
  return fetchOfficesCached(tenantId);
});

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const cats = await getCategories();
  return cats.find((c) => c.slug === slug) ?? null;
}

export async function getMaterialsByCategory(categoryId: string): Promise<Material[]> {
  const all = await getAllMaterials();
  return all.filter((m) => m.category_id === categoryId);
}
