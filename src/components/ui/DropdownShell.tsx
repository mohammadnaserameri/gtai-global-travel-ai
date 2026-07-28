"use client";

import { useId, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utilities/cn";
import { useDismissable } from "@/lib/accessibility/use-dismissable";

interface DropdownShellProps {
  /** Trigger content. Keep it short — it sits in the header utility bar. */
  trigger: ReactNode;
  /** Accessible name for the trigger. */
  triggerLabel: string;
  /** Panel content. Receives a `close` callback. */
  children: (close: () => void) => ReactNode;
  /** Which edge the panel aligns to. Logical, so it mirrors under RTL. */
  align?: "start" | "end";
  triggerClassName?: string;
  panelClassName?: string;
}

/**
 * A small popover used by the language and region selectors.
 *
 * Positioning uses logical inset properties so the panel flips automatically in
 * RTL. On narrow viewports the panel is width-capped and scrolls internally
 * rather than pushing the page sideways.
 */
export function DropdownShell({
  trigger,
  triggerLabel,
  children,
  align = "end",
  triggerClassName,
  panelClassName,
}: DropdownShellProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useDismissable(open, containerRef, () => setOpen(false));

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={triggerLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "rounded-pill border-border bg-surface text-foreground-secondary gtai-lift inline-flex min-h-11 items-center gap-2 border px-3 text-sm font-medium",
          "hover:border-brand-300 hover:text-brand-ink",
          "focus-visible:outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2",
          open && "border-brand-400 text-brand-ink shadow-sm",
          triggerClassName,
        )}
      >
        {trigger}
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={triggerLabel}
          className={cn(
            "absolute top-[calc(100%+0.5rem)] z-50 w-[min(20rem,calc(100vw-2rem))]",
            "border-border bg-surface-elevated rounded-xl border p-4 shadow-xl",
            align === "end" ? "end-0" : "start-0",
            panelClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}
