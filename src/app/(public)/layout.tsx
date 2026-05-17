import { Suspense } from "react";
import { CartProvider } from "@/lib/cart-context";
import { getCurrentCustomer } from "@/lib/customer-auth";
import Header from "@/components/header";
import MainPadding from "@/components/main-padding";
import SyncRunner from "@/lib/offline/sync-runner";

export default async function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const customer = await getCurrentCustomer();

  return (
    <CartProvider
      tenantId={customer?.tenant_id ?? null}
      customerId={customer?.id ?? null}
    >
      <SyncRunner />
      <Suspense fallback={<div className="h-14 border-b border-border bg-surface" />}>
        <Header />
      </Suspense>
      <MainPadding hasCustomer={!!customer}>{children}</MainPadding>
    </CartProvider>
  );
}
