"use client";

import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/lib/cart-context";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";

type CustomerSummary = { id: string; company_id: string; name: string };

type SearchResult = {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  category_slug: string;
};

function SearchBar({ className }: { className?: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // q が変わったら 200ms debounce で /api/catalog/search を叩く。
  // 直前のリクエストは AbortController で打ち切り、応答順の逆転で古い結果が
  // 表示されるのを防ぐ。
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/catalog/search?q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal }
        );
        if (!res.ok) {
          setResults([]);
          return;
        }
        const data = (await res.json()) as { results?: SearchResult[] };
        setResults(data.results ?? []);
      } catch (e) {
        if ((e as { name?: string }).name !== "AbortError") {
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(handle);
      ctrl.abort();
    };
  }, [query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const showDropdown = focused && query.trim().length > 0;

  const handleSelect = (result: SearchResult) => {
    router.push(`/category/${result.category_slug}?q=${encodeURIComponent(query.trim())}`);
    setQuery("");
    setFocused(false);
  };

  return (
    <div ref={wrapperRef} className={`relative ${className || ""}`}>
      <div className="relative">
        <svg
          aria-hidden
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-subtle pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
        <input
          type="text"
          placeholder="資材名で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          className="w-full h-10 pl-10 pr-9 bg-surface border border-border rounded-lg text-sm placeholder:text-subtle focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 transition-colors"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setFocused(false); }}
            aria-label="クリア"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center text-subtle hover:text-foreground"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-surface rounded-md shadow-lg border border-border overflow-hidden z-50 max-h-[70vh] overflow-y-auto">
          {loading && results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-subtle">検索中…</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-subtle">
              該当する資材がありません
            </div>
          ) : (
            <ul className="divide-y divide-ruled/60">
              {results.map((material) => (
                <li key={material.id}>
                  <button
                    onClick={() => handleSelect(material)}
                    className="w-full px-4 py-3 text-left hover:bg-surface-muted flex items-center gap-3 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{material.name}</p>
                      <p className="text-xs text-subtle mt-0.5">
                        {material.category_name}
                      </p>
                    </div>
                    <span aria-hidden className="text-subtle">→</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function HeaderClient({
  customer,
  notificationBell,
}: {
  customer: CustomerSummary | null;
  notificationBell: React.ReactNode;
}) {
  const { totalItems } = useCart();
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");
  const isLogin = pathname === "/login";

  if (isLogin) {
    return null;
  }

  if (isAdmin) {
    return (
      <header className="sticky top-0 z-30 bg-surface border-b border-border">
        <div className="max-w-6xl mx-auto px-4">
          <div className="h-16 sm:h-20 flex items-center justify-between gap-4">
            <Link href="/admin" className="flex items-center gap-2.5 flex-shrink-0">
              <Image
                src="/images/logo-union.png"
                alt="union"
                width={486}
                height={823}
                priority
                className="h-12 sm:h-14 w-auto"
              />
              <span className="text-lg sm:text-2xl font-bold tracking-tight text-accent">発注<span className="text-xs sm:text-sm font-medium ml-1">for リース</span></span>
            </Link>
          </div>
        </div>
      </header>
    );
  }

  // 顧客ビュー: PC ではサイドバーがあるためロゴ非表示。検索バーとカートを表示
  return (
    <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-border md:pl-56">
      <div className="max-w-6xl mx-auto px-4">
        {/* PC: 検索バーを中央配置、アイコン群は absolute で右端固定。
            モバイル: 通常の flex 並びでロゴ→検索→アイコン。 */}
        <div className="relative h-16 flex items-center gap-3 md:justify-center">
          {/* モバイルのみロゴを表示 */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0 md:hidden">
            <Image
              src="/images/logo-union.png"
              alt="union"
              width={486}
              height={823}
              priority
              className="h-9 w-auto"
            />
          </Link>

          <SearchBar className="flex-1 max-w-lg md:flex-none md:w-[28rem]" />

          {customer && (
            <div className="flex items-center gap-2 flex-shrink-0 md:absolute md:right-0 md:top-1/2 md:-translate-y-1/2">
              {notificationBell}
              <Link
                href="/cart"
                aria-label="カート"
                className="relative inline-flex items-center justify-center h-10 w-10 rounded-lg border border-border hover:border-border-strong hover:bg-surface-muted transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                {totalItems > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full text-[10px] font-bold bg-accent text-accent-ink">
                    {totalItems}
                  </span>
                )}
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
