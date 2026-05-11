"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  labelForNotification,
  linkForNotification,
  type NotificationRow,
} from "@/lib/notifications/display";

type Props = {
  unreadCount: number;
  recent: NotificationRow[];
  audience: "customer" | "admin";
  markRead: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  className?: string;
};

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Math.floor((Date.now() - t) / 1000);
  if (diff < 60) return "今";
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}日前`;
  return new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

export default function NotificationBell({
  unreadCount,
  recent,
  audience,
  markRead,
  markAllRead,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const basePath = audience === "admin" ? "/admin/notifications" : "/notifications";

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleItemClick(row: NotificationRow) {
    setOpen(false);
    if (!row.read_at) {
      startTransition(async () => {
        await markRead([row.id]);
        router.refresh();
      });
    }
    router.push(linkForNotification(row, audience));
  }

  function handleMarkAll() {
    startTransition(async () => {
      await markAllRead();
      router.refresh();
    });
  }

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="通知"
        className="relative inline-flex items-center justify-center h-10 w-10 rounded-lg border border-border hover:border-border-strong hover:bg-surface-muted transition-colors"
      >
        <svg
          className="h-5 w-5 text-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .53-.21 1.04-.59 1.41L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full text-[10px] font-bold bg-accent text-accent-ink">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-[20rem] sm:w-[22rem] bg-surface rounded-lg shadow-lg border border-border overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">通知</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                disabled={isPending}
                className="text-xs text-accent hover:underline disabled:opacity-50"
              >
                すべて既読
              </button>
            )}
          </div>
          {recent.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-subtle">通知はありません</div>
          ) : (
            <ul className="divide-y divide-border max-h-[60vh] overflow-y-auto">
              {recent.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(row)}
                    className={`w-full text-left px-4 py-3 hover:bg-surface-muted transition-colors flex items-start gap-2 ${
                      row.read_at ? "" : "bg-accent-soft/30"
                    }`}
                  >
                    {!row.read_at && (
                      <span
                        aria-hidden
                        className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent flex-shrink-0"
                      />
                    )}
                    <div className={`min-w-0 flex-1 ${row.read_at ? "pl-3.5" : ""}`}>
                      <p className="text-sm text-foreground truncate">
                        {labelForNotification(row)}
                      </p>
                      {row.payload.itemSummary && (
                        <p className="text-xs text-subtle mt-0.5 truncate">
                          {row.payload.itemSummary}
                        </p>
                      )}
                      <p className="text-xs text-subtle mt-0.5">{formatRelative(row.created_at)}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="px-4 py-3 border-t border-border text-center">
            <Link
              href={basePath}
              onClick={() => setOpen(false)}
              className="text-xs text-accent hover:underline"
            >
              すべて表示
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
