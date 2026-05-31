import { getCategories, getMaterialsByCategory } from "@/lib/data";
import { requireCustomer } from "@/lib/customer-auth";
import { getTenant } from "@/lib/tenant";
import CategoryView from "./category-view";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // 認証とカテゴリ一覧を並列に。資材は category.id が確定してから取得。
  // categories は cache hit が前提（小さい）。materials は category 単位の
  // 軽量クエリ + Redis L3 で cold start も短時間で済む。
  const [, { slug }, categories, tenant] = await Promise.all([
    requireCustomer(),
    params,
    getCategories(),
    getTenant(),
  ]);

  const category = categories.find((c) => c.slug === slug) ?? null;

  if (!category) {
    return (
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        <div className="text-subtle text-center py-16">カテゴリが見つかりません</div>
      </main>
    );
  }

  const materials = await getMaterialsByCategory(category.id);

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
      <CategoryView
        category={category}
        materials={materials}
        billingRule={tenant.billing_rule}
      />
    </main>
  );
}
