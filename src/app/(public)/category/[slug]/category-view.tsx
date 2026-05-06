"use client";

import { Suspense, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import MaterialCard from "@/components/material-card";
import MaterialModal from "@/components/material-modal";
import type { Category, Material } from "@/lib/types";

function CategoryViewInner({
  category,
  materials,
}: {
  category: Category;
  materials: Material[];
}) {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [search, setSearch] = useState(initialQuery);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);

  const filtered = useMemo(
    () =>
      materials.filter((m) =>
        m.name.toLowerCase().includes(search.toLowerCase())
      ),
    [materials, search]
  );

  return (
    <>
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-subtle hover:text-accent transition-colors mb-5"
      >
        <span aria-hidden>←</span> 発注画面に戻る
      </Link>

      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        {category.name}
      </h1>
      <p className="text-sm text-muted mt-1">
        <span className="text-foreground font-medium">{filtered.length}</span> 件の資材
        {search && (
          <>
            <span className="mx-1.5 text-subtle">·</span>
            <span>キーワード: 「{search}」</span>
          </>
        )}
      </p>

      <div className="mt-5 mb-2">
        <div className="relative max-w-md">
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
            placeholder="この中から絞り込み"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 bg-surface border border-border rounded-lg text-sm placeholder:text-subtle focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 transition-colors"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-8 border-y border-border py-16 text-center">
          <p className="text-sm text-muted">
            {search ? "該当する資材がありません" : "資材が登録されていません"}
          </p>
        </div>
      ) : (
        <div className="mt-4 border-t border-border bg-surface rounded-xl border overflow-hidden">
          {filtered.map((material, index) => (
            <MaterialCard
              key={material.id}
              material={material}
              index={index}
              onClick={() => setSelectedMaterial(material)}
            />
          ))}
        </div>
      )}

      {selectedMaterial && (
        <MaterialModal
          material={selectedMaterial}
          onClose={() => setSelectedMaterial(null)}
        />
      )}
    </>
  );
}

export default function CategoryView(props: { category: Category; materials: Material[] }) {
  return (
    <Suspense fallback={<p className="text-subtle text-center py-16 text-sm">読み込み中…</p>}>
      <CategoryViewInner {...props} />
    </Suspense>
  );
}
