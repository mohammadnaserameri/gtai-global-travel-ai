"use client";

import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utilities/cn";

interface TooltipShellProps {
  /** The element the tip describes. */
  children: ReactNode;
  /** Tip text. Always also reachable by keyboard focus, never hover-only. */
  content: string;
  /**
   * Which edge the tip is anchored to. Use `end` for triggers that sit near
   * the inline-end edge of the viewport, so the tip does not overhang it.
   */
  align?: "start" | "end";
  className?: string;
}

/**
 * CSS-only tooltip.
 *
 * The tip is exposed through `aria-describedby` so it is announced whether it
 * was revealed by hover or by keyboard focus. No JavaScript, no positioning
 * library — the trigger is always wide enough for the tip to sit under it.
 */
export function TooltipShell({
  children,
  content,
  align = "start",
  className,
}: TooltipShellProps) {
  const id = useId();

  return (
    <span className={cn("group relative inline-flex", className)}>
      <span aria-describedby={id} className="inline-flex">
        {children}
      </span>
      <span
        id={id}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute top-[calc(100%+0.4rem)] z-50 w-max max-w-[16rem]",
          align === "end" ? "end-0" : "start-0",
          "bg-brand-950 rounded-md px-2.5 py-1.5 text-xs leading-snug text-white opacity-0 shadow-lg",
          "transition-opacity duration-150",
          "group-focus-within:opacity-100 group-hover:opacity-100",
        )}
      >
        {content}
      </span>
    </span>
  );
}
