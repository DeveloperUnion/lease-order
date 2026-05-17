import { PageHeader } from "@/components/admin/ui";
import NewCustomerForm from "./new-customer-form";

export const dynamic = "force-dynamic";

export default function NewCustomerPage() {
  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref="/admin/customers"
        backLabel="顧客管理に戻る"
        title="顧客を新規追加"
      />
      <NewCustomerForm />
    </main>
  );
}
