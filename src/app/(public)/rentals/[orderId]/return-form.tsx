"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RentalItemRow } from "@/lib/rentals-data";
import { processItemActions } from "../actions";
import ExtendDialog from "./extend-dialog";
import ConfirmModal from "./confirm-modal";

type RowState =
  | { kind: "return" }
  | { kind: "extend"; newEndDate: string; reason: string }
  | { kind: "skip" };

type Props = {
  orderId: string;
  items: RentalItemRow[];
  extensions: Record<string, { previous_end_date: string; new_end_date: string; reason: string | null; requested_at: string }[]>;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${m}/${d}`;
}

export default function ReturnForm({ orderId, items, extensions }: Props) {
  const router = useRouter();
  const [states, setStates] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const it of items) {
      // 既定: 操作可能なら「返却」、そうでなければ「skip」（表示のみ）
      init[it.id] = it.effective_remaining > 0 ? { kind: "return" } : { kind: "skip" };
    }
    return init;
  });
  const [extendingId, setExtendingId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const summary = useMemo(() => {
    const returns = items.filter((it) => states[it.id]?.kind === "return" && it.effective_remaining > 0);
    const extendsItems = items.filter((it) => states[it.id]?.kind === "extend");
    return { returns, extendsItems };
  }, [items, states]);

  function handleToggle(itemId: string, checked: boolean) {
    setStates((prev) => ({ ...prev, [itemId]: checked ? { kind: "return" } : { kind: "skip" } }));
  }

  function handleExtendOpen(itemId: string) {
    setExtendingId(itemId);
  }

  function handleExtendConfirm(itemId: string, newEndDate: string, reason: string) {
    setStates((prev) => ({ ...prev, [itemId]: { kind: "extend", newEndDate, reason } }));
    setExtendingId(null);
  }

  function handleExtendCancel(itemId: string) {
    const it = items.find((i) => i.id === itemId);
    setStates((prev) => ({
      ...prev,
      [itemId]: it && it.effective_remaining > 0 ? { kind: "return" } : { kind: "skip" },
    }));
  }

  const extendingItem = extendingId ? items.find((it) => it.id === extendingId) ?? null : null;

  function handleSubmit() {
    const actions = items
      .map((it) => {
        const s = states[it.id];
        if (!s) return null;
        if (s.kind === "return") {
          if (it.effective_remaining <= 0) return null;
          return { type: "return" as const, orderItemId: it.id, deltaQuantity: it.effective_remaining };
        }
        if (s.kind === "extend") {
          return { type: "extend" as const, orderItemId: it.id, newEndDate: s.newEndDate, reason: s.reason };
        }
        return null;
      })
      .filter((a): a is NonNullable<typeof a> => Boolean(a));

    if (actions.length === 0) {
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

  const hasAnyAction = summary.returns.length > 0 || summary.extendsItems.length > 0;

  return (
    <>
      <div className="border border-border bg-surface rounded-xl overflow-hidden">
        {items.map((it) => {
          const state = states[it.id] ?? { kind: "skip" as const };
          const checked = state.kind === "return" && it.effective_remaining > 0;
          const isReturnable = it.effective_remaining > 0;
          const hasPendingExtension = it.pending_extension !== null;
          const overdueBorder = it.is_overdue ? "border-l-2 border-l-danger pl-4" : "pl-5";
          return (
            <div key={it.id} className={`pr-4 sm:pr-5 py-4 border-b border-border last:border-b-0 ${overdueBorder}`}>
              <div className="flex items-start gap-3">
                {isReturnable ? (
                  <input
                    id={`r-${it.id}`}
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => handleToggle(it.id, e.target.checked)}
                    disabled={state.kind === "extend"}
                    className="mt-1 h-5 w-5 rounded border-border text-accent focus:ring-2 focus:ring-accent/40 disabled:opacity-40"
                  />
                ) : (
                  <div className="mt-1 h-5 w-5 flex-shrink-0" aria-hidden />
                )}
                <div className="flex-1 min-w-0">
                  <label
                    htmlFor={isReturnable ? `r-${it.id}` : undefined}
                    className={`block ${isReturnable ? "cursor-pointer" : ""}`}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-sm font-semibold text-foreground">{it.material_name}</span>
                      {it.is_overdue && (
                        <span className="inline-flex items-center px-2 h-[20px] rounded-full text-[11px] font-semibold bg-danger-soft text-danger">
                          期限超過
                        </span>
                      )}
                      {it.pending_return_delta > 0 && (
                        <span className="inline-flex items-center px-2 h-[20px] rounded-full text-[11px] font-semibold bg-info-soft text-info">
                          返却申請中 {it.pending_return_delta}
                        </span>
                      )}
                      {hasPendingExtension && (
                        <span className="inline-flex items-center px-2 h-[20px] rounded-full text-[11px] font-semibold bg-info-soft text-info">
                          延長申請中
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-subtle mt-0.5 tabular-nums">
                      <span className="text-foreground">× {it.quantity}</span>
                      {it.returned_quantity > 0 && (
                        <>
                          <span className="mx-1.5 text-subtle">·</span>
                          <span>返却済 {it.returned_quantity}</span>
                        </>
                      )}
                      {it.lease_end_date && (
                        <>
                          <span className="mx-1.5 text-subtle">·</span>
                          <span>期限 {formatDate(it.lease_end_date)}</span>
                        </>
                      )}
                    </div>
                  </label>

                  {state.kind === "extend" && (
                    <div className="mt-2 inline-flex items-center gap-2 px-2.5 h-7 bg-info-soft border border-info/30 rounded-full text-xs text-info">
                      <span>→ 延長予定 {formatDate(state.newEndDate)}</span>
                      <button
                        type="button"
                        onClick={() => handleExtendCancel(it.id)}
                        className="text-xs text-info hover:text-info/80 underline"
                      >
                        取消
                      </button>
                    </div>
                  )}

                  {it.pending_extension && (
                    <div className="mt-2 text-xs text-info">
                      申請中: {formatDate(it.pending_extension.new_end_date)} まで延長
                    </div>
                  )}

                  {extensions[it.id]?.length > 0 && (
                    <details className="mt-2 text-xs text-subtle">
                      <summary className="cursor-pointer text-xs hover:text-foreground">
                        延長履歴 ({extensions[it.id].length})
                      </summary>
                      <ul className="mt-1.5 space-y-0.5 ml-2 text-xs tabular-nums">
                        {extensions[it.id].map((e, i) => (
                          <li key={i}>
                            <span className="text-subtle">{formatDate(e.previous_end_date)}</span>
                            <span aria-hidden className="mx-1">→</span>
                            <span className="text-foreground">{formatDate(e.new_end_date)}</span>
                            {e.reason && <span className="text-subtle"> （{e.reason}）</span>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {state.kind !== "extend" && !hasPendingExtension && (
                    <button
                      type="button"
                      onClick={() => handleExtendOpen(it.id)}
                      className="px-3 h-8 inline-flex items-center text-xs font-semibold border border-border bg-surface rounded-lg hover:bg-surface-muted hover:border-border-strong transition-colors"
                    >
                      延長
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {errorMessage && (
        <div role="alert" className="mt-4 px-3 py-2 rounded-lg border border-danger/30 bg-danger-soft text-sm text-danger">
          {errorMessage}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 md:left-56 bg-surface/95 backdrop-blur border-t border-border px-4 py-3 z-40 pb-[calc(0.75rem+env(safe-area-inset-bottom,0))] md:pb-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="flex-1 text-xs text-muted">
            {summary.returns.length > 0 && (
              <span className="mr-3">
                <span className="text-subtle">返却申請</span> {summary.returns.length}
              </span>
            )}
            {summary.extendsItems.length > 0 && (
              <span className="mr-3">
                <span className="text-subtle">延長申請</span> {summary.extendsItems.length}
              </span>
            )}
            {!hasAnyAction && <span className="text-subtle">申請対象を選択してください</span>}
          </div>
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={!hasAnyAction || isPending}
            className="px-5 h-11 inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-[background,transform] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.99]"
          >
            申請する
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>

      {extendingItem && (
        <ExtendDialog
          item={extendingItem}
          onConfirm={(newEndDate, reason) => handleExtendConfirm(extendingItem.id, newEndDate, reason)}
          onCancel={() => setExtendingId(null)}
        />
      )}

      {showConfirm && (
        <ConfirmModal
          returns={summary.returns}
          extensions={summary.extendsItems.map((it) => {
            const s = states[it.id];
            return { item: it, newEndDate: s?.kind === "extend" ? s.newEndDate : "" };
          })}
          isPending={isPending}
          onConfirm={handleSubmit}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
