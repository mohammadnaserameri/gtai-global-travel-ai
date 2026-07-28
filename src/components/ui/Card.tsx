import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utilities/cn";

export type CardVariant = "plain" | "elevated" | "glass" | "outline" | "accent";
export type CardPadding = "none" | "sm" | "md" | "lg";

const variants: Record<CardVariant, string> = {
  plain: "bg-surface border border-border",
  elevated: "bg-surface-elevated border border-border shadow-md",
  glass: "gtai-surface-glass border border-white/60 shadow-lg",
  outline: "bg-transparent border border-border-strong",
  accent: "bg-linear-to-br from-brand-25 to-accent-100 border border-brand-150",
};

const paddings: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
};

interface CardProps {
  as?: ElementType;
  variant?: CardVariant;
  padding?: CardPadding;
  /** Adds a restrained hover elevation. Use only for interactive cards. */
  interactive?: boolean;
  className?: string;
  children: ReactNode;
}

export function Card({
  as: Component = "div",
  variant = "plain",
  padding = "md",
  interactive = false,
  className,
  children,
}: CardProps) {
  return (
    <Component
      className={cn(
        "rounded-xl",
        variants[variant],
        paddings[padding],
        interactive &&
          "gtai-lift hover:border-brand-300 hover:-translate-y-0.5 hover:shadow-lg",
        className,
      )}
    >
      {children}
    </Component>
  );
}
