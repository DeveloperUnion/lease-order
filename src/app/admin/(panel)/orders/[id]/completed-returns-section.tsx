import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSupabaseTenant } from "@/lib/supabase-tenant";
import { getTenantId } from "@/lib/tenant";
import { SectionRule } from "@/components/admin/ui";

type CompletedReturn = {
  id: string;
  material_name: string;
  requested_quantity_delta: number;
  received_quantity: number | null;
  cancelled_quantity: number;
  lost_quantity: number;
  damaged_quantity: number;
  damage_notes: string | null;
  completed_at: string | null;
  ai_model: string | null;
  ai_invoked_at: string | null;
  photos: { id: string; signedUrl: string }[];
};

const SIGNED_URL_TTL = 60 * 15;

async function loadCompletedReturns(orderId: string, tenantId: string): Promise<CompletedReturn[]> {
  const supabase = await getSupabaseTenant();
  const { data: rows } = await supabase
    .from("return_requests")
    .select(
      `id, requested_quantity_delta, received_quantity, cancelled_quantity, lost_quantity,
       damaged_quantity, damage_notes, completed_at, ai_model, ai_invoked_at,
       order_items!inner(id, material_name, order_id)`
    )
    .eq("tenant_id", tenantId)
    .eq("status", "completed")
    .eq("order_items.order_id", orderId)
    .order("completed_at", { ascending: false });
  if (!rows || rows.length === 0) return [];

  type Row = {
    id: string;
    requested_quantity_delta: number;
    received_quantity: number | null;
    cancelled_quantity: number;
    lost_quantity: number;
    damaged_quantity: number;
    damage_notes: string | null;
    completed_at: string | null;
    ai_model: string | null;
    ai_invoked_at: string | null;
    order_items: { material_name: string } | null;
  };
  const typed = rows as unknown as Row[];

  const ids = typed.map((r) => r.id);
  const { data: photoRows } = await supabase
    .from("return_photos")
    .select("id, return_request_id, storage_path, sort_order")
    .in("return_request_id", ids)
    .order("sort_order", { ascending: true });

  const photosByRequest = new Map<string, { id: string; signedUrl: string }[]>();
  for (const p of photoRows ?? []) {
    const { data: signed } = await supabaseAdmin.storage
      .from("return-photos")
      .createSignedUrl(p.storage_path as string, SIGNED_URL_TTL);
    if (!signed) continue;
    const key = p.return_request_id as string;
    const list = photosByRequest.get(key) ?? [];
    list.push({ id: p.id as string, signedUrl: signed.signedUrl });
    photosByRequest.set(key, list);
  }

  return typed.map((r) => ({
    id: r.id,
    material_name: r.order_items?.material_name ?? "(不明)",
    requested_quantity_delta: r.requested_quantity_delta,
    received_quantity: r.received_quantity,
    cancelled_quantity: r.cancelled_quantity,
    lost_quantity: r.lost_quantity,
    damaged_quantity: r.damaged_quantity,
    damage_notes: r.damage_notes,
    completed_at: r.completed_at,
    ai_model: r.ai_model,
    ai_invoked_at: r.ai_invoked_at,
    photos: photosByRequest.get(r.id) ?? [],
  }));
}

function fmtDateTime(s: string | null): string {
  return s ? new Date(s).toLocaleString("ja-JP") : "—";
}

export default async function CompletedReturnsSection({ orderId }: { orderId: string }) {
  const tenantId = await getTenantId();
  const items = await loadCompletedReturns(orderId, tenantId);
  if (items.length === 0) return null;

  return (
    <section className="mb-10">
      <SectionRule
        label="受領履歴"
        right={
          <span className="font-[family-name:var(--font-mono)] tabular-nums text-[11px] text-subtle">
            {items.length} 件
          </span>
        }
        className="mb-3"
      />
      <ul className="space-y-3">
        {items.map((r) => (
          <li
            key={r.id}
            className="border border-rule rounded-[var(--radius-lg)] bg-surface px-4 py-3"
          >
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {r.material_name}{" "}
                  <span className="text-subtle text-xs tabular-nums">×{r.requested_quantity_delta}</span>
                </p>
                <p className="text-xs text-muted mt-0.5 tabular-nums">
                  受領 {r.received_quantity ?? 0}
                  {r.cancelled_quantity > 0 && ` / キャンセル ${r.cancelled_quantity}`}
                  {r.lost_quantity > 0 && ` / 損失 ${r.lost_quantity}`}
                  {r.damaged_quantity > 0 && (
                    <span className="text-warning"> / 損傷 {r.damaged_quantity}</span>
                  )}
                </p>
              </div>
              <span className="font-[family-name:var(--font-mono)] text-[10px] text-subtle">
                {fmtDateTime(r.completed_at)}
              </span>
            </div>
            {r.damage_notes && (
              <p className="mt-2 text-xs text-muted whitespace-pre-wrap">
                備考: {r.damage_notes}
              </p>
            )}
            {r.photos.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {r.photos.map((p) => (
                  <a key={p.id} href={p.signedUrl} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.signedUrl}
                      alt="受領写真"
                      className="w-20 h-20 object-cover rounded border border-rule hover:opacity-90 transition-opacity"
                    />
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-subtle">写真なし</p>
            )}
            {r.ai_model && r.ai_invoked_at && (
              <p className="mt-2 text-[10px] text-subtle">
                AI: {r.ai_model} ・ {fmtDateTime(r.ai_invoked_at)}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
