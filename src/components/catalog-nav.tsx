"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { Category } from "@/lib/types";

type Props = {
  categories: Pick<Category, "id" | "name" | "slug">[];
};

function isActiveSlug(pathname: string, slug: string) {
  return pathname === `/category/${slug}`;
}

export default function CatalogNav({ categories }: Props) {
  const pathname = usePathname();

  return (
    <>
      <CatalogSidebar categories={categories} pathname={pathname} />
      <CatalogTabs categories={categories} pathname={pathname} />
    </>
  );
}

function CatalogSidebar({
  categories,
  pathname,
}: Props & { pathname: string }) {
  return (
    <aside className="hidden md:flex md:flex-col md:w-52 md:shrink-0 md:sticky md:top-14 md:h-[calc(100dvh-3.5rem)] md:overflow-y-auto bg-surface border-r border-border">
      <div className="px-4 pt-5 pb-2 text-[11px] font-semibold tracking-wider text-subtle uppercase">
        カテゴリ
      </div>
      <nav className="flex-1 px-2 pb-4 space-y-0.5">
        <SidebarItem
          href="/"
          label="すべて"
          active={pathname === "/"}
        />
        {categories.map((c) => (
          <SidebarItem
            key={c.id}
            href={`/category/${c.slug}`}
            label={c.name}
            active={isActiveSlug(pathname, c.slug)}
          />
        ))}
      </nav>
    </aside>
  );
}

function SidebarItem({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center px-3 py-2 rounded-lg text-sm transition-colors duration-150 ${
        active
          ? "bg-accent-soft text-accent font-medium"
          : "text-muted hover:bg-surface-muted hover:text-foreground"
      }`}
    >
      <span className="truncate">{label}</span>
    </Link>
  );
}

function CatalogTabs({
  categories,
  pathname,
}: Props & { pathname: string }) {
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  }, [pathname]);

  return (
    <div className="md:hidden sticky top-14 z-30 bg-surface/95 backdrop-blur border-b border-border">
      <div className="flex gap-2 overflow-x-auto snap-x px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <TabPill
          ref={pathname === "/" ? activeRef : undefined}
          href="/"
          label="すべて"
          active={pathname === "/"}
        />
        {categories.map((c) => {
          const active = isActiveSlug(pathname, c.slug);
          return (
            <TabPill
              key={c.id}
              ref={active ? activeRef : undefined}
              href={`/category/${c.slug}`}
              label={c.name}
              active={active}
            />
          );
        })}
      </div>
    </div>
  );
}

const TabPill = ({
  ref,
  href,
  label,
  active,
}: {
  ref?: React.Ref<HTMLAnchorElement>;
  href: string;
  label: string;
  active: boolean;
}) => (
  <Link
    ref={ref}
    href={href}
    className={`flex-none snap-start rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
      active
        ? "border-accent bg-accent-soft text-accent font-medium"
        : "border-border bg-surface text-muted hover:text-foreground"
    }`}
  >
    {label}
  </Link>
);
