"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RentalItemRow } from "@/lib/rentals-data";
import { processItemActions, type ItemAction } from "../actions";
import ConfirmModal from "./confirm-modal";

type Mode = "return" | "extend";

type Props = {
  orderId: string;
  items: RentalItemRow[];
  extensions: Record<
    string,
    { previous_end_date: string; new_end_date: string; reason: string | null; requested_at: string }[]
  >;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${m}/${d}`;
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function ReturnForm({ orderId, items, extensions }: Props) {
  const router = useRouter();

  const returnableItems = useMemo(
    () => items.filter((it) => it.effective_remaining > 0),
    [items]
  );
  const extendableItems = useMemo(
    () => items.filter((it) => !it.pending_extension && it.lease_end_date),
    [items]
  );

  const [mode, setMode] = useState<Mode>(
    returnableItems.length > 0 ? "return" : "extend"
  );

  // 返却モード: デフォルトで全品目チェック。除外したい品目を保持
  const [returnExcluded, setReturnExcluded] = useState<Set<string>>(new Set());

  // 延長モード: 単一の新返却日 + 理由をデフォルトで全品目に適用
  const latestEnd = useMemo(() => {
    let latest: string | null = null;
    for (const it of extendableItems) {
      if (!it.lease_end_date) continue;
      if (!latest || it.lease_end_date > latest) latest = it.lease_end_date;
    }
    return latest;
  }, [extendableItems]);
  const minExtendDate = useMemo(() => {
    const t = tomorrowIso();
    if (!latestEnd) return t;
    return latestEnd >= t ? addDays(latestEnd, 1) : t;
  }, [latestEnd]);
  const [extendDate, setExtendDate] = useState<string>("");
  const [extendReason, setExtendReason] = useState<string>("");
  const [extendExcluded, setExtendExcluded] = useState<Set<string>>(new Set());
  const [extendOverrides, setExtendOverrides] = useState<Record<string, string>>({});

  const [showConfirm, setShowConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const returnTargets = useMemo(
    () => returnableItems.filter((it) => !returnExcluded.has(it.id)),
    [returnableItems, returnExcluded]
  );
  const extendTargets = useMemo(
    () => extendableItems.filter((it) => !extendExcluded.has(it.id)),
    [extendableItems, extendExcluded]
  );

  const actions: ItemAction[] = useMemo(() => {
    if (mode === "return") {
      return returnTargets.map((it) => ({
        type: "return" as const,
        orderItemId: it.id,
        deltaQuantity: it.effective_remaining,
      }));
    }
    if (!extendDate) return [];
    return extendTargets.map((it) => ({
      type: "extend" as const,
      orderItemId: it.id,
      newEndDate: extendOverrides[it.id] ?? extendDate,
      reason: extendReason || undefined,
    }));
  }, [mode, returnTargets, extendTargets, extendDate, extendReason, extendOverrides]);

  const canSubmit =
    mode === "return"
      ? returnTargets.length > 0
      : Boolean(extendDate) && extendDate >= minExtendDate && extendTargets.length > 0;

  function toggleReturnExclude(id: string) {
    setReturnExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExtendExclude(id: string) {
    setExtendExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setExtendOverride(id: string, date: string) {
    setExtendOverrides((prev) => {
      const next = { ...prev };
      if (!date || date === extendDate) delete next[id];
      else next[id] = date;
      return next;
    });
  }

  function handleSubmit() {
    if (!canSubmit) {
      setErrorMessage("申請対象がありません");
      return;
    }
    setErrorMessage(null);
    startTransition(async () => {
      const result = await processItemActions({ orderId, actions });
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      setShowConfirm(false);
      router.push("/rentals");
      router.refresh();
    });
  }

  const extendPreview = useMemo(
    () =>
      extendTargets.map((it) => ({
        item: it,
        newEndDate: extendOverrides[it.id] ?? extendDate,
      })),
    [extendTargets, extendOverrides, extendDate]
  );

  const submitLabel =
    mode === "return"
      ? `返却申請をする（${returnTargets.length}品目）`
      : `延長申請をする（${extendTargets.length}品目）`;

  return (
    <>
      {/* Mode tabs */}
      <div role="tablist" aria-label="申請種別" className="flex gap-2 mb-4">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "return"}
          disabled={returnableItems.length === 0}
          onClick={() => setMode("return")}
          className={`flex-1 h-11 rounded-lg text-sm font-semibold border transition-colors ${
            mode === "return"
              ? "bg-accent text-white border-accent"
              : "bg-surface text-muted border-border hover:text-foreground disabled:opacity-40 disabled:hover:text-muted"
          }`}
        >
          返却する
          {returnableItems.length > 0 && (
            <span className="ml-1.5 text-xs opacity-80 tabular-nums">
              ({returnableItems.length})
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "extend"}
          disabled={extendableItems.length === 0}
          onClick={() => setMode("extend")}
          className={`flex-1 h-11 rounded-lg text-sm font-semibold border transition-colors ${
            mode === "extend"
              ? "bg-accent text-white border-accent"
              : "bg-surface text-muted border-border hover:text-foreground disabled:opacity-40 disabled:hover:text-muted"
          }`}
        >
          期限を延長する
          {extendableItems.length > 0 && (
            <span className="ml-1.5 text-xs opacity-80 tabular-nums">
              ({extendableItems.length})
            </span>
          )}
        </button>
      </div>

      {mode === "return" && returnableItems.length > 0 && (
        <section className="border border-border bg-surface rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground">
            この発注の資材を一括で返却申請します
          </h3>
          <p className="text-xs text-muted mt-1">
            対象: <span className="font-semibold text-foreground tabular-nums">{returnTargets.length}</span>{" "}
            / {returnableItems.length} 品目
            {returnExcluded.size > 0 && (
              <span className="ml-2 text-subtle">（{returnExcluded.size} 件を除外中）</span>
            )}
          </p>

          <details className="mt-4 border-t border-border pt-3 group">
            <summary className="cursor-pointer text-xs font-medium text-muted hover:text-foreground inline-flex items-center gap-1.5">
              <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
              品目ごとに調整する
            </summary>
            <ul className="mt-3 divide-y divide-border">
              {returnableItems.map((it) => {
                const excluded = returnExcluded.has(it.id);
                return (
                  <li key={it.id} className="py-2.5 flex items-start gap-3">
                    <input
                      id={`ret-${it.id}`}
                      type="checkbox"
                      checked={!excluded}
                      onChange={() => toggleReturnExclude(it.id)}
                      className="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-2 focus:ring-accent/40"
                    />
                    <label htmlFor={`ret-${it.id}`} className="flex-1 min-w-0 cursor-pointer">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-sm text-foreground">{it.material_name}</span>
                        {it.is_overdue && (
                          <span className="inline-flex items-center px-1.5 h-[18px] rounded-full text-[10px] font-semibold bg-danger-soft text-danger">
                            期限超過
                          </span>
                        )}
                        {it.pending_return_delta > 0 && (
                          <span className="inline-flex items-center px-1.5 h-[18px] rounded-full text-[10px] font-semibold bg-info-soft text-info">
                            申請中 {it.pending_return_delta}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-subtle mt-0.5 tabular-nums">
                        返却数 × {it.effective_remaining}
                        {it.lease_end_date && (
                          <>
                            <span className="mx-1.5">·</span>
                            期限 {formatDate(it.lease_end_date)}
                          </>
                        )}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </details>
        </section>
      )}

      {mode === "extend" && extendableItems.length > 0 && (
        <section className="border border-border bg-surface rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              この発注の資材を一括で延長申請します
            </h3>
            <p className="text-xs text-muted mt-1">
              対象: <span className="font-semibold text-foreground tabular-nums">{extendTargets.length}</span>{" "}
              / {extendableItems.length} 品目
              {latestEnd && (
                <span className="ml-2 text-subtle">
                  （現在の最遅期限 {formatDate(latestEnd)}）
                </span>
              )}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              新しい返却期限 <span className="text-danger">*</span>
            </label>
            <input
              type="date"
              required
              min={minExtendDate}
              value={extendDate}
              onChange={(e) => setExtendDate(e.target.value)}
              className="w-full h-11 px-3.5 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 transition-colors"
            />
            <p className="text-xs text-subtle mt-1.5">
              {minExtendDate} 以降を指定できます
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              理由（任意）
            </label>
            <textarea
              value={extendReason}
              onChange={(e) => setExtendReason(e.target.value)}
              rows={2}
              placeholder="例: 工期延長のため"
              className="w-full px-3.5 py-2.5 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 transition-colors"
            />
          </div>

          <details className="border-t border-border pt-3 group">
            <summary className="cursor-pointer text-xs font-medium text-muted hover:text-foreground inline-flex items-center gap-1.5">
              <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
              品目ごとに調整する
            </summary>
            <ul className="mt-3 divide-y divide-border">
              {extendableItems.map((it) => {
                const excluded = extendExcluded.has(it.id);
                const override = extendOverrides[it.id];
                const itemMin =
                  it.lease_end_date && it.lease_end_date >= tomorrowIso()
                    ? addDays(it.lease_end_date, 1)
                    : tomorrowIso();
                return (
                  <li key={it.id} className="py-2.5 flex items-start gap-3">
                    <input
                      id={`ext-${it.id}`}
                      type="checkbox"
                      checked={!excluded}
                      onChange={() => toggleExtendExclude(it.id)}
                      className="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-2 focus:ring-accent/40"
                    />
                    <div className="flex-1 min-w-0">
                      <label htmlFor={`ext-${it.id}`} className="cursor-pointer">
                        <span className="text-sm text-foreground">{it.material_name}</span>
                        <span className="ml-2 text-xs text-subtle tabular-nums">
                          現在: {formatDate(it.lease_end_date)}
                          {extensions[it.id]?.length > 0 && (
                            <> · 延長 {extensions[it.id].length} 回</>
                          )}
                        </span>
                      </label>
                      <div className="mt-1.5">
                        <input
                          type="date"
                          min={itemMin}
                          value={override ?? ""}
                          onChange={(e) => setExtendOverride(it.id, e.target.value)}
                          disabled={excluded}
                          placeholder={extendDate}
                          className="h-8 px-2 text-xs bg-surface border border-border rounded focus:outline-none focus:border-accent disabled:opacity-50"
                        />
                        {!override && extendDate && !excluded && (
                          <span className="ml-2 text-xs text-subtle">
                            （一括 {formatDate(extendDate)} を適用）
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </details>
        </section>
      )}

      {mode === "return" && returnableItems.length === 0 && (
        <div className="border border-border bg-surface rounded-xl p-8 text-center">
          <p className="text-sm text-muted">返却可能な品目はありません</p>
        </div>
      )}
      {mode === "extend" && extendableItems.length === 0 && (
        <div className="border border-border bg-surface rounded-xl p-8 text-center">
          <p className="text-sm text-muted">延長申請できる品目はありません</p>
        </div>
      )}

      {errorMessage && (
        <div role="alert" className="mt-4 px-3 py-2 rounded-lg border border-danger/30 bg-danger-soft text-sm text-danger">
          {errorMessage}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 md:left-56 bg-surface/95 backdrop-blur border-t border-border px-4 py-3 z-40 pb-[calc(0.75rem+env(safe-area-inset-bottom,0))] md:pb-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="flex-1 text-xs text-muted">
            {!canSubmit && mode === "return" && (
              <span className="text-subtle">返却対象を選択してください</span>
            )}
            {!canSubmit && mode === "extend" && (
              <span className="text-subtle">新しい返却期限を入力してください</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={!canSubmit || isPending}
            className="px-5 h-11 inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-[background,transform] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.99]"
          >
            {submitLabel}
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>

      {showConfirm && (
        <ConfirmModal
          returns={mode === "return" ? returnTargets : []}
          extensions={mode === "extend" ? extendPreview : []}
          isPending={isPending}
          onConfirm={handleSubmit}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
