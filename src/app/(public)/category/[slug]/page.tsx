import { getCategoryBySlug, getMaterialsByCategory } from "@/lib/data";
import { requireCustomer } from "@/lib/customer-auth";
import CategoryView from "./category-view";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireCustomer();
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

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
      <CategoryView category={category} materials={materials} />
    </main>
  );
}
