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
    <div className={`flex items-center gap-3 ${className}`}>
      {label && (
        <h2 className="text-sm sm:text-base font-semibold text-foreground whitespace-nowrap tracking-tight">
          {label}
        </h2>
      )}
      <span className={`flex-1 border-t ${ruleColor}`} aria-hidden />
      {right && <span className="whitespace-nowrap">{right}</span>}
    </div>
  );
}
