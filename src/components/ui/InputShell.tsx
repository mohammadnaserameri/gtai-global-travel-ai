import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utilities/cn";

interface InputShellProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className" | "id" | "children"
> {
  /** Required, always rendered visibly — never a placeholder-only label. */
  label: string;
  id: string;
  /** Decorative leading glyph. */
  icon?: ReactNode;
  /** Small helper line rendered under the field and wired via aria-describedby. */
  hint?: string;
  className?: string;
}

/**
 * A labelled text field used throughout the search shell.
 *
 * V1 wires no data source to these fields: there is no airport dataset, no
 * autocomplete and no suggestion service. The control is a genuine, accessible
 * input so focus, labelling and mobile behaviour can be verified for real.
 */
export function InputShell({
  label,
  id,
  icon,
  hint,
  className,
  ...rest
}: InputShellProps) {
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
        <input
          id={id}
          aria-describedby={hintId}
          autoComplete="off"
          className={cn(
            "text-foreground min-w-0 flex-1 bg-transparent py-2.5 text-sm",
            "placeholder:text-foreground-muted/80 focus:outline-none",
          )}
          {...rest}
        />
      </div>
      {hint ? (
        <p id={hintId} className="text-foreground-muted text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
