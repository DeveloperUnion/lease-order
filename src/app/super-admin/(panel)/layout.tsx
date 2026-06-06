import Link from "next/link";
import { getCurrentSuperAdminEmail } from "@/lib/current-super-admin";
import { signOut } from "../auth-actions";

export const dynamic = "force-dynamic";

export default async function SuperAdminPanelLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // 認証は proxy（superAdminProxy）で済んでいる。表示用に email だけ取る。
  const email = await getCurrentSuperAdminEmail();

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-surface-muted font-[family-name:var(--font-body)]">
      <header className="flex items-center justify-between gap-4 px-4 sm:px-6 h-14 bg-foreground text-background flex-shrink-0">
        <div className="flex items-center gap-6 min-w-0">
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-background/60">
              super-admin
            </span>
            <span className="font-[family-name:var(--font-display)] text-base font-semibold tracking-tight truncate">
              運営コンソール
            </span>
          </Link>
          <nav className="hidden sm:flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-background/80 hover:text-background transition-colors"
            >
              テナント一覧
            </Link>
            <Link
              href="/tenants/new"
              className="text-sm text-background/80 hover:text-background transition-colors"
            >
              新規テナント
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 min-w-0">
          {email && (
            <span className="hidden sm:inline font-[family-name:var(--font-mono)] text-[11px] text-background/60 truncate max-w-[200px]">
              {email}
            </span>
          )}
          <form action={signOut}>
            <button
              type="submit"
              className="text-sm text-background/80 hover:text-background transition-colors"
            >
              ログアウト
            </button>
          </form>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
