"use client";

import Image from "next/image";
import { Material } from "@/lib/types";

type Props = {
  material: Material;
  onClick: () => void;
  index?: number;
};

export default function MaterialCard({ material, onClick, index = 0 }: Props) {
  const thumb = material.image_url || material.catalog_pages?.[0] || null;

  return (
    <button
      onClick={onClick}
      className="group w-full flex items-center gap-4 px-4 py-3 text-left bg-surface border-b border-border hover:bg-surface-muted transition-colors motion-safe:opacity-0 motion-safe:animate-[reveal-up_360ms_ease-out_both]"
      style={{ animationDelay: `${Math.min(index, 12) * 50}ms` }}
    >
      <div className="relative h-14 w-14 flex-shrink-0 rounded-lg border border-border bg-surface-muted overflow-hidden">
        {thumb ? (
          <Image
            src={thumb}
            alt=""
            fill
            sizes="56px"
            className="object-contain"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[10px] text-subtle">
            画像なし
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-foreground group-hover:text-accent transition-colors truncate">
          {material.name}
        </h3>
        {material.description && (
          <p className="text-xs text-muted mt-0.5 truncate">{material.description}</p>
        )}
        {material.spec && Object.keys(material.spec).length > 0 && (
          <p className="text-[11px] text-subtle mt-1 truncate">
            {Object.entries(material.spec)
              .slice(0, 3)
              .map(([k, v]) => `${k}: ${v}`)
              .join("  /  ")}
          </p>
        )}
      </div>

      <span aria-hidden className="text-sm text-subtle group-hover:text-accent transition-colors flex-shrink-0">
        →
      </span>
    </button>
  );
}
