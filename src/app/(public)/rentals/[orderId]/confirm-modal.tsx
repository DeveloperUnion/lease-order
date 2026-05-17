"use client";

import { useEffect } from "react";
import type { RentalItemRow } from "@/lib/rentals-data";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${m}/${d}`;
}

export default function ConfirmModal({
  returns,
  returnTransport,
  extensions,
  isPending,
  onConfirm,
  onCancel,
}: {
  returns: RentalItemRow[];
  returnTransport: {
    transportMethod: "pickup" | "dropoff";
    desiredDate: string;
    dropoffOfficeName: string | null;
  } | null;
  extensions: { item: RentalItemRow; newEndDate: string }[];
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPending) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, isPending]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-foreground/40 backdrop-blur-[2px]"
      onClick={() => !isPending && onCancel()}
    >
      <div
        className="bg-surface w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-xl border border-border overflow-hidden motion-safe:animate-[reveal-up_240ms_ease-out_both]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">申請内容の確認</h2>
          <p className="text-sm text-muted mt-0.5">以下の内容でリース会社に申請します。承認まで反映されません。</p>
        </div>

        <div className="px-5 py-4 space-y-6 max-h-[60vh] overflow-y-auto">
          {returns.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-2 pb-1.5 border-b border-border">
                返却申請 <span className="text-subtle font-normal">({returns.length})</span>
              </h3>
              {returnTransport && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-surface-muted text-xs text-muted space-y-0.5">
                  <div>
                    <span className="text-subtle">返却方法:</span>{" "}
                    <span className="text-foreground font-medium">
                      {returnTransport.transportMethod === "pickup"
                        ? "取りに来てもらう"
                        : `業所に持ち込む${
                            returnTransport.dropoffOfficeName
                              ? `（${returnTransport.dropoffOfficeName}）`
                              : ""
                          }`}
                    </span>
                  </div>
                  <div>
                    <span className="text-subtle">希望日:</span>{" "}
                    <span className="text-foreground font-medium tabular-nums">
                      {returnTransport.desiredDate}
                    </span>
                  </div>
                </div>
              )}
              <ul className="divide-y divide-border">
                {returns.map((it) => (
                  <li
                    key={it.id}
                    className="flex items-baseline justify-between gap-3 py-2 text-sm"
                  >
                    <span className="text-foreground truncate">{it.material_name}</span>
                    <span className="text-foreground flex-shrink-0 tabular-nums">× {it.effective_remaining}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {extensions.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-2 pb-1.5 border-b border-border">
                延長申請 <span className="text-subtle font-normal">({extensions.length})</span>
              </h3>
              <ul className="divide-y divide-border">
                {extensions.map(({ item, newEndDate }) => (
                  <li
                    key={item.id}
                    className="flex items-baseline justify-between gap-3 py-2 text-sm"
                  >
                    <span className="text-foreground truncate">{item.material_name}</span>
                    <span className="text-info flex-shrink-0 tabular-nums">
                      {formatDate(item.lease_end_date)} → {formatDate(newEndDate)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-4 h-10 text-sm font-medium text-muted hover:text-foreground disabled:opacity-50 transition-colors"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="px-5 h-10 inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-[background,transform] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.99]"
          >
            {isPending ? "送信中…" : "申請する"}
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
