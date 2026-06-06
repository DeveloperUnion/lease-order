"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { verifyCustomerEmail, resendVerificationCode } from "../actions";

const inputClass =
  "w-full h-12 px-3.5 bg-surface border border-border rounded-lg text-lg tracking-[0.3em] text-center text-foreground placeholder:text-subtle placeholder:tracking-normal focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 transition-colors font-[family-name:var(--font-mono)]";

export default function VerifyForm({ email }: { email: string }) {
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    startTransition(async () => {
      const result = await verifyCustomerEmail({ email, code });
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      // 検証完了でログイン状態。カタログへ。
      router.push("/");
      router.refresh();
    });
  }

  function onResend() {
    setErrorMessage(null);
    setResent(false);
    startTransition(async () => {
      await resendVerificationCode({ email });
      setResent(true);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        required
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        placeholder="------"
        className={inputClass}
      />

      {errorMessage && (
        <div role="alert" className="px-3 py-2 rounded-lg border border-danger/30 bg-danger-soft text-sm text-danger">
          {errorMessage}
        </div>
      )}

      {resent && (
        <p className="text-sm text-accent">確認コードを再送信しました。</p>
      )}

      <button
        type="submit"
        disabled={isPending || code.length !== 6}
        className="w-full h-11 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-[background,transform] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.99]"
      >
        {isPending ? "確認中…" : "登録を完了する"}
      </button>

      <button
        type="button"
        onClick={onResend}
        disabled={isPending}
        className="w-full text-sm text-muted hover:text-accent transition-colors disabled:opacity-50"
      >
        コードを再送信する
      </button>
    </form>
  );
}
