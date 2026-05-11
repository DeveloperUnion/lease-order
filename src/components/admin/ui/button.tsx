import { forwardRef } from "react";
import Link from "next/link";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] border border-[var(--color-primary)] hover:bg-foreground hover:border-foreground",
  accent:
    "bg-accent text-white border border-accent hover:bg-accent-hover hover:border-accent-hover",
  secondary:
    "bg-surface text-foreground border border-rule hover:bg-surface-muted hover:border-[var(--color-border-strong)]",
  ghost:
    "bg-transparent text-foreground border border-transparent hover:bg-surface-muted",
  danger:
    "bg-[var(--color-status-rejected-bg)] text-[var(--color-status-rejected-fg)] border border-[var(--color-status-rejected-fg)]/20 hover:bg-[var(--color-status-rejected-fg)] hover:text-white",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-[var(--radius-sm)]",
  md: "h-10 px-4 text-sm rounded-[var(--radius-md)]",
  lg: "h-11 px-5 text-sm rounded-[var(--radius-md)]",
};

const BASE =
  "inline-flex items-center justify-center gap-1.5 font-medium tracking-wide " +
  "transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-[var(--ease-spring)] " +
  "active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 " +
  "focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)]/15 focus-visible:border-accent";

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
};

export const Button = forwardRef<
  HTMLButtonElement,
  CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function Button(
  { variant = "primary", size = "md", className = "", children, type = "button", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`${BASE} ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  href,
  children,
  ...rest
}: CommonProps & { href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <Link
      href={href}
      className={`${BASE} ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {children}
    </Link>
  );
}

export default Button;
