import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mintTenantJwt } from "./supabase-jwt";
import { getTenantId } from "./tenant";
import { readJson, writeJson } from "./redis-cache";
import {
  Category,
  Material,
  Office,
  SpecGroup,
  SpecOption,
} from "./types";

// catalog 系のキャッシュ階層:
//   L1: React cache() — 同一 request 内のデデュープ
//   L2: unstable_cache — function instance ローカル (warm 時に高速)
//   L3: Redis (Upstash) — function instance 間で共有、cold start も即応答
//   L4: Supabase — 真実
//
// L3 が未設定 (env なし or @upstash/redis 未 install) の場合は単に skip され、
// L1+L2 だけで動く (= 元の挙動)。
//
// admin が catalog を編集したときは src/lib/catalog-cache.ts の revalidateCatalog()
// が L2 と L3 を同時に invalidate する。

const REDIS_TTL_SECONDS = 60 * 60; // 1h
const CATALOG_PREFIX = "catalog:";

async function withRedis<T>(
  key: string,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await readJson<T>(key);
  if (cached != null) return cached;
  const fresh = await fetcher();
  // 非同期にし、Redis 書き込みは応答を待たない
  void writeJson(key, fresh, REDIS_TTL_SECONDS);
  return fresh;
}

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
    return withRedis(`${CATALOG_PREFIX}cats:${tenantId}`, async () => {
      const supabase = createTenantClient(tenantId);
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, sort_order")
        .eq("tenant_id", tenantId)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    });
  },
  ["catalog:categories"],
  { tags: ["catalog"], revalidate: 3600 }
);

export type CategoryWithCount = Category & { material_count: number };

const fetchCategoriesWithCountsCached = unstable_cache(
  async (tenantId: string): Promise<CategoryWithCount[]> => {
    return withRedis(
      `${CATALOG_PREFIX}cats-counts:${tenantId}`,
      async () => {
        const supabase = createTenantClient(tenantId);
        const { data, error } = await supabase
          .from("categories")
          .select("id, name, slug, sort_order, materials(id)")
          .eq("tenant_id", tenantId)
          .eq("materials.is_active", true)
          .order("sort_order");
        if (error) throw error;
        type Row = Category & { materials: { id: string }[] | null };
        return ((data ?? []) as unknown as Row[]).map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          sort_order: row.sort_order,
          material_count: row.materials?.length ?? 0,
        }));
      }
    );
  },
  ["catalog:categories-with-counts"],
  { tags: ["catalog"], revalidate: 3600 }
);

// 4 階層 nested JOIN を cold で叩くとプランナーが重いので、
//   1) materials + material_images + images
//   2) spec_groups + spec_options
// の 2 クエリを並列で投げ、JS 側で material_id 別に merge する。
// 戻り型は MaterialRow と同じなので、既存の mapMaterial をそのまま使える。
// 4 階層 nested を JOIN すると cold プランが重いので、
//   1) materials + material_images + images
//   2) spec_groups + spec_options
// を並列で投げ、JS で material_id 別に merge する。
async function loadMaterialsAndMerge(
  tenantId: string,
  filter: { byCategory?: string } = {}
): Promise<Material[]> {
  const supabase = createTenantClient(tenantId);

  let matsQuery = supabase
    .from("materials")
    .select(
      "id, category_id, name, description, spec, sort_order, is_active, material_images(sort_order, is_primary, images(url))"
    )
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order");
  let groupsQuery = supabase
    .from("spec_groups")
    .select(
      "id, material_id, name, sort_order, is_active, spec_options(id, spec_group_id, label, sort_order, is_active), materials!inner(id, category_id)"
    )
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order");

  if (filter.byCategory) {
    matsQuery = matsQuery.eq("category_id", filter.byCategory);
    // spec_groups 側は materials.category_id 経由で絞る（!inner join）
    groupsQuery = groupsQuery.eq("materials.category_id", filter.byCategory);
  }

  const [matsRes, groupsRes] = await Promise.all([matsQuery, groupsQuery]);
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
}

const fetchAllMaterialsCached = unstable_cache(
  async (tenantId: string): Promise<Material[]> => {
    return withRedis(`${CATALOG_PREFIX}mats-all:${tenantId}`, () =>
      loadMaterialsAndMerge(tenantId)
    );
  },
  ["catalog:materials"],
  { tags: ["catalog"], revalidate: 3600 }
);

const fetchMaterialsByCategoryCached = unstable_cache(
  async (tenantId: string, categoryId: string): Promise<Material[]> => {
    return withRedis(
      `${CATALOG_PREFIX}mats-by-cat:${tenantId}:${categoryId}`,
      () => loadMaterialsAndMerge(tenantId, { byCategory: categoryId })
    );
  },
  ["catalog:materials-by-category"],
  { tags: ["catalog"], revalidate: 3600 }
);

const fetchOfficesCached = unstable_cache(
  async (tenantId: string): Promise<Office[]> => {
    return withRedis(`${CATALOG_PREFIX}offices:${tenantId}`, async () => {
      const supabase = createTenantClient(tenantId);
      const { data, error } = await supabase
        .from("offices")
        .select(
          "id, name, area, address, phone, fax, lat, lng, sort_order, is_active"
        )
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    });
  },
  ["catalog:offices"],
  { tags: ["catalog"], revalidate: 3600 }
);

export const getCategories = cache(async (): Promise<Category[]> => {
  const tenantId = await getTenantId();
  return fetchCategoriesCached(tenantId);
});

export const getCategoriesWithCounts = cache(
  async (): Promise<CategoryWithCount[]> => {
    const tenantId = await getTenantId();
    return fetchCategoriesWithCountsCached(tenantId);
  }
);

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

export const getMaterialsByCategory = cache(
  async (categoryId: string): Promise<Material[]> => {
    const tenantId = await getTenantId();
    return fetchMaterialsByCategoryCached(tenantId, categoryId);
  }
);
