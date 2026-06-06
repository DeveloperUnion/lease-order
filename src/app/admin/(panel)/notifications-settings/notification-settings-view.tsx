"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader, SectionRule, Button } from "@/components/admin/ui";
import {
  startSlackConnect,
  disconnectSlack,
  sendTestSlack,
} from "./actions";

export type SlackConnection = {
  teamName: string | null;
  channelName: string | null;
} | null;

const SLACK_ERROR_LABEL: Record<string, string> = {
  state_mismatch: "セッションが一致しませんでした。もう一度お試しください",
  not_admin: "管理者としてログインしてから連携してください",
  not_configured: "Slack 連携が未設定です（環境変数）",
  access_denied: "Slack 側で連携が許可されませんでした",
  exchange_failed: "Slack との通信に失敗しました",
  save_failed: "設定の保存に失敗しました",
};

export default function NotificationSettingsView({
  slack,
}: {
  slack: SlackConnection;
}) {
  const params = useSearchParams();
  const connected = params.get("connected");
  const errorCode = params.get("error");

  const [toast, setToast] = useState<string | null>(
    connected === "slack" ? "Slack と連携しました" : null
  );
  const [error, setError] = useState<string | null>(
    errorCode ? SLACK_ERROR_LABEL[errorCode] ?? "連携に失敗しました" : null
  );
  const [isPending, startTransition] = useTransition();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const handleConnect = () => {
    setError(null);
    startTransition(async () => {
      try {
        const { url } = await startSlackConnect();
        window.location.assign(url);
      } catch (e) {
        setError(e instanceof Error ? e.message : "連携の開始に失敗しました");
      }
    });
  };

  const handleTest = () => {
    setError(null);
    startTransition(async () => {
      try {
        await sendTestSlack();
        showToast("テスト送信しました");
      } catch (e) {
        setError(e instanceof Error ? e.message : "テスト送信に失敗しました");
      }
    });
  };

  const handleDisconnect = () => {
    if (!confirm("Slack 連携を解除しますか？")) return;
    setError(null);
    startTransition(async () => {
      try {
        await disconnectSlack();
        showToast("連携を解除しました");
      } catch (e) {
        setError(e instanceof Error ? e.message : "連携解除に失敗しました");
      }
    });
  };

  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="通知連携"
        description="新規発注・返却申請・延長申請の通知を、社内の共有チャンネルへ自動投稿します。"
      />

      {error && (
        <p className="mb-6 text-sm text-[var(--color-status-rejected-fg)] border border-[var(--color-status-rejected-fg)]/20 bg-[var(--color-status-rejected-bg)] px-3 py-2">
          {error}
        </p>
      )}

      {/* Slack */}
      <section className="mb-10">
        <SectionRule label="Slack" className="mb-3" />
        <div className="border border-rule p-4 sm:p-5">
          {slack ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-foreground">
                  連携済み
                  {slack.teamName && (
                    <span className="text-subtle">（{slack.teamName}）</span>
                  )}
                </p>
                <p className="font-[family-name:var(--font-mono)] text-[11px] text-subtle mt-1">
                  投稿先: {slack.channelName ?? "選択チャンネル"}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleTest}
                  disabled={isPending}
                >
                  テスト送信
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDisconnect}
                  disabled={isPending}
                >
                  連携解除
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-subtle">
                ボタンを押すと Slack に移動し、投稿先チャンネルを選んで許可するだけで連携が完了します。
              </p>
              <Button
                size="md"
                variant="accent"
                onClick={handleConnect}
                disabled={isPending}
                className="shrink-0"
              >
                {isPending ? "処理中…" : "Slack と連携"}
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Chatwork / LINE WORKS（準備中の器） */}
      <section>
        <SectionRule label="その他の連携先" className="mb-3" />
        <div className="border border-rule divide-y divide-rule">
          {["Chatwork", "LINE WORKS"].map((name) => (
            <div
              key={name}
              className="flex items-center justify-between px-4 py-3"
            >
              <span className="text-sm text-foreground">{name}</span>
              <span className="font-[family-name:var(--font-mono)] text-[9px] px-1.5 py-0.5 bg-surface-muted text-subtle uppercase tracking-wider">
                準備中
              </span>
            </div>
          ))}
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
