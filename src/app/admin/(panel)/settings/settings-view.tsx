"use client";

import { useState, useTransition } from "react";
import type { CustomerAccessMode } from "@/lib/tenant";
import { setCustomerAccessMode } from "./actions";
import { PageHeader, SectionRule } from "@/components/admin/ui";

const MODE_OPTIONS: {
  value: CustomerAccessMode;
  label: string;
  description: string;
}[] = [
  {
    value: "guest_browse",
    label: "ゲスト閲覧可",
    description:
      "カタログは誰でも閲覧できます。発注・履歴・レンタル状況の確認にはログインが必要です。",
  },
  {
    value: "login",
    label: "ログイン必須",
    description:
      "入口からログインが必要です。既知の顧客だけに見せる場合はこちら。",
  },
];

export default function SettingsView({
  initialMode,
}: {
  initialMode: CustomerAccessMode;
}) {
  const [mode, setMode] = useState<CustomerAccessMode>(initialMode);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const changeMode = (next: CustomerAccessMode) => {
    if (next === mode || isPending) return;
    const prev = mode;
    setMode(next);
    startTransition(async () => {
      const res = await setCustomerAccessMode(next);
      if (!res.ok) {
        setMode(prev);
        showToast(res.error);
      } else {
        showToast("保存しました");
      }
    });
  };

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="サイト設定"
        description="顧客向けサイトの公開範囲と会員登録の可否を設定します。"
      />

      <section className="mb-10">
        <SectionRule label="顧客の入口（カタログ閲覧）" className="mb-3" />
        <div className="space-y-2">
          {MODE_OPTIONS.map((opt) => {
            const active = mode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => changeMode(opt.value)}
                disabled={isPending}
                aria-pressed={active}
                className={`w-full text-left px-4 py-3 border transition-colors ${
                  active
                    ? "border-accent bg-[var(--color-accent-soft)]"
                    : "border-rule hover:bg-surface-muted"
                } ${isPending ? "opacity-60" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`inline-flex h-4 w-4 items-center justify-center rounded-full border ${
                      active ? "border-accent" : "border-rule-strong"
                    }`}
                  >
                    {active && (
                      <span className="h-2 w-2 rounded-full bg-accent" />
                    )}
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {opt.label}
                  </span>
                </div>
                <p className="mt-1 ml-6 text-xs text-muted leading-relaxed">
                  {opt.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {toast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px] pointer-events-none">
          <div className="bg-surface border border-rule-strong shadow-2xl px-8 py-6 flex flex-col items-center gap-3">
            <div className="w-10 h-10 bg-foreground flex items-center justify-center">
              <svg
                className="h-5 w-5 text-background"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-foreground">{toast}</p>
          </div>
        </div>
      )}
    </main>
  );
}
