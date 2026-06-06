import ChangePasswordForm from "./change-password-form";

export const dynamic = "force-dynamic";

export default function AdminChangePasswordPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16 sm:py-24 bg-background">
      <div className="w-full max-w-md">
        <div className="bg-surface border border-rule-strong">
          <header className="px-8 pt-8 pb-5 border-b border-rule">
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-foreground">
              パスワードの変更
            </h1>
            <p className="text-sm text-muted mt-2 leading-relaxed">
              初期パスワードでサインインしました。
              <br className="sm:hidden" />
              続行するには新しいパスワードを設定してください。
            </p>
          </header>

          <div className="px-8 py-6">
            <ChangePasswordForm />
          </div>
        </div>
      </div>
    </main>
  );
}
