"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/admin/auth-actions";
import { useLiveChatUnread } from "@/components/chat/use-live-chat-unread";

type NavItem = {
  href: string;
  label: string;
  badge?: number;
  disabled?: boolean;
  hint?: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

export type SidebarProps = {
  pendingCount: number;
  pendingRequestCount: number;
  chatUnreadCount: number;
  email: string | null;
  onNavigate?: () => void;
};

export default function Sidebar({
  pendingCount,
  pendingRequestCount,
  chatUnreadCount,
  email,
  onNavigate,
}: SidebarProps) {
  const pathname = usePathname();
  // チャット未読を realtime で生かしておく。既読化や着信を router.refresh なしで反映するため
  const liveChatUnread = useLiveChatUnread(chatUnreadCount, "admin");

  const groups: NavGroup[] = [
    {
      label: "業務",
      items: [
        { href: "/admin", label: "ダッシュボード" },
        {
          href: "/admin/orders",
          label: "発注管理",
          badge: pendingCount > 0 ? pendingCount : undefined,
        },
        {
          href: "/admin/requests",
          label: "返却・延長申請",
          badge: pendingRequestCount > 0 ? pendingRequestCount : undefined,
        },
        {
          href: "/admin/messages",
          label: "メッセージ",
          badge: liveChatUnread > 0 ? liveChatUnread : undefined,
        },
      ],
    },
    {
      label: "マスタ",
      items: [
        { href: "/admin/materials", label: "資材" },
        { href: "/admin/categories", label: "カテゴリ" },
        { href: "/admin/offices", label: "営業所" },
        { href: "/admin/customers", label: "顧客" },
      ],
    },
    {
      label: "設定",
      items: [{ href: "/admin/users", label: "管理ユーザー" }],
    },
  ];

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <div className="flex h-full w-full flex-col bg-surface">
      <div className="px-5 py-5 border-b border-rule">
        <Link
          href="/admin"
          onClick={onNavigate}
          className="block font-[family-name:var(--font-display)] text-lg leading-none tracking-tight text-foreground hover:text-accent transition-colors"
        >
          管理コンソール
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.22em] text-subtle">
              {group.label}
            </p>
            <ul className="space-y-px">
              {group.items.map((item) => {
                if (item.disabled) {
                  return (
                    <li key={item.href}>
                      <span className="flex items-center justify-between pl-3 pr-3 py-2 text-sm text-subtle cursor-not-allowed border-l-2 border-transparent">
                        <span>{item.label}</span>
                        {item.hint && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-surface-muted text-subtle font-[family-name:var(--font-mono)] uppercase tracking-wider">
                            {item.hint}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                }
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center justify-between pl-3 pr-3 py-2 text-sm transition-colors border-l-2 ${
                        active
                          ? "border-accent bg-[var(--color-accent-soft)] text-accent font-medium"
                          : "border-transparent text-foreground hover:bg-surface-muted"
                      }`}
                    >
                      <span>{item.label}</span>
                      {item.badge !== undefined && (
                        <span className="font-[family-name:var(--font-mono)] tabular-nums text-[10px] px-1.5 py-0.5 min-w-[20px] text-center bg-[var(--color-status-pending-bg)] text-[var(--color-status-pending-fg)]">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-rule px-5 py-4 space-y-2">
        {email && (
          <p
            className="font-[family-name:var(--font-mono)] text-[10px] text-subtle truncate"
            title={email}
          >
            {email}
          </p>
        )}
        <form action={signOut}>
          <button
            type="submit"
            className="text-xs text-muted hover:text-accent transition-colors font-[family-name:var(--font-mono)] uppercase tracking-wider"
          >
            サインアウト
          </button>
        </form>
      </div>
    </div>
  );
}
