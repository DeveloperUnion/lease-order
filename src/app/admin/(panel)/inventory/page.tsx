import { getCategories } from "@/lib/data";
import { listInventoryForAdmin } from "@/lib/admin-data";
import AdminInventoryView from "./admin-inventory-view";

export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  const [rows, categories] = await Promise.all([
    listInventoryForAdmin(),
    getCategories(),
  ]);

  return <AdminInventoryView rows={rows} categories={categories} />;
}
