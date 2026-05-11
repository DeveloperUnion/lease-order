// Client-safe status meta. Exports OrderStatus + label/color map.
// Lives outside admin-data.ts so client components can import without
// dragging in server-only modules (next/headers, supabase-admin).

export type OrderStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "renting"
  | "completed"
  | "cancelled";

export const statusLabels: Record<
  OrderStatus,
  { label: string; color: string }
> = {
  pending: { label: "未確認", color: "bg-yellow-100 text-yellow-800" },
  approved: { label: "承認済", color: "bg-blue-100 text-blue-800" },
  rejected: { label: "却下", color: "bg-red-100 text-red-800" },
  renting: { label: "レンタル中", color: "bg-purple-100 text-purple-800" },
  completed: { label: "完了", color: "bg-green-100 text-green-800" },
  cancelled: { label: "キャンセル", color: "bg-surface-muted text-muted" },
};
