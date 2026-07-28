import type { ReactNode } from "react";

import { cn } from "@/lib/utilities/cn";

export type BadgeTone =
  "brand" | "neutral" | "future" | "success" | "warning" | "info";
export type BadgeSize = "sm" | "md";

/* Every tone pairs a colour with a distinct label in the calling code, so
   meaning is never carried by colour alone. */
const tones: Record<BadgeTone, string> = {
  brand: "bg-brand-100/70 text-brand-ink-strong border-brand-250",
  neutral: "bg-background-muted text-foreground-secondary border-border",
  future: "bg-accent-100 text-accent-800 border-accent-200",
  success: "bg-success-subtle text-success border-success/25",
  warning: "bg-warning-subtle text-warning border-warning/25",
  info: "bg-info-subtle text-info border-info/25",
};

const sizes: Record<BadgeSize, string> = {
  sm: "text-[0.6875rem] px-2 py-0.5",
  md: "text-xs px-2.5 py-1",
};

interface BadgeProps {
  tone?: BadgeTone;
  size?: BadgeSize;
  /** Optional leading dot. Purely decorative. */
  dot?: boolean;
  className?: string;
  children: ReactNode;
}

export function Badge({
  tone = "neutral",
  size = "md",
  dot = false,
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "rounded-pill inline-flex items-center gap-1.5 border font-semibold tracking-wide uppercase",
        tones[tone],
        sizes[size],
        className,
      )}
    >
      {dot ? (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      ) : null}
      {children}
    </span>
  );
}
