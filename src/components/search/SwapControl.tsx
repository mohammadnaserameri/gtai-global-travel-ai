"use client";

import { useId } from "react";

import { cn } from "@/lib/utilities/cn";
import { SwapIcon } from "@/components/ui/icons";

interface SwapControlProps {
  label: string;
  /** Explains why the control is unavailable. Announced, not just hovered. */
  disabledReason?: string;
  disabled?: boolean;
  onSwap: () => void;
  className?: string;
}

/**
 * Exchanges the origin and destination entities.
 *
 * When the destination is Everywhere the control is disabled rather than
 * silently dropping the flexible destination — Everywhere is destination-only,
 * and quietly discarding a deliberate choice would be worse than refusing the
 * action. The reason is wired through `aria-describedby` so it reaches
 * keyboard and screen-reader users, not only a hover tooltip.
 */
export function SwapControl({
  label,
  disabledReason,
  disabled = false,
  onSwap,
  className,
}: SwapControlProps) {
  const reasonId = useId().replace(/:/g, "");
  const showReason = disabled && Boolean(disabledReason);

  return (
    <div className={cn("flex shrink-0 items-center justify-center", className)}>
      <button
        type="button"
        onClick={onSwap}
        disabled={disabled}
        aria-label={label}
        aria-describedby={showReason ? reasonId : undefined}
        title={showReason ? disabledReason : label}
        className={cn(
          "border-border bg-surface text-brand-700 inline-flex size-11 items-center justify-center rounded-full border",
          "gtai-lift focus-visible:outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2",
          disabled
            ? "text-foreground-muted cursor-not-allowed opacity-55"
            : "hover:border-brand-300 hover:bg-brand-50",
        )}
      >
        <SwapIcon size={18} className="rotate-90 sm:rotate-0" />
      </button>

      {showReason ? (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      ) : null}
    </div>
  );
}
