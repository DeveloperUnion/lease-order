import Link from "next/link";
import {
  listPendingRequests,
  listScheduledReturns,
  type PendingRequest,
  type PendingReturnRequest,
  type ScheduledReturnRequest,
} from "@/lib/admin-data";
import { getOffices } from "@/lib/data";
import { PageHeader, EmptyState } from "@/components/admin/ui";
import {
  ExtensionRequestActions,
  PendingReturnActions,
  ScheduledReturnActions,
} from "./request-actions";
import BulkActions from "./bulk-actions";

export const dynamic = "force-dynamic";

function formatDateLong(iso: string | null): string {
  if (!iso) return "未設定";
  const [y, m, d] = iso.split("-");
  return `${y}年${Number(m)}月${Number(d)}日`;
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = Math.floor((now - t) / 1000);
  if (diff < 60) return "たった今";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 時間前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 日前`;
  return new Date(iso).toLocaleDateString("ja-JP");
}

function transportLabel(
  method: "pickup" | "dropoff" | null,
  officeName: string | null
): string {
  if (method === "pickup") return "取りに来てもらう";
  if (method === "dropoff") return `持ち込み${officeName ? `（${officeName}）` : ""}`;
  return "未指定";
}

type PendingGroup = {
  orderId: string;
  orderNumber: string;
  siteName: string | null;
  companyName: string;
  contactName: string;
  items: PendingRequest[];
  defaultTransport: "pickup" | "dropoff" | null;
  defaultDate: string | null;
  defaultOfficeId: string | null;
};

function groupPending(items: PendingRequest[]): PendingGroup[] {
  const map = new Map<string, PendingGroup>();
  for (const it of items) {
    let g = map.get(it.order_id);
    if (!g) {
      g = {
        orderId: it.order_id,
        orderNumber: it.order_number,
        siteName: it.site_name,
        companyName: it.company_name,
        contactName: it.contact_name,
        items: [],
        defaultTransport: null,
        defaultDate: null,
        defaultOfficeId: null,
      };
      map.set(it.order_id, g);
    }
    g.items.push(it);
    if (it.type === "return") {
      g.defaultTransport ??= it.transport_method;
      g.defaultDate ??= it.desired_date;
      g.defaultOfficeId ??= it.dropoff_office_id;
    }
  }
  return Array.from(map.values());
}

type ScheduledGroup = {
  orderId: string;
  orderNumber: string;
  siteName: string | null;
  companyName: string;
  contactName: string;
  items: ScheduledReturnRequest[];
};

function groupScheduled(items: ScheduledReturnRequest[]): ScheduledGroup[] {
  const map = new Map<string, ScheduledGroup>();
  for (const it of items) {
    let g = map.get(it.order_id);
    if (!g) {
      g = {
        orderId: it.order_id,
        orderNumber: it.order_number,
        siteName: it.site_name,
        companyName: it.company_name,
        contactName: it.contact_name,
        items: [],
      };
      map.set(it.order_id, g);
    }
    g.items.push(it);
  }
  return Array.from(map.values());
}

export default async function AdminRequestsPage() {
  const [pending, scheduled, offices] = await Promise.all([
    listPendingRequests(),
    listScheduledReturns(),
    getOffices(),
  ]);
  const pendingGroups = groupPending(pending);
  const scheduledGroups = groupScheduled(scheduled);
  const officeOptions = offices.map((o) => ({ id: o.id, name: o.name }));

  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 space-y-8">
      <PageHeader
        title="返却・延長申請"
        description="顧客からの未対応の申請と、受領待ちの返却予定を確認します。"
      />

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">
            要対応
            <span className="ml-2 text-xs font-normal text-subtle">
              （顧客からの新規申請）
            </span>
          </h2>
          {pendingGroups.length === 0 ? (
            <EmptyState
              title="未対応の申請はありません"
              description="新しい申請が届くと、ここに表示されます。"
            />
          ) : (
            <div className="space-y-4">
              {pendingGroups.map((g) => (
                <article
                  key={g.orderId}
                  className="border border-rule rounded-[var(--radius-lg)] bg-surface overflow-hidden"
                >
                  <header className="px-5 py-4 border-b border-rule flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-[family-name:var(--font-mono)] text-xs text-subtle">
                        {g.orderNumber}
                      </p>
                      <h3 className="text-base font-semibold text-foreground truncate mt-0.5">
                        {g.siteName ?? "（現場未設定）"}
                      </h3>
                      <p className="text-xs text-muted mt-0.5">
                        {g.companyName} ／ {g.contactName}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Link
                        href={`/admin/orders/${g.orderId}`}
                        className="text-xs text-accent hover:underline whitespace-nowrap"
                      >
                        発注詳細 →
                      </Link>
                      <BulkActions
                        orderId={g.orderId}
                        returnCount={g.items.filter((it) => it.type === "return").length}
                        extensionCount={g.items.filter((it) => it.type === "extension").length}
                        offices={officeOptions}
                        defaultDropoffOfficeId={g.defaultOfficeId}
                        defaultTransport={g.defaultTransport}
                        defaultDate={g.defaultDate}
                      />
                    </div>
                  </header>
                  <ul className="divide-y divide-rule">
                    {g.items.map((r) => (
                      <li key={`${r.type}-${r.id}`} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span
                                className={`inline-flex items-center px-2 h-5 rounded-full text-[11px] font-semibold ${
                                  r.type === "return"
                                    ? "bg-info-soft text-info"
                                    : "bg-[var(--color-status-pending-bg)] text-[var(--color-status-pending-fg)]"
                                }`}
                              >
                                {r.type === "return" ? "返却" : "延長"}
                              </span>
                              <span className="text-sm font-medium text-foreground">
                                {r.material_name}
                              </span>
                              {r.type === "return" ? (
                                <span className="text-sm text-foreground tabular-nums">
                                  × {r.requested_quantity_delta}
                                </span>
                              ) : (
                                <span className="text-sm text-foreground tabular-nums">
                                  {formatDateLong(r.previous_end_date)} → {formatDateLong(r.new_end_date)}
                                </span>
                              )}
                            </div>
                            {r.type === "return" && (
                              <p className="text-xs text-muted mt-1">
                                希望: {transportLabel(r.transport_method, r.dropoff_office_name)}
                                {r.desired_date && ` ・ ${r.desired_date}`}
                              </p>
                            )}
                            {r.reason && (
                              <p className="text-xs text-muted mt-1">理由: {r.reason}</p>
                            )}
                            <p className="text-xs text-subtle mt-1">
                              {formatRelative(r.requested_at)}
                            </p>
                          </div>
                          {r.type === "return" ? (
                            <PendingReturnActions
                              requestId={r.id}
                              label={`${r.material_name} ×${r.requested_quantity_delta} の返却`}
                              desiredDate={(r as PendingReturnRequest).desired_date}
                              desiredTransport={(r as PendingReturnRequest).transport_method}
                              desiredDropoffOfficeId={(r as PendingReturnRequest).dropoff_office_id}
                              offices={officeOptions}
                            />
                          ) : (
                            <ExtensionRequestActions
                              requestId={r.id}
                              label={`${r.material_name} の期限延長`}
                            />
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">
            受領待ち
            <span className="ml-2 text-xs font-normal text-subtle">
              （予定確定済みの返却）
            </span>
          </h2>
          {scheduledGroups.length === 0 ? (
            <EmptyState
              title="受領待ちはありません"
              description="予定確定した返却が物理的に届いたら、ここから受領処理を行います。"
            />
          ) : (
            <div className="space-y-4">
              {scheduledGroups.map((g) => (
                <article
                  key={g.orderId}
                  className="border border-rule rounded-[var(--radius-lg)] bg-surface overflow-hidden"
                >
                  <header className="px-5 py-4 border-b border-rule flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-[family-name:var(--font-mono)] text-xs text-subtle">
                        {g.orderNumber}
                      </p>
                      <h3 className="text-base font-semibold text-foreground truncate mt-0.5">
                        {g.siteName ?? "（現場未設定）"}
                      </h3>
                      <p className="text-xs text-muted mt-0.5">
                        {g.companyName} ／ {g.contactName}
                      </p>
                    </div>
                    <Link
                      href={`/admin/orders/${g.orderId}`}
                      className="text-xs text-accent hover:underline whitespace-nowrap"
                    >
                      発注詳細 →
                    </Link>
                  </header>
                  <ul className="divide-y divide-rule">
                    {g.items.map((r) => (
                      <li key={r.id} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="inline-flex items-center px-2 h-5 rounded-full text-[11px] font-semibold bg-info-soft text-info">
                                返却予定
                              </span>
                              <span className="text-sm font-medium text-foreground">
                                {r.material_name}
                              </span>
                              <span className="text-sm text-foreground tabular-nums">
                                × {r.requested_quantity_delta}
                              </span>
                            </div>
                            <p className="text-xs text-muted mt-1">
                              {formatDateShort(r.scheduled_date)} ・{" "}
                              {transportLabel(r.transport_method, r.dropoff_office_name)}
                            </p>
                          </div>
                          <ScheduledReturnActions
                            requestId={r.id}
                            label={`${r.material_name} ×${r.requested_quantity_delta} の受領`}
                            requestedDelta={r.requested_quantity_delta}
                            materialName={r.material_name}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </section>
    </main>
  );
}
