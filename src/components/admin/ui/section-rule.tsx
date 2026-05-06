type Weight = "default" | "strong";

export default function SectionRule({
  label,
  weight = "default",
  right,
  className = "",
}: {
  label?: string;
  weight?: Weight;
  right?: React.ReactNode;
  className?: string;
}) {
  const ruleColor =
    weight === "strong" ? "border-[var(--color-rule-strong)]" : "border-rule";

  if (!label && !right) {
    return <hr className={`border-t ${ruleColor} ${className}`} />;
  }

  return (
    <div className={`flex items-end gap-3 ${className}`}>
      {label && (
        <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-subtle whitespace-nowrap">
          {label}
        </span>
      )}
      <span className={`flex-1 border-t ${ruleColor} mb-1.5`} aria-hidden />
      {right && <span className="whitespace-nowrap">{right}</span>}
    </div>
  );
}
