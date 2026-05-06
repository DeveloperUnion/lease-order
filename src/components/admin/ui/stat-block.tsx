import Link from "next/link";

export default function StatBlock({
  label,
  value,
  unit,
  hint,
  highlight = false,
  href,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  hint?: React.ReactNode;
  highlight?: boolean;
  href?: string;
  icon?: React.ReactNode;
}) {
  const content = (
    <div
      className={`relative px-5 py-5 sm:py-6 h-full ${
        highlight ? "border-l-2 border-accent" : ""
      } ${href ? "transition-colors hover:bg-surface-muted" : ""}`}
    >
      {icon && (
        <div className="absolute top-4 right-4 inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent-soft)] text-accent">
          {icon}
        </div>
      )}
      <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-subtle mb-3">
        {label}
      </p>
      <div className="flex items-baseline gap-1.5">
        <span className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold tabular-nums text-foreground leading-none">
          {value}
        </span>
        {unit && <span className="text-xs text-muted">{unit}</span>}
      </div>
      {hint && <p className="text-xs text-muted mt-2 leading-relaxed">{hint}</p>}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }
  return content;
}
