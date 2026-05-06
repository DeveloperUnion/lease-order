"use client";

import { useEffect, useState } from "react";
import type { RentalItemRow } from "@/lib/rentals-data";

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function minNewEndDate(currentEnd: string | null): string {
  const today = tomorrowIso();
  if (!currentEnd) return today;
  return currentEnd >= today ? addDays(currentEnd, 1) : today;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function ExtendDialog({
  item,
  onConfirm,
  onCancel,
}: {
  item: RentalItemRow;
  onConfirm: (newEndDate: string, reason: string) => void;
  onCancel: () => void;
}) {
  const min = minNewEndDate(item.lease_end_date);
  const [newEndDate, setNewEndDate] = useState(min);
  const [reason, setReason] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newEndDate || newEndDate < min) return;
    onConfirm(newEndDate, reason.trim());
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-foreground/40 backdrop-blur-[2px]"
      onClick={onCancel}
    >
      <div
        className="bg-surface w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-xl border border-border overflow-hidden motion-safe:animate-[reveal-up_240ms_ease-out_both]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">期限を延長</h2>
          <p className="text-sm text-muted mt-0.5 truncate">{item.material_name}</p>
        </div>
        <form onSubmit={submit} className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              新しい返却期限 <span className="text-danger">*</span>
            </label>
            <input
              type="date"
              required
              min={min}
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
              className="w-full h-11 px-3.5 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 transition-colors"
            />
            {item.lease_end_date && (
              <p className="text-xs text-subtle mt-1.5">
                <span>現在の期限: </span>
                <span className="text-foreground tabular-nums">{item.lease_end_date}</span>
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">理由（任意）</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="例: 工期延長のため"
              className="w-full px-3.5 py-2.5 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 transition-colors"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 h-10 text-sm font-medium text-muted hover:text-foreground transition-colors"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!newEndDate || newEndDate < min}
              className="px-5 h-10 inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-[background,transform] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.99]"
            >
              延長を予約
              <span aria-hidden>→</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
