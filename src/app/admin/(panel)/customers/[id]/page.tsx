import Link from "next/link";
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
    <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/admin/customers"
        className="inline-flex items-center gap-1 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wider text-subtle hover:text-foreground transition-colors mb-5"
      >
        <span aria-hidden>←</span> 顧客管理に戻る
      </Link>
      <PageHeader
        eyebrow={
          <span className="font-[family-name:var(--font-mono)] tabular-nums">
            {customer.company_id}
          </span>
        }
        title={customer.name}
      />
      <EditCustomerForm customer={customer} />
    </main>
  );
}
