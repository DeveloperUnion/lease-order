import type { TenantStatusDisplay, TrialTone } from "@/lib/tenant-status";

const TONE_CLASS: Record<TrialTone, string> = {
  trial: "bg-[var(--color-status-pending-bg)] text-[var(--color-status-pending-fg)]",
  expired: "bg-[var(--color-status-rejected-bg)] text-[var(--color-status-rejected-fg)]",
  suspended:
    "bg-[var(--color-status-cancelled-bg)] text-[var(--color-status-cancelled-fg)]",
  active:
    "bg-[var(--color-status-completed-bg)] text-[var(--color-status-completed-fg)]",
};

// 算出済みの表示（label/tone）を受け取るだけの純粋コンポーネント。
// 時刻計算はデータ層（tenantStatusDisplay）で済ませる。
// hideActive=true なら本契約はバッジ非表示（一覧をうるさくしない）。
export default function TrialBadge({
  display,
  hideActive = false,
}: {
  display: TenantStatusDisplay;
  hideActive?: boolean;
}) {
  if (display.tone === "active" && hideActive) return null;
  return (
    <span
      className={`inline-flex items-center font-[family-name:var(--font-mono)] text-[10px] px-2 py-0.5 uppercase tracking-wider ${TONE_CLASS[display.tone]}`}
    >
      {display.label}
    </span>
  );
}
