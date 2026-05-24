import { listCustomersForAdmin } from "@/lib/admin-data";
import { getAllMaterials, getOffices } from "@/lib/data";
import { getTenantId } from "@/lib/tenant";
import NewOrderFlow from "./new-order-flow";

export const dynamic = "force-dynamic";

export default async function AdminNewOrderPage() {
  const [customers, materials, offices, tenantId] = await Promise.all([
    listCustomersForAdmin(),
    getAllMaterials(),
    getOffices(),
    getTenantId(),
  ]);
  // is_active かつ要パスワード変更でない顧客のみ選択肢に
  const selectable = customers.filter((c) => c.is_active);
  return (
    <NewOrderFlow
      tenantId={tenantId}
      customers={selectable}
      materials={materials}
      offices={offices}
    />
  );
}
