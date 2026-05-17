import Link from "next/link";

export const dynamic = "force-static";

export const metadata = {
  title: "オフライン",
};

export default function OfflinePage() {
  return (
    <main className="min-h-[100svh] flex items-center justify-center px-6 py-12 bg-surface-muted">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-accent-soft mb-5">
          <svg
            className="h-7 w-7 text-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.36 6.64A9 9 0 0120.78 13M5.64 17.36A9 9 0 013.22 11M12 20.5h.01M8.5 16.5a5 5 0 017 0M5 13a8 8 0 0114 0M2 9.5a12 12 0 0120 0"
            />
            <path strokeLinecap="round" d="M3 3l18 18" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-foreground">オフラインです</h1>
        <p className="mt-3 text-sm text-muted leading-relaxed">
          このページはまだキャッシュされていないため表示できません。
          一度オンラインでアクセスしたページは、圏外でも開けるようになります。
        </p>

        <div className="mt-7 flex flex-col gap-2">
          <Link
            href="/cart"
            className="h-11 inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            カートを開く
          </Link>
          <Link
            href="/drafts"
            className="h-11 inline-flex items-center justify-center gap-2 border border-border bg-surface text-foreground rounded-lg text-sm font-semibold hover:bg-surface-muted transition-colors"
          >
            下書き一覧
          </Link>
          <Link
            href="/outbox"
            className="h-11 inline-flex items-center justify-center gap-2 border border-border bg-surface text-foreground rounded-lg text-sm font-semibold hover:bg-surface-muted transition-colors"
          >
            送信待ち一覧
          </Link>
        </div>

        <p className="mt-6 text-xs text-subtle">
          回線が復帰すると、送信待ちの発注は自動的に送信されます。
        </p>
      </div>
    </main>
  );
}
