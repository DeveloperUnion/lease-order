export type MetaItem = {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
};

export default function MetaList({
  items,
  className = "",
}: {
  items: MetaItem[];
  className?: string;
}) {
  return (
    <dl
      className={`border border-rule rounded-[var(--radius-lg)] overflow-hidden bg-surface ${className}`}
    >
      {items.map((item, i) => (
        <div
          key={`${item.label}-${i}`}
          className="grid grid-cols-[7rem_1fr] sm:grid-cols-[10rem_1fr] border-b border-rule last:border-b-0"
        >
          <dt className="bg-surface-muted text-sm text-muted font-medium px-3 py-3 sm:px-4 sm:py-3.5 border-r border-rule">
            {item.label}
          </dt>
          <dd
            className={`text-sm sm:text-base text-foreground px-3 py-3 sm:px-4 sm:py-3.5 min-w-0 break-words ${
              item.mono
                ? "font-[family-name:var(--font-mono)] tabular-nums"
                : ""
            }`}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
