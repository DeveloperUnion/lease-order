import { getCurrentCustomer } from "@/lib/customer-auth";
import { countOverdueForCustomer } from "@/lib/rentals-data";
import {
  countUnreadForCustomer,
  listNotificationsForCustomer,
} from "@/lib/notifications-data";
import HeaderClient from "./header-client";
import CustomerNav from "./customer-nav";
import CustomerNotificationBell from "./customer-notification-bell";

export default async function Header() {
  const customer = await getCurrentCustomer();
  const customerProp = customer
    ? { id: customer.id, company_id: customer.company_id, name: customer.name }
    : null;

  if (!customer) {
    return <HeaderClient customer={null} notificationBell={null} />;
  }

  const [overdueCount, unreadCount, recent] = await Promise.all([
    countOverdueForCustomer(customer.id, customer.tenant_id),
    countUnreadForCustomer(customer.id, customer.tenant_id),
    listNotificationsForCustomer(customer.id, customer.tenant_id, 100),
  ]);

  return (
    <>
      <HeaderClient
        customer={customerProp}
        notificationBell={
          <CustomerNotificationBell unreadCount={unreadCount} recent={recent} />
        }
      />
      <CustomerNav customer={customerProp!} overdueCount={overdueCount} />
    </>
  );
}
