"use client";

import { useState, useTransition } from "react";
import { acknowledgeExtensionsForOrder, acknowledgeReturnsForOrder } from "./actions";

export default function BulkActions({
  orderId,
  returnCount,
  extensionCount,
}: {
  orderId: string;
  returnCount: number;
  extensionCount: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<number>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
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
          <button
            type="button"
            onClick={() => run(() => acknowledgeReturnsForOrder(orderId))}
            disabled={isPending}
            className="px-3 h-8 text-xs font-semibold bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            返却 {returnCount}件 を一括承認
          </button>
        )}
        {extensionCount > 0 && (
          <button
            type="button"
            onClick={() => run(() => acknowledgeExtensionsForOrder(orderId))}
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
    </div>
  );
}
