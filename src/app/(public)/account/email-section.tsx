"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestEmailChange, confirmEmailChange } from "./actions";

type Props = {
  initialEmail: string;
  initialVerified: boolean;
};

export default function EmailSection({ initialEmail, initialVerified }: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [verified, setVerified] = useState(initialVerified && !!initialEmail);
  const [editing, setEditing] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [stage, setStage] = useState<"input" | "code">("input");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function sendCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await requestEmailChange({ email: pendingEmail });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStage("code");
    });
  }

  function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await confirmEmailChange({ code });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEmail(res.email);
      setVerified(true);
      setEditing(false);
      setStage("input");
      setPendingEmail("");
      setCode("");
      setDone("通知メールを登録しました");
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {email ? (
            <>
              <span className="text-sm text-foreground font-[family-name:var(--font-mono)] break-all">
                {email}
              </span>
              {verified ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-success-soft text-success font-semibold">
                  確認済み
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning-soft text-warning font-semibold">
                  未確認
                </span>
              )}
            </>
          ) : (
            <span className="text-sm text-subtle">未登録</span>
          )}
        </div>
        <p className="text-xs text-subtle leading-relaxed">
          発注の受付・承認・出荷などの通知をメールで受け取るには、メールアドレスの登録（確認）が必要です。
        </p>
        {done && <p className="text-xs text-success">{done}</p>}
        <button
          type="button"
          onClick={() => {
            setEditing(true);
            setStage("input");
            setPendingEmail("");
            setError(null);
            setDone(null);
          }}
          className="px-4 h-9 inline-flex items-center bg-surface border border-border text-sm font-medium rounded-lg hover:border-border-strong hover:bg-surface-muted transition-colors"
        >
          {email ? "メールを変更" : "メールを登録"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {stage === "input" ? (
        <form onSubmit={sendCode} className="space-y-3">
          <input
            type="email"
            required
            value={pendingEmail}
            onChange={(e) => setPendingEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full h-10 px-3.5 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 transition-colors"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isPending || !pendingEmail}
              className="px-4 h-9 inline-flex items-center bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? "送信中…" : "確認コードを送信"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-4 h-9 inline-flex items-center text-sm text-muted hover:text-foreground"
            >
              キャンセル
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <p className="text-xs text-muted leading-relaxed">
            <span className="text-foreground font-medium break-all">{pendingEmail}</span>
            <br />
            宛に送信した 6 桁の確認コードを入力してください。
          </p>
          <input
            inputMode="numeric"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="------"
            className="w-40 h-11 px-3.5 bg-surface border border-border rounded-lg text-lg tracking-[0.3em] text-center font-[family-name:var(--font-mono)] focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 transition-colors"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isPending || code.length !== 6}
              className="px-4 h-9 inline-flex items-center bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? "確認中…" : "登録する"}
            </button>
            <button
              type="button"
              onClick={() => setStage("input")}
              className="px-4 h-9 inline-flex items-center text-sm text-muted hover:text-foreground"
            >
              戻る
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
