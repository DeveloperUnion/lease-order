import { requireCustomer } from "@/lib/customer-auth";
import { getAllMaterials } from "@/lib/data";
import IntakeFlow from "./intake-flow";

export const dynamic = "force-dynamic";

export default async function CartIntakePage() {
  const customer = await requireCustomer();
  const materials = await getAllMaterials();
  return (
    <IntakeFlow
      mode="customer"
      tenantId={customer.tenant_id}
      customerId={customer.id}
      materials={materials}
    />
  );
}
