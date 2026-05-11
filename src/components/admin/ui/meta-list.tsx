export type MetaItem = {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
};

export default function MetaList({
  items,
  columns = 1,
  className = "",
}: {
  items: MetaItem[];
  columns?: 1 | 2;
  className?: string;
}) {
  const grid =
    columns === 2
      ? "grid grid-cols-1 md:grid-cols-2 md:gap-x-10"
      : "block";

  return (
    <dl className={`${grid} ${className}`}>
      {items.map((item, i) => (
        <div
          key={`${item.label}-${i}`}
          className="grid grid-cols-[8rem_1fr] gap-4 py-2.5 border-b border-rule last:border-b-0 md:[&:nth-last-child(2)]:border-b-0"
        >
          <dt className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wider text-subtle pt-0.5">
            {item.label}
          </dt>
          <dd
            className={`text-sm text-foreground min-w-0 ${
              item.mono ? "font-[family-name:var(--font-mono)] tabular-nums" : ""
            }`}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
