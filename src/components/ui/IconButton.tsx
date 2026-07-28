import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utilities/cn";

export type IconButtonVariant = "ghost" | "outline" | "solid";

const variants: Record<IconButtonVariant, string> = {
  ghost:
    "text-foreground-secondary hover:bg-background-muted hover:text-foreground",
  outline:
    "border border-border-strong bg-surface text-foreground-secondary shadow-xs hover:border-brand-300 hover:text-brand-ink",
  solid: "bg-brand-700 text-brand-on-action shadow-brand hover:bg-brand-800",
};

interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "children"
> {
  /** Required — icon-only controls carry no visible text. */
  label: string;
  variant?: IconButtonVariant;
  className?: string;
  children: ReactNode;
}

/**
 * Square icon-only control. Always 44×44 so it satisfies the minimum touch
 * target on every supported breakpoint.
 */
export function IconButton({
  label,
  variant = "ghost",
  className,
  children,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        "gtai-lift inline-flex size-11 shrink-0 items-center justify-center rounded-lg",
        "focus-visible:outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-55",
        variants[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
