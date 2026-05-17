"use client";

import { Suspense, use, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./sidebar";
import AdminNotificationBell from "./admin-notification-bell";
import type {
  NotificationBellData,
  SidebarData,
} from "@/lib/admin-shell-data";

function SidebarWithData({
  promise,
  onNavigate,
}: {
  promise: Promise<SidebarData>;
  onNavigate?: () => void;
}) {
  const { pendingCount, pendingRequestCount, chatUnreadCount, email } = use(promise);
  return (
    <Sidebar
      pendingCount={pendingCount}
      pendingRequestCount={pendingRequestCount}
      chatUnreadCount={chatUnreadCount}
      email={email}
      onNavigate={onNavigate}
    />
  );
}

function BellWithData({
  promise,
}: {
  promise: Promise<NotificationBellData>;
}) {
  const { unreadCount, recent } = use(promise);
  return <AdminNotificationBell unreadCount={unreadCount} recent={recent} />;
}

function SidebarSkeleton() {
  return (
    <div className="flex h-full w-full flex-col bg-surface">
      <div className="px-5 py-5 border-b border-rule">
        <div className="h-5 w-32 bg-surface-muted rounded animate-pulse" />
      </div>
      <div className="flex-1 px-3 py-5 space-y-6">
        {[0, 1, 2].map((g) => (
          <div key={g} className="space-y-2">
            <div className="px-3 h-3 w-16 bg-surface-muted rounded animate-pulse" />
            <div className="space-y-1">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-8 mx-1 bg-surface-muted rounded animate-pulse"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BellSkeleton() {
  return (
    <div className="h-10 w-10 rounded-lg border border-border bg-surface-muted/40 animate-pulse" />
  );
}

export default function AdminShell({
  sidebarPromise,
  notificationPromise,
  children,
}: {
  sidebarPromise: Promise<SidebarData>;
  notificationPromise: Promise<NotificationBellData>;
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
        <Suspense fallback={<SidebarSkeleton />}>
          <SidebarWithData promise={sidebarPromise} />
        </Suspense>
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
        <Suspense fallback={<SidebarSkeleton />}>
          <SidebarWithData
            promise={sidebarPromise}
            onNavigate={() => setDrawerOpen(false)}
          />
        </Suspense>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="sticky top-0 z-30 h-14 shrink-0 flex items-center gap-3 px-4 bg-surface border-b border-rule">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden p-1.5 -ml-1.5 rounded hover:bg-surface-muted"
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
          <span className="lg:hidden font-[family-name:var(--font-display)] text-base tracking-tight text-foreground">
            管理コンソール
          </span>
          <div className="ml-auto">
            <Suspense fallback={<BellSkeleton />}>
              <BellWithData promise={notificationPromise} />
            </Suspense>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">{children}</div>
      </div>
    </div>
  );
}
