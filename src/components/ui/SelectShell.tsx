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

export type SelectLayout = "stacked" | "inline";

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
  /**
   * `stacked` puts the label above a full-width control — the default, used
   * for form fields. `inline` renders a compact pill with the label beside the
   * value, for secondary controls that sit in a toolbar row. The label stays
   * visible in both.
   */
  layout?: SelectLayout;
  icon?: ReactNode;
  /** Helper line. Supported by the `stacked` layout only. */
  hint?: string;
  className?: string;
}

function Chevron() {
  return (
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
  );
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
  layout = "stacked",
  icon,
  hint,
  className,
  ...rest
}: SelectShellProps) {
  const showHint = layout === "stacked" && Boolean(hint);
  const hintId = showHint ? `${id}-hint` : undefined;

  const optionNodes = (
    <>
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
    </>
  );

  if (layout === "inline") {
    return (
      <div
        className={cn(
          "rounded-pill border-border bg-surface inline-flex min-h-11 items-center gap-2 border px-3.5",
          "gtai-lift hover:border-border-strong focus-within:border-brand-400 focus-within:shadow-sm",
          className,
        )}
      >
        {icon ? (
          <span aria-hidden="true" className="text-brand-600 shrink-0">
            {icon}
          </span>
        ) : null}
        <label
          htmlFor={id}
          className="text-foreground-muted shrink-0 text-xs font-medium whitespace-nowrap"
        >
          {label}
        </label>
        {/* `self-stretch` so the control itself fills the 44px pill — a select
            that only covers its text is a sub-target-size tap area. */}
        <select
          id={id}
          className="text-foreground min-w-0 cursor-pointer appearance-none self-stretch bg-transparent text-sm font-semibold focus:outline-none"
          {...rest}
        >
          {optionNodes}
        </select>
        <Chevron />
      </div>
    );
  }

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
          "gtai-lift hover:border-border-strong focus-within:border-brand-400 focus-within:shadow-sm",
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
            "text-foreground min-w-0 flex-1 cursor-pointer appearance-none self-stretch bg-transparent text-sm",
            "focus:outline-none",
          )}
          {...rest}
        >
          {optionNodes}
        </select>
        <Chevron />
      </div>
      {showHint ? (
        <p id={hintId} className="text-foreground-muted text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
