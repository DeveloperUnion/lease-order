import Link from "next/link";

type Align = "left" | "right" | "center";
type Density = "comfortable" | "compact";

export type Column<T> = {
  key: string;
  header: React.ReactNode;
  align?: Align;
  width?: string;
  mono?: boolean;
  cell: (row: T) => React.ReactNode;
};

const ALIGN_CLASS: Record<Align, string> = {
  left: "text-left justify-start",
  right: "text-right justify-end",
  center: "text-center justify-center",
};

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  empty = "該当する記録はありません",
  loading = false,
  density = "comfortable",
  caption,
  stickyHeader = false,
  stickyHeaderTop = "top-0",
  className = "",
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  empty?: React.ReactNode;
  loading?: boolean;
  density?: Density;
  caption?: string;
  stickyHeader?: boolean;
  stickyHeaderTop?: string;
  className?: string;
}) {
  const gridCols = columns
    .map((c) => c.width ?? (c.align === "right" ? "auto" : "1fr"))
    .join(" ");
  const rowPad =
    density === "compact" ? "px-3 py-2" : "px-3 py-3.5 sm:px-4 sm:py-4";
  const headerSticky = stickyHeader
    ? `sticky ${stickyHeaderTop} z-10 bg-surface-muted`
    : "bg-surface-muted/60";

  return (
    <div className={`border-y border-rule ${className}`}>
      {caption && <span className="sr-only">{caption}</span>}
      <div
        role="row"
        className={`grid items-end border-b border-rule ${headerSticky}`}
        style={{ gridTemplateColumns: gridCols }}
      >
        {columns.map((c) => (
          <div
            key={c.key}
            role="columnheader"
            className={`px-3 sm:px-4 py-3 text-xs sm:text-sm text-muted font-medium ${
              ALIGN_CLASS[c.align ?? "left"]
            } flex items-end`}
          >
            {c.header}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="divide-y divide-rule">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="grid animate-pulse"
              style={{ gridTemplateColumns: gridCols }}
            >
              {columns.map((c) => (
                <div key={c.key} className={rowPad}>
                  <div className="h-3 bg-surface-muted rounded" />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-subtle">{empty}</div>
      ) : (
        <div className="divide-y divide-rule">
          {rows.map((row) => {
            const href = rowHref?.(row);
            const key = rowKey(row);
            const cells = columns.map((c) => (
              <div
                key={c.key}
                className={`${rowPad} text-sm flex items-center min-w-0 ${
                  ALIGN_CLASS[c.align ?? "left"]
                } ${
                  c.mono
                    ? "font-[family-name:var(--font-mono)] tabular-nums"
                    : ""
                } ${c.align === "right" ? "tabular-nums" : ""}`}
              >
                <span className="min-w-0 truncate">{c.cell(row)}</span>
              </div>
            ));
            if (href) {
              return (
                <Link
                  key={key}
                  href={href}
                  className="grid hover:bg-surface-muted transition-colors"
                  style={{ gridTemplateColumns: gridCols }}
                >
                  {cells}
                </Link>
              );
            }
            return (
              <div
                key={key}
                role="row"
                className="grid"
                style={{ gridTemplateColumns: gridCols }}
              >
                {cells}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
