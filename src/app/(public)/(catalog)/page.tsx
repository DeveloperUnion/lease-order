import Link from "next/link";
import { getCategoriesWithCounts } from "@/lib/data";
import { requireCustomer } from "@/lib/customer-auth";

export default async function HomePage() {
  await requireCustomer();
  const categories = await getCategoriesWithCounts();

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-7">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        発注画面
      </h1>

      <section className="mt-6">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground">
            カテゴリ
          </h2>
          <span className="text-xs text-subtle">
            {categories.length} 種類
          </span>
        </div>

        {categories.length === 0 ? (
          <div className="border border-border rounded-xl bg-surface py-16 text-center">
            <p className="text-sm text-muted">
              カテゴリが登録されていません。
              <br />
              管理者にお問い合わせください。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {categories.map((category, index) => (
              <Link
                key={category.id}
                href={`/category/${category.slug}`}
                className="group flex flex-col justify-between bg-surface border border-border rounded-xl px-4 py-5 hover:border-border-strong hover:shadow-sm transition-all duration-150 ease-[cubic-bezier(.2,.8,.2,1)] motion-safe:opacity-0 motion-safe:animate-[reveal-up_400ms_ease-out_both]"
                style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-foreground group-hover:text-accent transition-colors leading-snug">
                    {category.name}
                  </h3>
                  <span
                    aria-hidden
                    className="text-sm text-subtle group-hover:text-accent transition-colors"
                  >
                    →
                  </span>
                </div>
                <p className="mt-4 text-xs text-subtle">
                  <span className="text-foreground font-medium">
                    {category.material_count}
                  </span>{" "}
                  件
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
