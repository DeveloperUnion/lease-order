import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import NewCustomerForm from "./new-customer-form";

export const dynamic = "force-dynamic";

export default function NewCustomerPage() {
  return (
    <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/admin/customers"
        className="inline-flex items-center gap-1 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wider text-subtle hover:text-foreground transition-colors mb-5"
      >
        <span aria-hidden>←</span> 顧客管理に戻る
      </Link>
      <PageHeader eyebrow="マスタ ／ 顧客" title="顧客を新規追加" />
      <NewCustomerForm />
    </main>
  );
}
