import type { ReactNode, SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utilities/cn";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectGroup {
  label: string;
  options: readonly SelectOption[];
}

interface SelectShellProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "className" | "id" | "children"
> {
  label: string;
  id: string;
  /** Flat option list. Use `groups` instead when the list needs headings. */
  options?: readonly SelectOption[];
  /** Grouped options, rendered as native `<optgroup>` elements. */
  groups?: readonly SelectGroup[];
  icon?: ReactNode;
  hint?: string;
  className?: string;
}

/**
 * A labelled native select.
 *
 * Native `<select>` is intentional: it is keyboard accessible everywhere, it
 * renders as the platform picker on mobile, and it costs no client JavaScript.
 */
export function SelectShell({
  label,
  id,
  options,
  groups,
  icon,
  hint,
  className,
  ...rest
}: SelectShellProps) {
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label
        htmlFor={id}
        className="text-foreground-muted text-xs font-semibold tracking-wide uppercase"
      >
        {label}
      </label>
      <div
        className={cn(
          "border-border bg-surface flex min-h-12 items-center gap-2.5 rounded-lg border px-3.5",
          "gtai-lift focus-within:border-brand-400 hover:border-border-strong focus-within:shadow-sm",
        )}
      >
        {icon ? (
          <span aria-hidden="true" className="text-brand-600 shrink-0">
            {icon}
          </span>
        ) : null}
        <select
          id={id}
          aria-describedby={hintId}
          className={cn(
            "text-foreground min-w-0 flex-1 appearance-none bg-transparent py-2.5 text-sm",
            "focus:outline-none",
          )}
          {...rest}
        >
          {options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          {groups?.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span aria-hidden="true" className="text-foreground-muted shrink-0">
          <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
            <path
              d="M1 1.5 6 6.5l5-5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
      {hint ? (
        <p id={hintId} className="text-foreground-muted text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
