import { Suspense } from "react";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { getCustomerHeaderData } from "@/lib/header-data";
import HeaderClient from "./header-client";
import CustomerNav from "./customer-nav";
import {
  CustomerNavWithData,
  CustomerNotificationBellWithData,
} from "./header-badges";

function BellSkeleton() {
  return (
    <div className="h-10 w-10 rounded-lg border border-border bg-surface-muted/40 animate-pulse" />
  );
}

export default async function Header() {
  const customer = await getCurrentCustomer();
  if (!customer) {
    return <HeaderClient customer={null} notificationBell={null} />;
  }
  const customerProp = {
    id: customer.id,
    company_id: customer.company_id,
    name: customer.name,
  };

  // Promise のまま渡して各 Suspense 境界で並列ストリーミング。
  // Header シェルとカテゴリ nav (overdueCount=0 で先に出す) は即座に描画され、
  // バッジは確定し次第差し替わる。
  const dataPromise = getCustomerHeaderData(customer.id, customer.tenant_id);

  return (
    <>
      <HeaderClient
        customer={customerProp}
        notificationBell={
          <Suspense fallback={<BellSkeleton />}>
            <CustomerNotificationBellWithData promise={dataPromise} />
          </Suspense>
        }
      />
      <Suspense fallback={<CustomerNav customer={customerProp} overdueCount={0} />}>
        <CustomerNavWithData customer={customerProp} promise={dataPromise} />
      </Suspense>
    </>
  );
}
