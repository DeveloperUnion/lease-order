"use client";

import { useState, useTransition } from "react";
import {
  acknowledgeExtension,
  acknowledgeReturn,
  rejectExtension,
  rejectReturn,
} from "./actions";

export default function RequestActions({
  requestId,
  type,
  label,
}: {
  requestId: string;
  type: "return" | "extension";
  label: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleAck() {
    setError(null);
    startTransition(async () => {
      try {
        if (type === "return") await acknowledgeReturn(requestId);
        else await acknowledgeExtension(requestId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "処理に失敗しました");
      }
    });
  }

  function handleReject() {
    setError(null);
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("却下理由を入力してください");
      return;
    }
    startTransition(async () => {
      try {
        if (type === "return") await rejectReturn(requestId, trimmed);
        else await rejectExtension(requestId, trimmed);
        setShowReject(false);
        setReason("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "処理に失敗しました");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2 flex-shrink-0">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setShowReject(true)}
          disabled={isPending}
          className="px-3 h-8 text-xs font-medium border border-rule rounded text-muted hover:text-danger hover:border-danger/40 disabled:opacity-50 transition-colors"
        >
          却下
        </button>
        <button
          type="button"
          onClick={handleAck}
          disabled={isPending}
          className="px-3 h-8 text-xs font-semibold bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {isPending ? "処理中…" : "承認"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[11px] text-danger">
          {error}
        </p>
      )}
      {showReject && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${label} を却下`}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-[2px]"
          onClick={() => !isPending && setShowReject(false)}
        >
          <div
            className="bg-surface w-full max-w-md rounded-[var(--radius-lg)] shadow-xl border border-rule overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-rule">
              <h3 className="text-sm font-semibold text-foreground">申請を却下</h3>
              <p className="text-xs text-muted mt-0.5 truncate">{label}</p>
            </div>
            <div className="px-5 py-4">
              <label className="block text-xs font-medium text-foreground mb-1.5">
                却下理由（顧客に通知されます）
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-sm bg-surface-muted border border-rule rounded resize-none focus:outline-none focus:ring-2 focus:ring-accent/40"
                placeholder="在庫不足のため等"
                disabled={isPending}
              />
            </div>
            <div className="px-5 py-4 border-t border-rule flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowReject(false)}
                disabled={isPending}
                className="px-4 h-9 text-xs font-medium text-muted hover:text-foreground disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={isPending}
                className="px-4 h-9 text-xs font-semibold bg-danger text-white rounded hover:bg-danger/90 disabled:opacity-50"
              >
                {isPending ? "処理中…" : "却下する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
