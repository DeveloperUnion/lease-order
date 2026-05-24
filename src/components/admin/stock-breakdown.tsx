// 在庫の「保有 / 貸出中 / 残」を一行で表示する読み取り専用ビュー。
// null = 未設定（"-" で表示し警告色は付けない）/ 0 = 在庫切れ（赤）を区別する。
export default function StockBreakdown({
  stock,
  inUse,
  available,
  compact = false,
}: {
  stock: number | null;
  inUse: number;
  available: number | null;
  compact?: boolean;
}) {
  const stockLabel = stock === null ? "-" : String(stock);
  const availableIsOut = available !== null && available <= 0;
  return (
    <div
      className={`flex items-center gap-4 ${
        compact ? "text-xs" : "text-sm"
      } tabular-nums`}
    >
      <span className="text-subtle">保有 {stockLabel}</span>
      <span className="text-subtle">貸出中 {inUse}</span>
      <span
        className={`font-semibold ${
          available === null
            ? "text-subtle"
            : availableIsOut
            ? "text-[var(--color-status-rejected-fg)]"
            : "text-foreground"
        }`}
      >
        残 {available === null ? "-" : available}
      </span>
    </div>
  );
}
