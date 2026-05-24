import { notFound } from "next/navigation";
import {
  getMaterialDetail,
  listCategoriesForAdmin,
} from "@/lib/admin-data";
import MaterialDetailView from "./material-detail-view";

export const dynamic = "force-dynamic";

export default async function MaterialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [material, categories] = await Promise.all([
    getMaterialDetail(id),
    listCategoriesForAdmin(),
  ]);
  if (!material) notFound();

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 sm:px-6 sm:py-8">
      <MaterialDetailView material={material} categories={categories} />
    </main>
  );
}
