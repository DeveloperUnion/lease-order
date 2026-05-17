"use client";

import { useState, useTransition } from "react";
import {
  acknowledgeExtensionsForOrder,
  rejectReturnsForOrder,
  scheduleReturnsForOrder,
} from "./actions";
import { ReasonModal } from "./request-actions";

type OfficeOption = { id: string; name: string };

export default function BulkActions({
  orderId,
  returnCount,
  extensionCount,
  offices,
  defaultDropoffOfficeId,
  defaultTransport,
  defaultDate,
}: {
  orderId: string;
  returnCount: number;
  extensionCount: number;
  offices: OfficeOption[];
  defaultDropoffOfficeId: string | null;
  defaultTransport: "pickup" | "dropoff" | null;
  defaultDate: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const [transportMethod, setTransportMethod] = useState<"pickup" | "dropoff">(
    defaultTransport ?? "pickup"
  );
  const [scheduledDate, setScheduledDate] = useState<string>(
    defaultDate ?? tomorrowIso()
  );
  const [dropoffOfficeId, setDropoffOfficeId] = useState<string>(
    defaultDropoffOfficeId ?? offices[0]?.id ?? ""
  );

  function handleSchedule() {
    setError(null);
    if (!scheduledDate) {
      setError("予定日を入力してください");
      return;
    }
    if (transportMethod === "dropoff" && !dropoffOfficeId) {
      setError("持ち込み先を選択してください");
      return;
    }
    startTransition(async () => {
      try {
        await scheduleReturnsForOrder(orderId, {
          transportMethod,
          scheduledDate,
          dropoffOfficeId: transportMethod === "dropoff" ? dropoffOfficeId : null,
        });
        setShowSchedule(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "処理に失敗しました");
      }
    });
  }

  function handleExtensions() {
    setError(null);
    startTransition(async () => {
      try {
        await acknowledgeExtensionsForOrder(orderId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "処理に失敗しました");
      }
    });
  }

  function handleReject() {
    setError(null);
    const trimmed = rejectReason.trim();
    if (!trimmed) {
      setError("却下理由を入力してください");
      return;
    }
    startTransition(async () => {
      try {
        await rejectReturnsForOrder(orderId, trimmed);
        setShowReject(false);
        setRejectReason("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "処理に失敗しました");
      }
    });
  }

  if (returnCount === 0 && extensionCount === 0) return null;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-2 flex-wrap justify-end">
        {returnCount > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowReject(true)}
              disabled={isPending}
              className="px-3 h-8 text-xs font-medium border border-rule rounded text-muted hover:text-danger hover:border-danger/40 disabled:opacity-50 transition-colors"
            >
              返却 {returnCount}件 を一括却下
            </button>
            <button
              type="button"
              onClick={() => setShowSchedule(true)}
              disabled={isPending}
              className="px-3 h-8 text-xs font-semibold bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              返却 {returnCount}件 を一括で予定確定
            </button>
          </>
        )}
        {extensionCount > 0 && (
          <button
            type="button"
            onClick={handleExtensions}
            disabled={isPending}
            className="px-3 h-8 text-xs font-semibold bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            延長 {extensionCount}件 を一括承認
          </button>
        )}
      </div>
      {isPending && <p className="text-[11px] text-subtle">処理中…</p>}
      {error && (
        <p role="alert" className="text-[11px] text-danger">
          {error}
        </p>
      )}
      {showReject && (
        <ReasonModal
          title="返却申請を一括で却下"
          label={`${returnCount} 件`}
          reason={rejectReason}
          setReason={setRejectReason}
          isPending={isPending}
          onCancel={() => {
            setShowReject(false);
            setRejectReason("");
          }}
          onConfirm={handleReject}
          confirmLabel="一括で却下"
          confirmTone="danger"
          reasonHint="顧客に通知されます"
          placeholder="納入数の確認が取れないため等"
        />
      )}
      {showSchedule && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="返却予定を一括確定"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-[2px]"
          onClick={() => !isPending && setShowSchedule(false)}
        >
          <div
            className="bg-surface w-full max-w-md rounded-[var(--radius-lg)] shadow-xl border border-rule overflow-hidden text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-rule">
              <h3 className="text-sm font-semibold text-foreground">返却予定を一括確定</h3>
              <p className="text-xs text-muted mt-0.5">
                この発注の未対応な返却申請 {returnCount} 件を同じ予定で確定します
              </p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  受け渡し方法
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTransportMethod("pickup")}
                    className={pillClass(transportMethod === "pickup")}
                  >
                    取りに行く
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransportMethod("dropoff")}
                    className={pillClass(transportMethod === "dropoff")}
                  >
                    業所に持ち込み
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  予定日
                </label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-surface-muted border border-rule rounded focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
              {transportMethod === "dropoff" && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">
                    持ち込み先
                  </label>
                  {offices.length === 0 ? (
                    <p className="text-xs text-danger">業所が登録されていません</p>
                  ) : (
                    <select
                      value={dropoffOfficeId}
                      onChange={(e) => setDropoffOfficeId(e.target.value)}
                      className="w-full h-10 px-3 text-sm bg-surface-muted border border-rule rounded focus:outline-none focus:ring-2 focus:ring-accent/40"
                    >
                      {offices.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-rule flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSchedule(false)}
                disabled={isPending}
                className="px-4 h-9 text-xs font-medium text-muted hover:text-foreground disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSchedule}
                disabled={isPending}
                className="px-4 h-9 text-xs font-semibold bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-50"
              >
                {isPending ? "処理中…" : "予定を確定"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function pillClass(active: boolean): string {
  return `h-10 px-3 rounded text-xs font-medium border transition-colors ${
    active
      ? "border-accent bg-accent/5 text-foreground"
      : "border-rule bg-surface text-muted hover:text-foreground"
  }`;
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
