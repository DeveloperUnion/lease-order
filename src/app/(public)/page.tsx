import Link from "next/link";
import Image from "next/image";
import { getCategories } from "@/lib/data";
import { requireCustomer } from "@/lib/customer-auth";

export default async function HomePage() {
  await requireCustomer();
  const categories = await getCategories();

  return (
    <main className="flex-1">
      <div className="max-w-6xl mx-auto px-4 py-7">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          発注画面
        </h1>

        {/* カテゴリ */}
        <section className="mt-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">
              カテゴリ
            </h2>
            <span className="text-xs text-subtle">{categories.length} 種類</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {categories.map((category, index) => (
              <Link
                key={category.id}
                href={`/category/${category.slug}`}
                className="group relative flex flex-col bg-surface border border-border rounded-xl overflow-hidden hover:border-border-strong hover:shadow-md transition-all duration-150 ease-[cubic-bezier(.2,.8,.2,1)] motion-safe:opacity-0 motion-safe:animate-[reveal-up_400ms_ease-out_both]"
                style={{ animationDelay: `${Math.min(index, 12) * 50}ms` }}
              >
                {category.image_url ? (
                  <div className="relative aspect-[4/3] bg-surface-muted overflow-hidden">
                    <Image
                      src={category.image_url}
                      alt={category.name}
                      fill
                      priority={index === 0}
                      className="object-cover group-hover:scale-[1.03] transition-transform duration-500"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    />
                  </div>
                ) : (
                  <div className="aspect-[4/3] flex items-center justify-center bg-surface-muted">
                    <span className="text-xs text-subtle">画像なし</span>
                  </div>
                )}
                <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-accent transition-colors">
                    {category.name}
                  </h3>
                  <span aria-hidden className="text-sm text-subtle group-hover:text-accent transition-colors">
                    →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
