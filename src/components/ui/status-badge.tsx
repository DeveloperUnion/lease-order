type Tone = "neutral" | "accent" | "info" | "success" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-muted text-muted",
  accent: "bg-accent-soft text-accent",
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

type Props = {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
};

export default function StatusBadge({ tone = "neutral", children, className }: Props) {
  return (
    <span
      className={`inline-flex items-center px-2 h-[20px] rounded-full text-[11px] font-semibold ${TONES[tone]} ${className ?? ""}`}
    >
      {children}
    </span>
  );
}
