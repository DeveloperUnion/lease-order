import SectionRule from "./section-rule";

export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className = "",
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={`mb-6 ${className}`}>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          {eyebrow && (
            <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.22em] text-subtle mb-2">
              {eyebrow}
            </p>
          )}
          <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold tracking-tight text-foreground leading-tight">
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
