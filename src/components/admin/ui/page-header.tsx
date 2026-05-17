import Link from "next/link";
import SectionRule from "./section-rule";

export default function PageHeader({
  backHref,
  backLabel,
  eyebrow,
  title,
  description,
  actions,
  className = "",
}: {
  backHref?: string;
  backLabel?: string;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={`mb-6 ${className}`}>
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground transition-colors mb-4"
        >
          <span aria-hidden>←</span>
          {backLabel ?? "戻る"}
        </Link>
      )}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          {eyebrow && (
            <p className="font-[family-name:var(--font-mono)] text-sm sm:text-base text-muted font-medium tabular-nums mb-2">
              {eyebrow}
            </p>
          )}
          <h1 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl font-semibold tracking-tight text-foreground leading-tight">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted mt-2 max-w-2xl leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
      <SectionRule weight="strong" className="mt-5" />
    </header>
  );
}
