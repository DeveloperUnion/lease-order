import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getTenantId } from "@/lib/tenant";
import {
  labelForNotification,
  linkForNotification,
  listNotificationsForAdmin,
} from "@/lib/notifications-data";
import { PageHeader, EmptyState } from "@/components/admin/ui";
import { markAllAdminNotificationsRead } from "./actions";

export const dynamic = "force-dynamic";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default async function AdminNotificationsPage() {
  const tenantId = await getTenantId();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const adminEmail = user?.email?.toLowerCase() ?? "";
  const { data: adminRow } = adminEmail
    ? await supabaseAdmin
        .from("admin_users")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("email", adminEmail)
        .maybeSingle()
    : { data: null };

  const rows = adminRow
    ? await listNotificationsForAdmin((adminRow as { id: string }).id, tenantId, 100)
    : [];
  const hasUnread = rows.some((r) => !r.read_at);

  return (
    <main className="flex-1 overflow-y-auto px-6 sm:px-10 py-8">
      <div className="max-w-3xl mx-auto">
        <PageHeader
          eyebrow="NOTIFICATIONS"
          title="通知"
          description="最近の通知を時系列で表示します。"
          actions={
            hasUnread ? (
              <form action={markAllAdminNotificationsRead}>
                <button
                  type="submit"
                  className="text-xs text-accent hover:underline"
                >
                  すべて既読にする
                </button>
              </form>
            ) : null
          }
        />

        {rows.length === 0 ? (
          <EmptyState title="通知はありません" />
        ) : (
          <ul className="border border-rule bg-surface rounded-[var(--radius-lg)] overflow-hidden divide-y divide-rule">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={linkForNotification(row, "admin")}
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
      </div>
    </main>
  );
}
