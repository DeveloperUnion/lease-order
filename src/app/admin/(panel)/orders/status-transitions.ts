import type { OrderStatus } from "@/lib/order-status";

export type TransitionKind =
  | "approve"
  | "reject"
  | "ship"
  | "cancel";

// 各ステータスからどのステータスへ遷移できるか（および何の操作扱いか）。
// approve / reject はカンバン上で確認モーダルを開く。
// ship / cancel は即時実行 + 軽い確認のみ。
// renting → completed は返却申請の全件承認で自動遷移するため、ここには定義しない。
const TRANSITIONS: Record<
  OrderStatus,
  Partial<Record<OrderStatus, TransitionKind>>
> = {
  pending: {
    approved: "approve",
    rejected: "reject",
    cancelled: "cancel",
  },
  approved: {
    renting: "ship",
    cancelled: "cancel",
  },
  renting: {
    cancelled: "cancel",
  },
  completed: {},
  rejected: {},
  cancelled: {},
};

export function transitionFor(
  from: OrderStatus,
  to: OrderStatus
): TransitionKind | null {
  return TRANSITIONS[from][to] ?? null;
}

export const COLUMN_ORDER: OrderStatus[] = [
  "pending",
  "approved",
  "renting",
  "completed",
  "rejected",
  "cancelled",
];
