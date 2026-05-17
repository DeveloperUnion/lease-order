import { notFound } from "next/navigation";
import { getCustomerForAdmin } from "@/lib/admin-data";
import { PageHeader } from "@/components/admin/ui";
import EditCustomerForm from "./edit-customer-form";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await getCustomerForAdmin(id);
  if (!customer) notFound();

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref="/admin/customers"
        backLabel="顧客管理に戻る"
        eyebrow={customer.company_id}
        title={customer.name}
      />
      <EditCustomerForm customer={customer} />
    </main>
  );
}
