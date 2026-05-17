import { cache } from "react";
import { getSupabaseTenant } from "./supabase-tenant";
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

export const getCategories = cache(async (): Promise<Category[]> => {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, image_url, sort_order")
    .eq("tenant_id", tenantId)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
});

export const getAllMaterials = cache(async (): Promise<Material[]> => {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const { data, error } = await supabase
    .from("materials")
    .select(
      `id, category_id, name, description, spec, sort_order, is_active,
       material_images(sort_order, is_primary, images(url)),
       spec_groups(id, material_id, name, sort_order, is_active,
         spec_options(id, spec_group_id, label, sort_order, is_active))`
    )
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((row) => mapMaterial(row as unknown as MaterialRow));
});

export const getOffices = cache(async (): Promise<Office[]> => {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const { data, error } = await supabase
    .from("offices")
    .select("id, name, area, address, phone, fax, lat, lng, sort_order, is_active")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
});

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const cats = await getCategories();
  return cats.find((c) => c.slug === slug) ?? null;
}

export async function getMaterialsByCategory(categoryId: string): Promise<Material[]> {
  const all = await getAllMaterials();
  return all.filter((m) => m.category_id === categoryId);
}
