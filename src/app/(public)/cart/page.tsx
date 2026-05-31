import { getOffices } from "@/lib/data";
import { requireCustomer } from "@/lib/customer-auth";
import { getTenant } from "@/lib/tenant";
import CartForm from "./cart-form";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const customer = await requireCustomer();
  const [offices, tenant] = await Promise.all([getOffices(), getTenant()]);
  return (
    <CartForm
      offices={offices}
      customer={customer}
      billingRule={tenant.billing_rule}
    />
  );
}
