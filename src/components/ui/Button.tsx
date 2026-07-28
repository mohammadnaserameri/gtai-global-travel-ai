import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utilities/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "subtle" | "link";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-pill font-semibold " +
  "whitespace-nowrap gtai-lift " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring " +
  "disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-linear-to-r from-brand-700 to-brand-600 text-brand-on-action shadow-brand " +
    "hover:from-brand-800 hover:to-brand-700 hover:not-disabled:-translate-y-px active:translate-y-0",
  secondary:
    "bg-surface text-brand-ink-strong border border-border-strong shadow-xs " +
    "hover:bg-brand-50 hover:border-brand-300",
  subtle:
    "bg-brand-50 text-brand-ink-strong border border-brand-150 " +
    "hover:bg-brand-150 hover:border-brand-250",
  ghost:
    "text-foreground-secondary hover:bg-background-muted hover:text-foreground",
  link:
    "text-brand-ink underline underline-offset-4 decoration-brand-300 " +
    "hover:decoration-brand-600 hover:text-brand-ink-strong rounded-sm",
};

/* Sizes keep a 44px minimum target on everything except the compact `sm`
   variant, which is only used inside already-large hit areas. */
const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3.5 text-sm",
  md: "min-h-11 px-5 text-sm sm:text-base",
  lg: "min-h-12 px-7 text-base",
};

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
}

type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

export function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        base,
        variants[variant],
        sizes[variant === "link" ? "sm" : size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

interface ButtonLinkProps extends CommonProps {
  href: string;
  /** Set for links that leave the application. */
  external?: boolean;
  "aria-label"?: string;
}

/** The same visual language as {@link Button}, rendered as a real link. */
export function ButtonLink({
  href,
  external,
  variant = "primary",
  size = "md",
  fullWidth,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  const classes = cn(
    base,
    variants[variant],
    sizes[variant === "link" ? "sm" : size],
    fullWidth && "w-full",
    className,
  );

  if (external) {
    return (
      <a
        href={href}
        rel="noopener noreferrer nofollow"
        target="_blank"
        className={classes}
        {...rest}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
}
