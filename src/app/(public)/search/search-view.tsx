"use client";

import { useState } from "react";
import MaterialCard from "@/components/material-card";
import MaterialModal from "@/components/material-modal";
import type { Category, Material } from "@/lib/types";

export default function SearchView({
  query,
  results,
  categories,
}: {
  query: string;
  results: Material[];
  categories: Category[];
}) {
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);

  const getCategoryName = (categoryId: string) =>
    categories.find((c) => c.id === categoryId)?.name || "";

  const grouped = Array.from(new Set(results.map((r) => r.category_id))).map((catId) => ({
    catId,
    catName: getCategoryName(catId),
    materials: results.filter((r) => r.category_id === catId),
  }));

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        検索結果
      </h1>
      <p className="text-sm text-muted mt-1">
        キーワード「<span className="text-foreground font-medium">{query}</span>」
        <span className="mx-1.5 text-subtle">·</span>
        <span className="text-foreground font-medium">{results.length}</span> 件
      </p>

      {results.length === 0 ? (
        <div className="mt-8 border-y border-border py-16 text-center">
          <p className="text-sm text-muted">該当する資材がありません</p>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {grouped.map(({ catId, catName, materials }) => (
            <section key={catId}>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-base font-semibold text-foreground">
                  {catName}
                </h2>
                <span className="text-xs text-subtle">
                  {materials.length} 件
                </span>
              </div>
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                {materials.map((material, index) => (
                  <MaterialCard
                    key={material.id}
                    material={material}
                    index={index}
                    onClick={() => setSelectedMaterial(material)}
                  />
                ))}
              </div>
            </section>
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
