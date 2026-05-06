"use client";

import { useState, useTransition } from "react";
import {
  approveOrder,
  cancelOrder,
  completeOrder,
  rejectOrder,
  shipOrder,
} from "@/app/admin/actions";
import type { OrderDetail, OrderStatus } from "@/lib/admin-data";
import { Button } from "@/components/admin/ui";

type Props = {
  order: OrderDetail;
};

export default function OrderActions({ order }: Props) {
  const [isPending, startTransition] = useTransition();
  const [modal, setModal] = useState<null | "approve" | "reject" | "cancel">(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approvedQtys, setApprovedQtys] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      order.items.map((it) => [it.id, it.approved_quantity ?? it.quantity])
    )
  );
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        setModal(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "エラーが発生しました");
      }
    });
  };

  const status: OrderStatus = order.status;
  const canApprove = status === "pending";
  const canReject = status === "pending";
  const canShip = status === "approved";
  const canComplete = status === "shipped";
  const canCancel =
    status === "pending" || status === "approved" || status === "shipped";
  const noActions =
    !canApprove && !canReject && !canShip && !canComplete && !canCancel;

  if (noActions) {
    return (
      <p className="text-sm text-subtle">
        この発注は {status} 状態のため操作できません。
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canApprove && (
          <Button onClick={() => setModal("approve")} disabled={isPending}>
            承認する
          </Button>
        )}
        {canReject && (
          <Button
            variant="danger"
            onClick={() => setModal("reject")}
            disabled={isPending}
          >
            却下する
          </Button>
        )}
        {canShip && (
          <Button
            variant="secondary"
            onClick={() =>
              run(async () => {
                await shipOrder(order.id);
              })
            }
            disabled={isPending}
          >
            出荷済にする
          </Button>
        )}
        {canComplete && (
          <Button
            variant="secondary"
            onClick={() =>
              run(async () => {
                await completeOrder(order.id);
              })
            }
            disabled={isPending}
          >
            完了にする
          </Button>
        )}
        {canCancel && (
          <Button
            variant="ghost"
            onClick={() => setModal("cancel")}
            disabled={isPending}
          >
            キャンセル
          </Button>
        )}
      </div>

      {error && (
        <p className="text-sm text-[var(--color-status-rejected-fg)] mt-3">{error}</p>
      )}

      {modal === "approve" && (
        <Modal title="発注を承認" onClose={() => setModal(null)}>
          <p className="text-sm text-muted mb-4">
            必要に応じて承認数量を修正してください。
          </p>
          <div className="border-y border-rule divide-y divide-rule mb-6">
            {order.items.map((it) => (
              <div
                key={it.id}
                className="flex items-center justify-between gap-3 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="text-foreground font-medium truncate">
                    {it.material_name}
                  </p>
                  {it.variant_name && (
                    <p className="text-xs text-subtle truncate mt-0.5">
                      {it.variant_name}
                    </p>
                  )}
                  <p className="font-[family-name:var(--font-mono)] tabular-nums text-[11px] text-subtle mt-1">
                    発注 {it.quantity}
                  </p>
                </div>
                <input
                  type="number"
                  min={0}
                  value={approvedQtys[it.id]}
                  onChange={(e) =>
                    setApprovedQtys((prev) => ({
                      ...prev,
                      [it.id]: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                  className="w-20 h-9 px-3 bg-surface border border-rule text-sm text-right tabular-nums font-[family-name:var(--font-mono)] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </div>
            ))}
          </div>
          <ModalFooter
            pending={isPending}
            onCancel={() => setModal(null)}
            onConfirm={() =>
              run(async () => {
                await approveOrder(
                  order.id,
                  order.items.map((it) => ({
                    itemId: it.id,
                    approvedQuantity: approvedQtys[it.id] ?? it.quantity,
                  }))
                );
              })
            }
            confirmLabel="承認"
          />
        </Modal>
      )}

      {modal === "reject" && (
        <Modal title="発注を却下" onClose={() => setModal(null)}>
          <label className="block font-[family-name:var(--font-mono)] text-xs uppercase tracking-wider text-subtle mb-2">
            却下理由{" "}
            <span className="text-[var(--color-status-rejected-fg)]">*</span>
          </label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={4}
            placeholder="在庫不足、納期不可 など"
            className="w-full px-3 py-2.5 bg-surface border border-rule text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 mb-6"
          />
          <ModalFooter
            pending={isPending}
            disabled={!rejectReason.trim()}
            onCancel={() => setModal(null)}
            onConfirm={() =>
              run(async () => {
                await rejectOrder(order.id, rejectReason.trim());
              })
            }
            confirmLabel="却下"
            confirmVariant="danger"
          />
        </Modal>
      )}

      {modal === "cancel" && (
        <Modal title="発注をキャンセル" onClose={() => setModal(null)}>
          <p className="text-sm text-muted mb-6">
            この発注をキャンセル状態にします。元に戻せません。
          </p>
          <ModalFooter
            pending={isPending}
            onCancel={() => setModal(null)}
            onConfirm={() =>
              run(async () => {
                await cancelOrder(order.id);
              })
            }
            confirmLabel="キャンセルする"
            confirmVariant="danger"
          />
        </Modal>
      )}
    </>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="bg-surface w-full sm:max-w-md max-h-[85vh] overflow-y-auto shadow-2xl border-t border-rule-strong sm:border sm:border-rule-strong"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-5 pb-3 border-b border-rule">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="text-subtle hover:text-foreground transition-colors"
              aria-label="閉じる"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function ModalFooter({
  pending,
  disabled,
  onCancel,
  onConfirm,
  confirmLabel,
  confirmVariant = "primary",
}: {
  pending: boolean;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger";
}) {
  return (
    <div className="flex gap-3">
      <Button
        variant="secondary"
        size="lg"
        onClick={onCancel}
        disabled={pending}
        className="flex-1"
      >
        戻る
      </Button>
      <Button
        variant={confirmVariant}
        size="lg"
        onClick={onConfirm}
        disabled={pending || disabled}
        className="flex-1"
      >
        {pending ? "処理中…" : confirmLabel}
      </Button>
    </div>
  );
}
