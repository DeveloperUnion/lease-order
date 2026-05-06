import Link from "next/link";
import { getAllMaterials, getCategories } from "@/lib/data";
import { requireCustomer } from "@/lib/customer-auth";
import SearchView from "./search-view";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireCustomer();
  const { q } = await searchParams;
  const query = q ?? "";

  const [allMaterials, categories] = await Promise.all([
    getAllMaterials(),
    getCategories(),
  ]);

  const results = query.trim()
    ? allMaterials.filter((m) =>
        m.name.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-subtle hover:text-accent transition-colors mb-5"
      >
        <span aria-hidden>←</span> 発注画面に戻る
      </Link>
      <SearchView query={query} results={results} categories={categories} />
    </main>
  );
}
