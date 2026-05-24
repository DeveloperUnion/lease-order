import { getCategories } from "@/lib/data";
import CatalogNav from "@/components/catalog-nav";

export default async function CatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const categories = await getCategories();

  return (
    <div className="md:flex md:items-start flex-1">
      <CatalogNav categories={categories} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
