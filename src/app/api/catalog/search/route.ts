import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/customer-auth";
import { getSupabaseTenant } from "@/lib/supabase-tenant";
import { getTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

type SearchResultRow = {
  id: string;
  name: string;
  category_id: string;
  categories: { name: string; slug: string } | null;
};

export type SearchResult = {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  category_slug: string;
};

export async function GET(req: Request): Promise<Response> {
  await requireCustomer();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json({ results: [] satisfies SearchResult[] });
  }

  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const { data, error } = await supabase
    .from("materials")
    .select("id, name, category_id, categories(name, slug)")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .ilike("name", `%${q}%`)
    .order("sort_order")
    .limit(8);
  if (error) {
    console.error("catalog search failed", error);
    return NextResponse.json({ error: "search failed" }, { status: 500 });
  }

  const results: SearchResult[] = ((data as unknown as SearchResultRow[]) ?? [])
    .filter((row) => row.categories)
    .map((row) => ({
      id: row.id,
      name: row.name,
      category_id: row.category_id,
      category_name: row.categories!.name,
      category_slug: row.categories!.slug,
    }));

  return NextResponse.json({ results });
}
