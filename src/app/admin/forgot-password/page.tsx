import ForgotPasswordForm from "./forgot-password-form";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16 sm:py-24 bg-background">
      <div className="w-full max-w-md">
        <div className="bg-surface border border-rule-strong">
          <header className="px-8 pt-8 pb-5 border-b border-rule">
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-foreground">
              パスワードの再設定
            </h1>
            <p className="text-sm text-muted mt-2 leading-relaxed">
              登録済みのメールアドレスを入力してください。
              <br className="sm:hidden" />
              再設定用のリンクをお送りします。
            </p>
          </header>

          <div className="px-8 py-6">
            <ForgotPasswordForm />
          </div>
        </div>

        <p className="text-center mt-6">
          <a
            href="/admin/login"
            className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-subtle hover:text-foreground"
          >
            ← サインインに戻る
          </a>
        </p>
      </div>
    </main>
  );
}
