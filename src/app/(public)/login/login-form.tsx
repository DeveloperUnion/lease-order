"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { login } from "./actions";

export default function LoginForm({ next }: { next?: string }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    startTransition(async () => {
      const result = await login({ identifier, password, next });
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      router.push(next || "/");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label htmlFor="identifier" className="block text-sm font-medium text-foreground mb-1.5">
          会社 ID またはメールアドレス
        </label>
        <input
          id="identifier"
          name="identifier"
          type="text"
          required
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          placeholder="C-2026-001 / you@example.com"
          className="w-full h-11 px-3.5 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-subtle focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 transition-colors"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">
          パスワード
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="w-full h-11 px-3.5 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-subtle focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 transition-colors"
        />
      </div>

      {errorMessage && (
        <div role="alert" className="px-3 py-2 rounded-lg border border-danger/30 bg-danger-soft text-sm text-danger">
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || !identifier || !password}
        className="w-full h-11 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-[background,transform] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.99] inline-flex items-center justify-center gap-2"
      >
        {isPending ? "ログイン中…" : "ログイン"}
        <span aria-hidden>→</span>
      </button>
    </form>
  );
}
