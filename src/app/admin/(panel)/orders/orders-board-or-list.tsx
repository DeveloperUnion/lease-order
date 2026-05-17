"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  approveOrder,
  cancelOrder,
  fetchOrderItemsForApproval,
  rejectOrder,
  shipOrder,
  type ApprovalItem,
} from "@/app/admin/actions";
import type { OrderListRow } from "@/lib/admin-data";
import { statusLabels, type OrderStatus } from "@/lib/order-status";
import {
  PageHeader,
  StatusBadge,
  DataTable,
  Button,
  type Column,
} from "@/components/admin/ui";
import { COLUMN_ORDER, transitionFor } from "./status-transitions";

type ViewMode = "board" | "list";

type ModalState =
  | { kind: "approve"; orderId: string; items: ApprovalItem[] | null }
  | { kind: "reject"; orderId: string }
  | { kind: "cancel"; orderId: string }
  | null;

export default function OrdersBoardOrList({
  orders,
}: {
  orders: OrderListRow[];
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("board");
  const [modal, setModal] = useState<ModalState>(null);
  const [pendingMoveId, setPendingMoveId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onMoveAttempt = (order: OrderListRow, target: OrderStatus) => {
    if (order.status === target) return;
    const kind = transitionFor(order.status, target);
    if (!kind) {
      setErrorMsg(
        `${statusLabels[order.status].label} から ${statusLabels[target].label} への変更はできません`
      );
      setTimeout(() => setErrorMsg(null), 2200);
      return;
    }
    if (kind === "approve") {
      setModal({ kind: "approve", orderId: order.id, items: null });
      return;
    }
    if (kind === "reject") {
      setModal({ kind: "reject", orderId: order.id });
      return;
    }
    if (kind === "cancel") {
      setModal({ kind: "cancel", orderId: order.id });
      return;
    }
    runMove(order.id, kind);
  };

  const runMove = (orderId: string, kind: "ship") => {
    setPendingMoveId(orderId);
    startTransition(async () => {
      try {
        if (kind === "ship") await shipOrder(orderId);
        router.refresh();
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "更新に失敗しました");
        setTimeout(() => setErrorMsg(null), 2200);
      } finally {
        setPendingMoveId(null);
      }
    });
  };

  const closeModal = () => setModal(null);

  return (
    <main className="flex-1 flex flex-col min-h-0 w-full">
      <div className="sticky top-0 z-10 bg-background flex-shrink-0">
        <div className="px-4 sm:px-6 pt-6 sm:pt-8">
          <PageHeader
            title="発注管理"
            description="承認・出荷・完了をオペレーターが順次処理します。"
            actions={
              <div
                role="tablist"
                aria-label="表示モード切り替え"
                className="inline-flex border border-rule"
              >
                <ToggleButton
                  active={view === "board"}
                  onClick={() => setView("board")}
                >
                  ボード
                </ToggleButton>
                <ToggleButton
                  active={view === "list"}
                  onClick={() => setView("list")}
                >
                  リスト
                </ToggleButton>
              </div>
            }
          />

          {errorMsg && (
            <div
              role="alert"
              className="mb-4 px-4 py-2.5 bg-[var(--color-status-rejected-bg)] border border-[var(--color-status-rejected-fg)]/20 text-[var(--color-status-rejected-fg)] text-sm"
            >
              {errorMsg}
            </div>
          )}
        </div>
      </div>

      {view === "board" ? (
        <div className="flex-1 min-h-0 relative">
          <div className="absolute inset-0 overflow-x-auto overflow-y-hidden px-4 sm:px-6 pb-4">
            <KanbanColumns
              orders={orders}
              pendingMoveId={pendingMoveId}
              onMoveAttempt={onMoveAttempt}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 relative">
          <div className="absolute inset-0 overflow-auto px-4 sm:px-6 pb-6">
            <OrdersTable orders={orders} />
          </div>
        </div>
      )}

      {modal?.kind === "approve" && (
        <ApproveModal
          orderId={modal.orderId}
          items={modal.items}
          setItems={(items) =>
            setModal((m) => (m && m.kind === "approve" ? { ...m, items } : m))
          }
          pending={isPending}
          onClose={closeModal}
          onConfirm={(qtyMap) => {
            startTransition(async () => {
              try {
                await approveOrder(
                  modal.orderId,
                  Object.entries(qtyMap).map(([itemId, q]) => ({
                    itemId,
                    approvedQuantity: q,
                  }))
                );
                closeModal();
                router.refresh();
              } catch (e) {
                setErrorMsg(e instanceof Error ? e.message : "承認に失敗しました");
                setTimeout(() => setErrorMsg(null), 2200);
              }
            });
          }}
        />
      )}

      {modal?.kind === "reject" && (
        <RejectModal
          pending={isPending}
          onClose={closeModal}
          onConfirm={(reason) => {
            startTransition(async () => {
              try {
                await rejectOrder(modal.orderId, reason);
                closeModal();
                router.refresh();
              } catch (e) {
                setErrorMsg(e instanceof Error ? e.message : "却下に失敗しました");
                setTimeout(() => setErrorMsg(null), 2200);
              }
            });
          }}
        />
      )}

      {modal?.kind === "cancel" && (
        <CancelModal
          pending={isPending}
          onClose={closeModal}
          onConfirm={() => {
            startTransition(async () => {
              try {
                await cancelOrder(modal.orderId);
                closeModal();
                router.refresh();
              } catch (e) {
                setErrorMsg(
                  e instanceof Error ? e.message : "キャンセルに失敗しました"
                );
                setTimeout(() => setErrorMsg(null), 2200);
              }
            });
          }}
        />
      )}
    </main>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 h-9 text-xs font-medium tracking-wide font-[family-name:var(--font-mono)] uppercase transition-colors ${
        active ? "bg-foreground text-background" : "bg-surface text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

// ============================================================
// Kanban columns (PC)
// ============================================================

function KanbanColumns({
  orders,
  pendingMoveId,
  onMoveAttempt,
}: {
  orders: OrderListRow[];
  pendingMoveId: string | null;
  onMoveAttempt: (order: OrderListRow, target: OrderStatus) => void;
}) {
  const [dragOrderId, setDragOrderId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<OrderStatus | null>(null);

  const byStatus = COLUMN_ORDER.reduce<Record<OrderStatus, OrderListRow[]>>(
    (acc, s) => ({ ...acc, [s]: [] }),
    {} as Record<OrderStatus, OrderListRow[]>
  );
  for (const o of orders) byStatus[o.status].push(o);

  return (
    <div className="flex gap-4 h-full w-max">
      {COLUMN_ORDER.map((status) => {
        const items = byStatus[status];
        const dragOrder = orders.find((o) => o.id === dragOrderId);
        const allowed = dragOrder
          ? transitionFor(dragOrder.status, status) !== null ||
            dragOrder.status === status
          : true;
        const isOverDroppable =
          overColumn === status &&
          dragOrder &&
          allowed &&
          dragOrder.status !== status;

        return (
          <div
            key={status}
            onDragOver={(e) => {
              if (!dragOrder) return;
              if (allowed) {
                e.preventDefault();
                setOverColumn(status);
              }
            }}
            onDragLeave={(e) => {
              const related = e.relatedTarget as Node | null;
              if (related && e.currentTarget.contains(related)) return;
              setOverColumn((c) => (c === status ? null : c));
            }}
            onDrop={() => {
              if (!dragOrder) return;
              setOverColumn(null);
              if (dragOrder.status === status) return;
              onMoveAttempt(dragOrder, status);
              setDragOrderId(null);
            }}
            className={`flex-shrink-0 w-72 h-full flex flex-col border-t-2 transition-colors ${
              isOverDroppable
                ? "border-accent bg-accent-soft/40"
                : dragOrder && !allowed
                  ? "border-rule bg-surface opacity-50"
                  : "border-rule-strong bg-surface"
            }`}
          >
            <div className="px-3 py-3 flex items-center justify-between border-b border-rule flex-shrink-0">
              <div className="flex items-center gap-2">
                <StatusBadge status={status} />
                <span className="font-[family-name:var(--font-mono)] tabular-nums text-[11px] text-subtle">
                  {String(items.length).padStart(2, "0")}
                </span>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
              {items.length === 0 ? (
                <p className="text-xs text-subtle text-center py-6 font-[family-name:var(--font-mono)] uppercase tracking-wider">
                  ―
                </p>
              ) : (
                items.map((order) => (
                  <KanbanCard
                    key={order.id}
                    order={order}
                    isDragging={dragOrderId === order.id}
                    isPending={pendingMoveId === order.id}
                    onDragStart={() => setDragOrderId(order.id)}
                    onDragEnd={() => {
                      setDragOrderId(null);
                      setOverColumn(null);
                    }}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({
  order,
  isDragging,
  isPending,
  onDragStart,
  onDragEnd,
}: {
  order: OrderListRow;
  isDragging: boolean;
  isPending: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <Link
      href={`/admin/orders/${order.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`block bg-surface border border-rule p-3 hover:border-[var(--color-rule-strong)] cursor-grab active:cursor-grabbing transition-colors ${
        isDragging ? "opacity-50" : ""
      } ${isPending ? "opacity-60 pointer-events-none" : ""}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-[family-name:var(--font-mono)] tabular-nums text-[11px] text-foreground tracking-wide">
          {order.order_number}
        </span>
        <span className="font-[family-name:var(--font-mono)] text-[10px] text-subtle">
          {new Date(order.created_at).toLocaleDateString("ja-JP", {
            month: "2-digit",
            day: "2-digit",
          })}
        </span>
      </div>
      <p className="text-sm font-medium text-foreground truncate mb-0.5">
        {order.company_name}
      </p>
      <p className="text-xs text-muted truncate">{order.contact_name}</p>
      <p className="font-[family-name:var(--font-mono)] tabular-nums text-[10px] text-subtle mt-2">
        {order.item_count} 品目 / {order.total_quantity} 点
      </p>
    </Link>
  );
}

// ============================================================
// List view (DataTable)
// ============================================================

function OrdersTable({ orders }: { orders: OrderListRow[] }) {
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  const columns: Column<OrderListRow>[] = [
    {
      key: "order_number",
      header: "発注番号",
      width: "180px",
      mono: true,
      cell: (o) => o.order_number,
    },
    {
      key: "company",
      header: "顧客",
      width: "minmax(200px, 1.4fr)",
      cell: (o) => (
        <span className="truncate">
          <span className="text-foreground font-medium">{o.company_name}</span>
          <span className="text-subtle ml-2">／ {o.contact_name}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: "状態",
      width: "120px",
      cell: (o) => <StatusBadge status={o.status} />,
    },
    {
      key: "items",
      header: "品目",
      width: "80px",
      align: "right",
      cell: (o) => o.item_count,
    },
    {
      key: "qty",
      header: "数量",
      width: "80px",
      align: "right",
      cell: (o) => o.total_quantity,
    },
    {
      key: "created",
      header: "受付",
      width: "140px",
      align: "right",
      cell: (o) =>
        new Date(o.created_at).toLocaleString("ja-JP", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
    },
  ];

  return (
    <>
      <div className="sticky top-0 z-20 bg-background flex gap-0 overflow-x-auto pb-0 mb-5 -mx-4 sm:-mx-6 px-4 sm:px-6 border-b border-rule">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="すべて"
          count={orders.length}
        />
        {COLUMN_ORDER.map((s) => {
          const c = orders.filter((o) => o.status === s).length;
          return (
            <FilterChip
              key={s}
              active={filter === s}
              onClick={() => setFilter(s)}
              label={statusLabels[s].label}
              count={c}
            />
          );
        })}
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(o) => o.id}
        rowHref={(o) => `/admin/orders/${o.id}`}
        empty="該当する発注はありません"
        caption="発注一覧"
        stickyHeader
        stickyHeaderTop="top-12"
        className="min-w-[800px]"
      />
    </>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap flex items-center gap-1.5 px-4 py-3 text-sm transition-colors border-b-2 -mb-px ${
        active
          ? "border-accent text-foreground font-medium"
          : "border-transparent text-muted hover:text-foreground"
      }`}
    >
      <span>{label}</span>
      <span className="font-[family-name:var(--font-mono)] tabular-nums text-[10px] text-subtle">
        {count}
      </span>
    </button>
  );
}

// ============================================================
// Modals
// ============================================================

function ModalShell({
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
    <div className="flex gap-3 mt-6">
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

function ApproveModal({
  orderId,
  items,
  setItems,
  pending,
  onClose,
  onConfirm,
}: {
  orderId: string;
  items: ApprovalItem[] | null;
  setItems: (items: ApprovalItem[]) => void;
  pending: boolean;
  onClose: () => void;
  onConfirm: (qtyMap: Record<string, number>) => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});

  useEffect(() => {
    if (items === null) {
      fetchOrderItemsForApproval(orderId)
        .then((rows) => {
          setItems(rows);
          setQty(Object.fromEntries(rows.map((r) => [r.id, r.quantity])));
        })
        .catch(() => onClose());
    } else if (Object.keys(qty).length === 0) {
      setQty(Object.fromEntries(items.map((r) => [r.id, r.quantity])));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, items]);

  return (
    <ModalShell title="発注を承認" onClose={onClose}>
      {items === null ? (
        <p className="text-sm text-subtle py-6 text-center">読み込み中…</p>
      ) : (
        <>
          <p className="text-sm text-muted mb-4">
            必要に応じて承認数量を修正してください。
          </p>
          <div className="border-y border-rule divide-y divide-rule">
            {items.map((it) => (
              <div
                key={it.id}
                className="flex items-center justify-between gap-3 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="text-foreground font-medium truncate">
                    {it.material_name}
                  </p>
                  {it.spec_summary && (
                    <p className="text-xs text-subtle truncate mt-0.5">
                      {it.spec_summary}
                    </p>
                  )}
                  <p className="font-[family-name:var(--font-mono)] tabular-nums text-[11px] text-subtle mt-1">
                    発注 {it.quantity}
                  </p>
                </div>
                <input
                  type="number"
                  min={0}
                  value={qty[it.id] ?? it.quantity}
                  onChange={(e) =>
                    setQty((p) => ({
                      ...p,
                      [it.id]: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                  className="w-20 h-9 px-3 bg-surface border border-rule text-sm text-right tabular-nums font-[family-name:var(--font-mono)] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </div>
            ))}
          </div>
          <ModalFooter
            pending={pending}
            onCancel={onClose}
            onConfirm={() => onConfirm(qty)}
            confirmLabel="承認"
          />
        </>
      )}
    </ModalShell>
  );
}

function RejectModal({
  pending,
  onClose,
  onConfirm,
}: {
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <ModalShell title="発注を却下" onClose={onClose}>
      <label className="block font-[family-name:var(--font-mono)] text-xs uppercase tracking-wider text-subtle mb-2">
        却下理由 <span className="text-[var(--color-status-rejected-fg)]">*</span>
      </label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={4}
        placeholder="在庫不足、納期不可 など"
        className="w-full px-3 py-2.5 bg-surface border border-rule text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <ModalFooter
        pending={pending}
        disabled={!reason.trim()}
        onCancel={onClose}
        onConfirm={() => onConfirm(reason.trim())}
        confirmLabel="却下"
        confirmVariant="danger"
      />
    </ModalShell>
  );
}

function CancelModal({
  pending,
  onClose,
  onConfirm,
}: {
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell title="発注をキャンセル" onClose={onClose}>
      <p className="text-sm text-muted">
        この発注をキャンセル状態にします。元に戻せません。
      </p>
      <ModalFooter
        pending={pending}
        onCancel={onClose}
        onConfirm={onConfirm}
        confirmLabel="キャンセルする"
        confirmVariant="danger"
      />
    </ModalShell>
  );
}
