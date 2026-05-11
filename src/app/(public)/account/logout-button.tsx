"use client";

import { useTransition } from "react";
import { logout } from "@/app/(public)/login/actions";

export default function LogoutButton() {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => logout())}
      disabled={isPending}
      className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-border bg-surface text-sm text-foreground hover:border-border-strong hover:bg-surface-muted disabled:opacity-50 transition-colors"
    >
      <svg
        className="h-4 w-4 text-muted"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </svg>
      {isPending ? "ログアウト中…" : "ログアウト"}
    </button>
  );
}
