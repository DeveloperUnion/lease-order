"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerCustomer } from "./actions";

const inputClass =
  "w-full h-11 px-3.5 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-subtle focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 transition-colors";

export default function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    if (password.length < 8) {
      setErrorMessage("パスワードは 8 文字以上で入力してください");
      return;
    }
    if (password !== confirm) {
      setErrorMessage("確認用パスワードが一致しません");
      return;
    }
    startTransition(async () => {
      const result = await registerCustomer({ name, email, password });
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      router.push(`/signup/verify?email=${encodeURIComponent(result.email)}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1.5">
          会社名
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="株式会社○○建設"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
          メールアドレス
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          className={inputClass}
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
          autoComplete="new-password"
          placeholder="8 文字以上"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-foreground mb-1.5">
          パスワード（確認）
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          placeholder="もう一度入力"
          className={inputClass}
        />
      </div>

      {errorMessage && (
        <div role="alert" className="px-3 py-2 rounded-lg border border-danger/30 bg-danger-soft text-sm text-danger">
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || !name || !email || !password || !confirm}
        className="w-full h-11 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-[background,transform] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.99]"
      >
        {isPending ? "送信中…" : "確認コードを送信"}
      </button>
    </form>
  );
}
