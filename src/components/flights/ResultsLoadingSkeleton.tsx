import type { Dictionary } from "@/i18n/get-dictionary";
import { Skeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Card";

interface ResultsLoadingSkeletonProps {
  labels: Dictionary["flightResults"];
}

/**
 * The Results page's real loading state — not a spinner standing in for one.
 * The heading and status line are real, visible, localized text (not
 * sr-only), so a sighted user sees the same thing a screen reader announces.
 * The card silhouettes underneath are purely decorative and `aria-hidden`.
 */
export function ResultsLoadingSkeleton({ labels }: ResultsLoadingSkeletonProps) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-foreground text-xl font-bold">{labels.heading}</h1>
      <p role="status" aria-live="polite" className="text-foreground-muted text-sm">
        {labels.loading.status}
      </p>

      <div aria-hidden="true" className="flex flex-col gap-6">
        <Card variant="outline" padding="md" className="flex flex-col gap-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-64" />
          <Skeleton className="h-3 w-40" />
        </Card>

        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-56 rounded-full" />
        </div>

        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Card
              key={index}
              variant="plain"
              padding="md"
              className="flex flex-col gap-4"
            >
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-6 w-24" />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-8 w-20" />
              </div>
              <Skeleton className="h-9 w-32 rounded-full" />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
