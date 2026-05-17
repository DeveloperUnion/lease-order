"use client";

import { useState, useTransition } from "react";
import {
  acknowledgeExtension,
  cancelScheduledReturn,
  completeReturn,
  rejectExtension,
  rejectReturn,
  scheduleReturn,
} from "./actions";
import InspectionPhotos, { type AiPrefill } from "./inspection-photos";

type OfficeOption = { id: string; name: string };

// ============================================================
// 期限延長申請（既存と同じ：承認 / 却下）
// ============================================================

export function ExtensionRequestActions({
  requestId,
  label,
}: {
  requestId: string;
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
        await acknowledgeExtension(requestId);
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
        await rejectExtension(requestId, trimmed);
        setShowReject(false);
        setReason("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "処理に失敗しました");
      }
    });
  }

  return (
    <ActionShell error={error}>
      <button
        type="button"
        onClick={() => setShowReject(true)}
        disabled={isPending}
        className={rejectButtonClass}
      >
        却下
      </button>
      <button
        type="button"
        onClick={handleAck}
        disabled={isPending}
        className={primaryButtonClass}
      >
        {isPending ? "処理中…" : "承認"}
      </button>
      {showReject && (
        <ReasonModal
          title="期限延長を却下"
          label={label}
          reason={reason}
          setReason={setReason}
          isPending={isPending}
          onCancel={() => setShowReject(false)}
          onConfirm={handleReject}
          confirmLabel="却下する"
          confirmTone="danger"
          reasonHint="顧客に通知されます"
          placeholder="在庫不足のため等"
        />
      )}
    </ActionShell>
  );
}

// ============================================================
// 返却 pending：予定確定 / 却下
// ============================================================

export function PendingReturnActions({
  requestId,
  label,
  desiredDate,
  desiredTransport,
  desiredDropoffOfficeId,
  offices,
}: {
  requestId: string;
  label: string;
  desiredDate: string | null;
  desiredTransport: "pickup" | "dropoff" | null;
  desiredDropoffOfficeId: string | null;
  offices: OfficeOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [showSchedule, setShowSchedule] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [transportMethod, setTransportMethod] = useState<"pickup" | "dropoff">(
    desiredTransport ?? "pickup"
  );
  const [scheduledDate, setScheduledDate] = useState<string>(
    desiredDate ?? tomorrowIso()
  );
  const [dropoffOfficeId, setDropoffOfficeId] = useState<string>(
    desiredDropoffOfficeId ?? offices[0]?.id ?? ""
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
        await scheduleReturn(requestId, {
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

  function handleReject() {
    setError(null);
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("却下理由を入力してください");
      return;
    }
    startTransition(async () => {
      try {
        await rejectReturn(requestId, trimmed);
        setShowReject(false);
        setReason("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "処理に失敗しました");
      }
    });
  }

  return (
    <ActionShell error={error}>
      <button
        type="button"
        onClick={() => setShowReject(true)}
        disabled={isPending}
        className={rejectButtonClass}
      >
        却下
      </button>
      <button
        type="button"
        onClick={() => setShowSchedule(true)}
        disabled={isPending}
        className={primaryButtonClass}
      >
        予定を確定
      </button>
      {showSchedule && (
        <ModalShell title="返却予定を確定" label={label} onClose={() => !isPending && setShowSchedule(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                受け渡し方法
              </label>
              <div className="grid grid-cols-2 gap-2">
                <RadioPill
                  active={transportMethod === "pickup"}
                  onClick={() => setTransportMethod("pickup")}
                  label="取りに行く"
                />
                <RadioPill
                  active={transportMethod === "dropoff"}
                  onClick={() => setTransportMethod("dropoff")}
                  label="業所に持ち込み"
                />
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
              {desiredDate && desiredDate !== scheduledDate && (
                <p className="mt-1 text-[11px] text-subtle">
                  顧客の希望: {desiredDate}
                </p>
              )}
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
          <ModalActions
            onCancel={() => setShowSchedule(false)}
            onConfirm={handleSchedule}
            isPending={isPending}
            confirmLabel="確定する"
          />
        </ModalShell>
      )}
      {showReject && (
        <ReasonModal
          title="返却申請を却下"
          label={label}
          reason={reason}
          setReason={setReason}
          isPending={isPending}
          onCancel={() => setShowReject(false)}
          onConfirm={handleReject}
          confirmLabel="却下する"
          confirmTone="danger"
          reasonHint="顧客に通知されます"
          placeholder="申請内容に確認が必要なため等"
        />
      )}
    </ActionShell>
  );
}

// ============================================================
// 返却 scheduled：受領 / 取りやめ
// ============================================================

export function ScheduledReturnActions({
  requestId,
  label,
  requestedDelta,
  materialName,
}: {
  requestId: string;
  label: string;
  requestedDelta: number;
  materialName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [showReceive, setShowReceive] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [received, setReceived] = useState<number>(requestedDelta);
  const [cancelled, setCancelled] = useState<number>(0);
  const [lost, setLost] = useState<number>(0);
  const [damaged, setDamaged] = useState<number>(0);
  const [damageNotes, setDamageNotes] = useState<string>("");

  const remaining = requestedDelta - received - cancelled - lost;

  function applyAiPrefill(p: AiPrefill) {
    setReceived(p.receivedQuantity);
    setCancelled(p.cancelledQuantity);
    setLost(p.lostQuantity);
    setDamaged(p.damagedQuantity);
    // 既存ノートが空の時だけ AI のテキストを差し込み、上書きはしない
    setDamageNotes((prev) => {
      if (prev.trim().length > 0) return prev;
      const parts: string[] = [];
      if (p.damageNotes) parts.push(p.damageNotes);
      if (p.overallNotes) parts.push(p.overallNotes);
      return parts.join("\n");
    });
  }

  function handleReceive() {
    setError(null);
    if (remaining !== 0) {
      setError(`受領・キャンセル・損失の合計を ${requestedDelta} に揃えてください`);
      return;
    }
    if (damaged > received) {
      setError("損傷数は受領数以下にしてください");
      return;
    }
    startTransition(async () => {
      try {
        await completeReturn(requestId, {
          receivedQuantity: received,
          cancelledQuantity: cancelled,
          lostQuantity: lost,
          damagedQuantity: damaged,
          damageNotes: damageNotes.trim() || undefined,
        });
        setShowReceive(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "処理に失敗しました");
      }
    });
  }

  function handleCancel() {
    setError(null);
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("取りやめ理由を入力してください");
      return;
    }
    startTransition(async () => {
      try {
        await cancelScheduledReturn(requestId, trimmed);
        setShowCancel(false);
        setReason("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "処理に失敗しました");
      }
    });
  }

  return (
    <ActionShell error={error}>
      <button
        type="button"
        onClick={() => setShowCancel(true)}
        disabled={isPending}
        className={rejectButtonClass}
      >
        取りやめ
      </button>
      <button
        type="button"
        onClick={() => setShowReceive(true)}
        disabled={isPending}
        className={primaryButtonClass}
      >
        受領する
      </button>
      {showReceive && (
        <ModalShell title="返却を受領" label={label} onClose={() => !isPending && setShowReceive(false)}>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto -mx-5 px-5">
            <p className="text-xs text-muted">
              申請数 <span className="font-semibold text-foreground tabular-nums">{requestedDelta}</span>{" "}
              点について実物を確認し、内訳を入力してください。
            </p>
            <InspectionPhotos
              requestId={requestId}
              requestedDelta={requestedDelta}
              targetMaterialName={materialName}
              onPrefill={applyAiPrefill}
            />
            <div className="grid grid-cols-3 gap-2">
              <QtyField label="受領" value={received} setValue={setReceived} max={requestedDelta} />
              <QtyField label="キャンセル" value={cancelled} setValue={setCancelled} max={requestedDelta} />
              <QtyField label="損失" value={lost} setValue={setLost} max={requestedDelta} />
            </div>
            <div
              className={`text-[11px] tabular-nums ${
                remaining === 0 ? "text-success" : "text-danger"
              }`}
            >
              内訳合計: {received + cancelled + lost} / {requestedDelta}
              {remaining !== 0 && `（${remaining > 0 ? `あと ${remaining}` : `${-remaining} 多い`}）`}
            </div>
            <div className="border-t border-rule pt-3">
              <QtyField
                label="うち損傷あり"
                value={damaged}
                setValue={setDamaged}
                max={received}
                fullWidth
              />
              <p className="mt-1 text-[11px] text-subtle">受領分のうち損傷のある数を入力</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                備考（任意）
              </label>
              <textarea
                value={damageNotes}
                onChange={(e) => setDamageNotes(e.target.value)}
                rows={2}
                placeholder="損傷の内容・場所など"
                className="w-full px-3 py-2 text-sm bg-surface-muted border border-rule rounded resize-none focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          </div>
          <ModalActions
            onCancel={() => setShowReceive(false)}
            onConfirm={handleReceive}
            isPending={isPending}
            confirmLabel="受領を確定"
          />
        </ModalShell>
      )}
      {showCancel && (
        <ReasonModal
          title="返却予定を取りやめ"
          label={label}
          reason={reason}
          setReason={setReason}
          isPending={isPending}
          onCancel={() => setShowCancel(false)}
          onConfirm={handleCancel}
          confirmLabel="取りやめる"
          confirmTone="danger"
          reasonHint="顧客に通知されます"
          placeholder="日程変更のため等"
        />
      )}
    </ActionShell>
  );
}

// ============================================================
// 共有 UI パーツ
// ============================================================

export const primaryButtonClass =
  "px-3 h-8 text-xs font-semibold bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-50 transition-colors";
export const rejectButtonClass =
  "px-3 h-8 text-xs font-medium border border-rule rounded text-muted hover:text-danger hover:border-danger/40 disabled:opacity-50 transition-colors";

function ActionShell({
  children,
  error,
}: {
  children: React.ReactNode;
  error: string | null;
}) {
  return (
    <div className="flex flex-col items-end gap-2 flex-shrink-0">
      <div className="flex gap-2">{children}</div>
      {error && (
        <p role="alert" className="text-[11px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function ModalShell({
  title,
  label,
  onClose,
  children,
}: {
  title: string;
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title}: ${label}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="bg-surface w-full max-w-md rounded-[var(--radius-lg)] shadow-xl border border-rule overflow-hidden text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-rule">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted mt-0.5 truncate">{label}</p>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function ModalActions({
  onCancel,
  onConfirm,
  isPending,
  confirmLabel,
  confirmTone = "primary",
}: {
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
  confirmLabel: string;
  confirmTone?: "primary" | "danger";
}) {
  return (
    <div className="mt-5 -mx-5 px-5 pt-4 border-t border-rule flex items-center justify-end gap-3">
      <button
        type="button"
        onClick={onCancel}
        disabled={isPending}
        className="px-4 h-9 text-xs font-medium text-muted hover:text-foreground disabled:opacity-50"
      >
        キャンセル
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={isPending}
        className={`px-4 h-9 text-xs font-semibold text-white rounded disabled:opacity-50 ${
          confirmTone === "danger"
            ? "bg-danger hover:bg-danger/90"
            : "bg-accent hover:bg-accent-hover"
        }`}
      >
        {isPending ? "処理中…" : confirmLabel}
      </button>
    </div>
  );
}

export function ReasonModal({
  title,
  label,
  reason,
  setReason,
  isPending,
  onCancel,
  onConfirm,
  confirmLabel,
  confirmTone,
  reasonHint,
  placeholder,
}: {
  title: string;
  label: string;
  reason: string;
  setReason: (v: string) => void;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmTone: "primary" | "danger";
  reasonHint: string;
  placeholder: string;
}) {
  return (
    <ModalShell title={title} label={label} onClose={() => !isPending && onCancel()}>
      <label className="block text-xs font-medium text-foreground mb-1.5">
        理由（{reasonHint}）
      </label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        className="w-full px-3 py-2 text-sm bg-surface-muted border border-rule rounded resize-none focus:outline-none focus:ring-2 focus:ring-accent/40"
        placeholder={placeholder}
        disabled={isPending}
      />
      <ModalActions
        onCancel={onCancel}
        onConfirm={onConfirm}
        isPending={isPending}
        confirmLabel={confirmLabel}
        confirmTone={confirmTone}
      />
    </ModalShell>
  );
}

function RadioPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 px-3 rounded text-xs font-medium border transition-colors ${
        active
          ? "border-accent bg-accent/5 text-foreground"
          : "border-rule bg-surface text-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function QtyField({
  label,
  value,
  setValue,
  max,
  fullWidth,
}: {
  label: string;
  value: number;
  setValue: (v: number) => void;
  max: number;
  fullWidth?: boolean;
}) {
  return (
    <label className={`block ${fullWidth ? "" : ""}`}>
      <span className="block text-[11px] font-medium text-muted mb-1">{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => {
          const v = Math.floor(Number(e.target.value));
          setValue(Number.isFinite(v) && v >= 0 ? v : 0);
        }}
        className="w-full h-10 px-3 text-sm tabular-nums bg-surface-muted border border-rule rounded focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
    </label>
  );
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
