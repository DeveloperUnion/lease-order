import { peekAdminPasswordResetToken } from "@/lib/admin-password-reset";
import ResetPasswordForm from "./reset-password-form";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ token?: string }>;

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { token } = await searchParams;
  const valid = token ? await peekAdminPasswordResetToken(token) : false;

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16 sm:py-24 bg-background">
      <div className="w-full max-w-md">
        <div className="bg-surface border border-rule-strong">
          <header className="px-8 pt-8 pb-5 border-b border-rule">
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-foreground">
              新しいパスワードの設定
            </h1>
            <p className="text-sm text-muted mt-2 leading-relaxed">
              新しいパスワードを入力してください。
            </p>
          </header>

          <div className="px-8 py-6">
            {valid && token ? (
              <ResetPasswordForm token={token} />
            ) : (
              <div className="text-sm text-muted leading-relaxed">
                <p>このリンクは無効か、有効期限が切れています。</p>
                <p className="mt-4">
                  <a
                    href="/admin/forgot-password"
                    className="text-accent hover:text-accent-hover underline"
                  >
                    再度パスワード再設定を申請する
                  </a>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
