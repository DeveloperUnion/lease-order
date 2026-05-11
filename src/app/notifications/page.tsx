import Link from "next/link";
import { requireCustomer } from "@/lib/customer-auth";
import {
  labelForNotification,
  linkForNotification,
  listNotificationsForCustomer,
} from "@/lib/notifications-data";
import { markAllCustomerNotificationsRead } from "./actions";

export const dynamic = "force-dynamic";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default async function CustomerNotificationsPage() {
  const customer = await requireCustomer();
  const rows = await listNotificationsForCustomer(customer.id, customer.tenant_id, 100);
  const hasUnread = rows.some((r) => !r.read_at);

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-7">
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">通知</h1>
        {hasUnread && (
          <form action={markAllCustomerNotificationsRead}>
            <button
              type="submit"
              className="text-xs text-accent hover:underline"
            >
              すべて既読にする
            </button>
          </form>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="border border-border bg-surface rounded-2xl p-10 text-center">
          <p className="text-sm text-muted">通知はありません</p>
        </div>
      ) : (
        <ul className="border border-border bg-surface rounded-2xl overflow-hidden divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={linkForNotification(row, "customer")}
                className={`flex items-start gap-3 px-5 py-4 hover:bg-surface-muted transition-colors ${
                  row.read_at ? "" : "bg-accent-soft/30"
                }`}
              >
                {!row.read_at && (
                  <span
                    aria-hidden
                    className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent flex-shrink-0"
                  />
                )}
                <div className={`flex-1 min-w-0 ${row.read_at ? "pl-3.5" : ""}`}>
                  <p className="text-sm text-foreground">{labelForNotification(row)}</p>
                  {row.payload.itemSummary && (
                    <p className="text-xs text-subtle mt-0.5 truncate">{row.payload.itemSummary}</p>
                  )}
                  {row.payload.rejectReason && (
                    <p className="text-xs text-danger mt-0.5">理由: {row.payload.rejectReason}</p>
                  )}
                  <p className="text-xs text-subtle mt-1">{formatDateTime(row.created_at)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
