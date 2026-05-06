import { forwardRef } from "react";

const fieldBase =
  "w-full bg-surface border border-rule text-sm text-foreground placeholder:text-subtle rounded-[var(--radius-sm)] " +
  "focus:outline-none focus:border-accent focus:ring-4 focus:ring-[var(--color-accent)]/15 " +
  "disabled:opacity-50 disabled:cursor-not-allowed transition-[border-color,box-shadow] duration-150 ease-[var(--ease-spring)]";

export const TextInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function TextInput({ className = "", ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={`${fieldBase} h-10 px-3 ${className}`}
      {...rest}
    />
  );
});

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea({ className = "", ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={`${fieldBase} px-3 py-2 ${className}`}
      {...rest}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className = "", children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={`${fieldBase} h-10 px-3 pr-8 ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
});

export default function FormField({
  label,
  htmlFor,
  hint,
  error,
  required,
  className = "",
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label
        htmlFor={htmlFor}
        className="text-xs font-[family-name:var(--font-mono)] uppercase tracking-wider text-subtle"
      >
        {label}
        {required && <span className="text-[var(--color-status-rejected-fg)] ml-1">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-[var(--color-status-rejected-fg)]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
