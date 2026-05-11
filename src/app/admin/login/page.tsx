import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ error?: string; next?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  not_allowed: "このメールアドレスは管理画面のアクセス権がありません。",
  invalid_code: "ログインリンクが無効か期限切れです。再度メールを送信してください。",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error, next } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : null;

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16 sm:py-24 bg-background">
      <div className="w-full max-w-md">
        <div className="bg-surface border border-rule-strong">
          <header className="px-8 pt-8 pb-5 border-b border-rule">
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-foreground">
              管理コンソール
            </h1>
            <p className="text-sm text-muted mt-2 leading-relaxed">
              登録済みのメールアドレス宛に
              <br className="sm:hidden" />
              ログインリンクを送信します。
            </p>
          </header>

          <div className="px-8 py-6">
            {errorMessage && (
              <div
                role="alert"
                className="mb-5 px-4 py-3 border-l-2 border-[var(--color-status-rejected-fg)] bg-[var(--color-status-rejected-bg)] text-sm text-[var(--color-status-rejected-fg)]"
              >
                {errorMessage}
              </div>
            )}

            <LoginForm next={next} />
          </div>
        </div>

        <p className="text-center font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-subtle mt-6">
          アクセス権が必要な場合は管理者までお問い合わせください
        </p>
      </div>
    </main>
  );
}
