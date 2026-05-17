"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  listOutbox,
  flushOne,
  removeItem,
  retryItem,
  type OutboxItem,
} from "@/lib/offline/outbox";

type Props = {
  tenantId: string;
  customerId: string;
};

export default function OutboxList({ tenantId, customerId }: Props) {
  const [items, setItems] = useState<OutboxItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await listOutbox(tenantId, customerId);
      setItems(list);
    } catch {
      setItems([]);
    }
  }, [tenantId, customerId]);

  useEffect(() => {
    reload();
    const onOnline = () => reload();
    const onVis = () => {
      if (document.visibilityState === "visible") reload();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVis);
    const t = setInterval(reload, 5000);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(t);
    };
  }, [reload]);

  const handleSendNow = async (id: string) => {
    setBusyId(id);
    try {
      await flushOne(id, 12_000);
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  const handleRetry = async (id: string) => {
    setBusyId(id);
    try {
      await retryItem(id);
      await flushOne(id, 12_000);
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("この送信予約を削除しますか？\n（サーバへの登録は行われません）")) return;
    setBusyId(id);
    try {
      await removeItem(id);
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  const pending = items?.filter((i) => i.status === "pending" || i.status === "sending") ?? [];
  const sent = items?.filter((i) => i.status === "sent") ?? [];
  const failed = items?.filter((i) => i.status === "failed") ?? [];

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-7">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">送信待ち</h1>
        <Link
          href="/cart"
          className="text-xs text-subtle hover:text-accent transition-colors"
        >
          カートへ <span aria-hidden>→</span>
        </Link>
      </div>

      {items === null && (
        <p className="text-sm text-muted py-12 text-center">読み込み中…</p>
      )}

      {items && items.length === 0 && (
        <div className="border border-border bg-surface rounded-2xl py-16 px-6 text-center">
          <p className="text-sm text-muted">送信待ちの発注はありません</p>
        </div>
      )}

      {pending.length > 0 && (
        <Section title="送信待ち" tone="accent" count={pending.length}>
          {pending.map((item) => (
            <Row
              key={item.id}
              item={item}
              busy={busyId === item.id}
              actions={
                <>
                  <button
                    onClick={() => handleSendNow(item.id)}
                    disabled={busyId === item.id}
                    className="h-8 px-3 inline-flex items-center justify-center text-xs font-semibold text-accent-ink bg-accent rounded-md hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    今すぐ送信
                  </button>
                  <DeleteButton onClick={() => handleDelete(item.id)} disabled={busyId === item.id} />
                </>
              }
            />
          ))}
        </Section>
      )}

      {failed.length > 0 && (
        <Section title="エラー" tone="danger" count={failed.length}>
          {failed.map((item) => (
            <Row
              key={item.id}
              item={item}
              busy={busyId === item.id}
              actions={
                <>
                  <button
                    onClick={() => handleRetry(item.id)}
                    disabled={busyId === item.id}
                    className="h-8 px-3 inline-flex items-center justify-center text-xs font-semibold text-foreground border border-border rounded-md hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    再送
                  </button>
                  <DeleteButton onClick={() => handleDelete(item.id)} disabled={busyId === item.id} />
                </>
              }
            />
          ))}
        </Section>
      )}

      {sent.length > 0 && (
        <Section title="送信済" tone="muted" count={sent.length}>
          {sent.map((item) => (
            <Row
              key={item.id}
              item={item}
              busy={busyId === item.id}
              actions={
                <DeleteButton onClick={() => handleDelete(item.id)} disabled={busyId === item.id} />
              }
            />
          ))}
        </Section>
      )}
    </main>
  );
}

function Section({
  title,
  tone,
  count,
  children,
}: {
  title: string;
  tone: "accent" | "danger" | "muted";
  count: number;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "accent"
      ? "text-accent"
      : tone === "danger"
      ? "text-danger"
      : "text-subtle";
  return (
    <section className="mb-6">
      <h2 className={`text-sm font-semibold mb-2 ${toneClass}`}>
        {title}
        <span className="ml-1.5 text-xs font-normal text-subtle tabular-nums">({count})</span>
      </h2>
      <ul className="border border-border bg-surface rounded-xl overflow-hidden">{children}</ul>
    </section>
  );
}

function Row({
  item,
  busy,
  actions,
}: {
  item: OutboxItem;
  busy: boolean;
  actions: React.ReactNode;
}) {
  const site = item.payload.siteName || "（現場名なし）";
  const itemCount = item.payload.items.reduce((s, i) => s + i.quantity, 0);
  return (
    <li className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">
          {site}
          {item.resultOrderNumber && (
            <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-accent-ink bg-accent rounded px-1.5 py-0.5 tabular-nums">
              {item.resultOrderNumber}
            </span>
          )}
        </p>
        <p className="text-xs text-subtle mt-0.5 tabular-nums">
          {item.payload.items.length} 品目 · 合計 {itemCount} 点 · {formatAt(item.createdAt)}
          {item.attempts > 0 && (
            <span className="ml-2 text-subtle">試行 {item.attempts} 回</span>
          )}
        </p>
        {item.lastError && (
          <p className="text-xs text-danger mt-0.5 truncate" title={item.lastError}>
            {item.lastError}
          </p>
        )}
        {item.status === "sending" && (
          <p className="text-xs text-accent mt-0.5">送信中…</p>
        )}
      </div>
      <div className={`flex items-center gap-1.5 ${busy ? "opacity-50" : ""}`}>{actions}</div>
    </li>
  );
}

function DeleteButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label="削除"
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-subtle hover:bg-surface-muted hover:text-danger disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6h12z" />
      </svg>
    </button>
  );
}

function formatAt(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
