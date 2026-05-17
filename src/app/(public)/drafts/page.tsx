import { requireCustomer } from "@/lib/customer-auth";
import DraftsList from "./drafts-list";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const customer = await requireCustomer();
  return <DraftsList tenantId={customer.tenant_id} customerId={customer.id} />;
}
