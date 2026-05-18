import { getAllMaterials, getCategories } from "@/lib/data";
import { requireCustomer } from "@/lib/customer-auth";
import CategoryView from "./category-view";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // catalog cache と顧客認証を 1 ラウンドで並列実行。
  // getCategories / getAllMaterials は同じ unstable_cache を引くので、
  // 後段で category.id でフィルタするだけで OK。
  const [, { slug }, categories, allMaterials] = await Promise.all([
    requireCustomer(),
    params,
    getCategories(),
    getAllMaterials(),
  ]);

  const category = categories.find((c) => c.slug === slug) ?? null;

  if (!category) {
    return (
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        <div className="text-subtle text-center py-16">カテゴリが見つかりません</div>
      </main>
    );
  }

  const materials = allMaterials.filter((m) => m.category_id === category.id);

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
      <CategoryView category={category} materials={materials} />
    </main>
  );
}
