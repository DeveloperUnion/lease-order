import { requireCustomer } from "@/lib/customer-auth";
import OutboxList from "./outbox-list";

export const dynamic = "force-dynamic";

export default async function OutboxPage() {
  const customer = await requireCustomer();
  return <OutboxList tenantId={customer.tenant_id} customerId={customer.id} />;
}
