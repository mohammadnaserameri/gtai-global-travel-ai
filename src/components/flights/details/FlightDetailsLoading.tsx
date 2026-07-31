import type { Dictionary } from "@/i18n/get-dictionary";
import { Skeleton } from "@/components/ui/Skeleton";

interface FlightDetailsLoadingProps {
  labels: Dictionary["flightDetails"];
}

/**
 * The Details loading state.
 *
 * Carries the page's single `h1` (so every state — loading, ready, invalid,
 * not-found, excluded, error — exposes exactly one), announces itself
 * politely once, and hides the skeleton geometry from assistive tech. The
 * status wording is deliberately about *preparing local demonstration
 * data*: nothing here says "contacting provider", "confirming fare",
 * "checking availability" or "reserving", because none of that happens.
 */
export function FlightDetailsLoading({ labels }: FlightDetailsLoadingProps) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-foreground text-xl font-bold">{labels.heading}</h1>

      <p role="status" aria-live="polite" className="text-foreground-muted text-sm">
        {labels.loading}
      </p>

      <div aria-hidden="true" className="flex flex-col gap-6">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-56 w-full rounded-2xl" />
            <Skeleton className="h-56 w-full rounded-2xl" />
          </div>
          <div className="flex flex-col gap-4">
            <Skeleton className="h-44 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
