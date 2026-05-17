"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useLiveChatUnread } from "./chat/use-live-chat-unread";

type CustomerSummary = { id: string; company_id: string; name: string };

type NavItem = {
  label: string;
  href: string;
  isActive: (pathname: string) => boolean;
  badge?: number;
  icon: (active: boolean) => React.ReactNode;
};

function ItemIcon({ d, active }: { d: string; active: boolean }) {
  return (
    <svg
      className={`h-[18px] w-[18px] ${active ? "text-accent" : "text-muted"}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.6}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function getNavItems(overdueCount: number, chatUnreadCount: number): NavItem[] {
  return [
    {
      label: "発注",
      href: "/",
      isActive: (p) => p === "/" || p.startsWith("/category") || p.startsWith("/search") || p.startsWith("/cart"),
      icon: (active) => <ItemIcon active={active} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />,
    },
    {
      label: "レンタル品",
      href: "/rentals",
      isActive: (p) => p.startsWith("/rentals"),
      badge: overdueCount,
      icon: (active) => (
        <svg
          className={`h-[18px] w-[18px] ${active ? "text-accent" : "text-muted"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
          <path d="M3.27 6.96L12 12.01l8.73-5.05" />
          <path d="M12 22.08V12" />
        </svg>
      ),
    },
    {
      label: "発注履歴",
      href: "/orders",
      isActive: (p) => p.startsWith("/orders"),
      icon: (active) => (
        <ItemIcon
          active={active}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
        />
      ),
    },
    {
      label: "連絡",
      href: "/messages",
      isActive: (p) => p.startsWith("/messages"),
      badge: chatUnreadCount,
      icon: (active) => (
        <ItemIcon
          active={active}
          d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"
        />
      ),
    },
    {
      label: "マイページ",
      href: "/account",
      isActive: (p) => p.startsWith("/account"),
      icon: (active) => (
        <ItemIcon
          active={active}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      ),
    },
  ];
}

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="absolute top-1.5 right-2 md:top-3 md:right-3 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-danger text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function CustomerNav({
  customer,
  overdueCount,
  chatUnreadCount,
}: {
  customer: CustomerSummary;
  overdueCount: number;
  chatUnreadCount: number;
}) {
  const pathname = usePathname();
  // チャット未読は realtime で生かしておく。新着 / 既読化を即時反映するため
  // チャット画面が router.refresh を呼ばずに済む。
  const liveChatUnread = useLiveChatUnread(chatUnreadCount, "customer");
  const items = getNavItems(overdueCount, liveChatUnread);

  if (pathname.startsWith("/admin") || pathname === "/login") {
    return null;
  }

  return (
    <>
      {/* PC: 左サイドバー */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-56 flex-col bg-surface border-r border-border z-40">
        <Link href="/" className="flex items-center gap-2 px-5 py-5 border-b border-border">
          <Image
            src="/images/logo-union.png"
            alt="union"
            width={486}
            height={823}
            priority
            className="h-9 w-auto"
          />
          <span className="text-base font-bold tracking-tight text-accent leading-none">
            発注<span className="text-[10px] font-medium ml-0.5 align-baseline">for リース</span>
          </span>
        </Link>

        <nav className="flex-1 px-2 pt-4 pb-4 space-y-0.5">
          {items.map((item) => {
            const active = item.isActive(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ease-[cubic-bezier(.2,.8,.2,1)] ${
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:bg-surface-muted hover:text-foreground"
                }`}
              >
                {item.icon(active)}
                <span className="flex-1">{item.label}</span>
                {item.badge ? <Badge count={item.badge} /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border px-5 py-4">
          <p className="text-sm font-medium text-foreground truncate leading-snug">{customer.name}</p>
          <p className="text-xs text-subtle truncate mt-0.5">{customer.company_id}</p>
        </div>
      </aside>

      {/* モバイル: ボトムタブ */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-surface border-t border-border z-40 grid grid-cols-5 pb-[env(safe-area-inset-bottom,0)]">
        {items.map((item) => {
          const active = item.isActive(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                active ? "text-accent" : "text-muted hover:text-foreground"
              }`}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-accent rounded-full"
                />
              )}
              {item.icon(active)}
              <span>{item.label}</span>
              {item.badge ? <Badge count={item.badge} /> : null}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
