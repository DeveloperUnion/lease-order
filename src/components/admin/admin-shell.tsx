"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./sidebar";

export default function AdminShell({
  pendingCount,
  email,
  children,
}: {
  pendingCount: number;
  email: string | null;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // Close the mobile drawer on any route change (covers browser back/forward
    // in addition to in-drawer link clicks, which already call onNavigate).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="flex flex-1 min-h-0">
      <aside className="hidden lg:flex w-64 flex-shrink-0 border-r border-rule">
        <Sidebar pendingCount={pendingCount} email={email} />
      </aside>

      {drawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-200 border-r border-rule shadow-xl bg-surface ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar
          pendingCount={pendingCount}
          email={email}
          onNavigate={() => setDrawerOpen(false)}
        />
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="lg:hidden sticky top-0 z-30 h-14 flex items-center gap-3 px-4 bg-surface border-b border-rule">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="p-1.5 -ml-1.5 rounded hover:bg-surface-muted"
            aria-label="メニューを開く"
          >
            <svg
              className="h-5 w-5 text-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-[family-name:var(--font-display)] text-base tracking-tight text-foreground">
            管理コンソール
          </span>
        </header>

        {children}
      </div>
    </div>
  );
}
