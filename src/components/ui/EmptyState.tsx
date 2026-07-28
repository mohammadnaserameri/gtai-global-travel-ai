import type { ReactNode } from "react";

import { cn } from "@/lib/utilities/cn";
import { Skeleton } from "@/components/ui/Skeleton";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  /** Optional call to action rendered under the copy. */
  action?: ReactNode;
  /**
   * Renders skeleton rows behind the message to show the shape of the results
   * that will eventually appear here.
   */
  showResultPreview?: boolean;
  className?: string;
}

/**
 * Used on every product page. GTAI has no provider data in V1, so these pages
 * state that plainly instead of pretending to load forever.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  showResultPreview = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "border-border bg-surface-subtle relative overflow-hidden rounded-2xl border px-5 py-10 text-center sm:px-10",
        className,
      )}
    >
      {showResultPreview ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-4 top-4 flex flex-col gap-3 opacity-40"
        >
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      <div className="relative mx-auto max-w-md">
        {icon ? (
          <span
            aria-hidden="true"
            className="border-brand-150 bg-surface text-brand-600 mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-xl border shadow-xs"
          >
            {icon}
          </span>
        ) : null}
        <p className="text-foreground text-base font-semibold">{title}</p>
        <p className="text-foreground-muted mt-2 text-sm leading-relaxed">
          {description}
        </p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}
