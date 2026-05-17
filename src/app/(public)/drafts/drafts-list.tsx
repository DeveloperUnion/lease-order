"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listDrafts, deleteDraft, type Draft } from "@/lib/offline/drafts";
import { useCart } from "@/lib/cart-context";

type Props = {
  tenantId: string;
  customerId: string;
};

export default function DraftsList({ tenantId, customerId }: Props) {
  const router = useRouter();
  const { activeDraftId, switchDraft, startNewDraft } = useCart();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await listDrafts(tenantId, customerId);
      setDrafts(list);
    } catch {
      setDrafts([]);
    }
  }, [tenantId, customerId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleOpen = async (id: string) => {
    setBusyId(id);
    try {
      await switchDraft(id);
      router.push("/cart");
    } finally {
      setBusyId(null);
    }
  };

  const handleNew = async () => {
    setBusyId("__new__");
    try {
      await startNewDraft();
      router.push("/cart");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("この下書きを削除しますか？")) return;
    setBusyId(id);
    try {
      await deleteDraft(id);
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-7">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">下書き</h1>
        <button
          onClick={handleNew}
          disabled={busyId === "__new__"}
          className="h-10 px-4 inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-[background,transform] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.99]"
        >
          + 新規下書き
        </button>
      </div>

      {drafts === null && (
        <p className="text-sm text-muted py-12 text-center">読み込み中…</p>
      )}

      {drafts && drafts.length === 0 && (
        <div className="border border-border bg-surface rounded-2xl py-16 px-6 text-center">
          <p className="text-sm text-muted">下書きはありません</p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center justify-center gap-2 px-6 h-10 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-[background,transform] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.99]"
          >
            資材を探す
            <span aria-hidden>→</span>
          </Link>
        </div>
      )}

      {drafts && drafts.length > 0 && (
        <ul className="border border-border bg-surface rounded-xl overflow-hidden">
          {drafts.map((d) => {
            const isActive = d.id === activeDraftId;
            const itemCount = d.items.reduce((s, i) => s + i.quantity, 0);
            return (
              <li
                key={d.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {d.name}
                    {isActive && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-accent-ink bg-accent rounded px-1.5 py-0.5">
                        編集中
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-subtle mt-0.5 tabular-nums">
                    {d.items.length} 品目 · 合計 {itemCount} 点 · {formatAt(d.updatedAt)}
                  </p>
                </div>
                <button
                  onClick={() => handleOpen(d.id)}
                  disabled={busyId === d.id}
                  className="h-9 px-3 inline-flex items-center justify-center text-sm font-semibold text-foreground border border-border rounded-lg hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  開く
                </button>
                <button
                  onClick={() => handleDelete(d.id)}
                  disabled={busyId === d.id}
                  aria-label="下書きを削除"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-subtle hover:bg-surface-muted hover:text-danger disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6h12z" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 text-xs text-subtle leading-relaxed">
        下書きはこの端末のブラウザに保存されます。別の端末・別のブラウザでは表示されません。
      </p>
    </main>
  );
}

function formatAt(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
