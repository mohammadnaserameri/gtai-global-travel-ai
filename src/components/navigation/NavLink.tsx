"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utilities/cn";

interface NavLinkProps {
  href: string;
  label: string;
  /** `header` sits in the desktop bar; `drawer` is the mobile list row. */
  variant?: "header" | "drawer";
  onNavigate?: () => void;
  className?: string;
}

/**
 * Navigation link that marks the current page.
 *
 * The active page is signalled with `aria-current` **and** a weight/colour
 * change, so the state is never carried by colour alone.
 */
export function NavLink({
  href,
  label,
  variant = "header",
  onNavigate,
  className,
}: NavLinkProps) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "gtai-lift relative inline-flex items-center rounded-lg font-medium",
        "focus-visible:outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2",
        variant === "header"
          ? "min-h-11 px-3 text-sm"
          : "min-h-12 w-full px-3 text-base",
        active
          ? "text-brand-ink-strong font-semibold"
          : "text-foreground-secondary hover:text-brand-ink",
        variant === "drawer" && active && "bg-brand-50",
        variant === "drawer" && !active && "hover:bg-background-muted",
        className,
      )}
    >
      {label}
      {variant === "header" && active ? (
        <span
          aria-hidden="true"
          className="bg-brand-700 absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full"
        />
      ) : null}
    </Link>
  );
}
