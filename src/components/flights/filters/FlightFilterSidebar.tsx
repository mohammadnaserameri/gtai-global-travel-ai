"use client";

import type { Dictionary } from "@/i18n/get-dictionary";
import type { CurrencyCode } from "@/config/currencies";
import type { FlightFilterState } from "@/features/flights/filters/flight-filter-types";
import type {
  CarrierOption,
  FacetCounts,
  RangeBounds,
} from "@/features/flights/filters/flight-filter-facets";
import type { DurationUnitLabels } from "@/features/flights/flight-offer-formatting";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utilities/cn";
import { FlightFilterGroups } from "./FlightFilterGroups";

interface FlightFilterSidebarProps {
  className?: string;
  filters: FlightFilterState;
  onChangeCheckboxes: (next: FlightFilterState) => void;
  onCommitPrice: (value: number) => void;
  onCommitDuration: (value: number) => void;
  onClearAll: () => void;
  activeGroupCount: number;
  priceBounds: RangeBounds;
  durationBounds: RangeBounds;
  carrierOptions: readonly CarrierOption[];
  fromAirportOptions: readonly string[];
  toAirportOptions: readonly string[];
  facetCounts: FacetCounts;
  currency: CurrencyCode;
  locale: string;
  labels: Dictionary["flightResults"]["filters"];
  durationUnitLabels: DurationUnitLabels;
  airportName: (code: string) => string;
}

/**
 * Visible at desktop widths (roughly 1024px and up) only — the `hidden
 * lg:block` toggle lives on the wrapper the caller supplies via `className`,
 * matching the same CSS-only responsive-swap pattern `DrawerShell` already
 * uses (never a `useMediaQuery` check for something plain CSS can express).
 * Every change here commits immediately: checkboxes update the URL on
 * click, range controls update it once the interaction settles.
 */
export function FlightFilterSidebar({
  className,
  filters,
  onChangeCheckboxes,
  onCommitPrice,
  onCommitDuration,
  onClearAll,
  activeGroupCount,
  labels,
  ...groupsProps
}: FlightFilterSidebarProps) {
  return (
    <aside
      aria-label={labels.heading}
      className={cn(
        "lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pe-1",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-foreground text-base font-bold">{labels.heading}</h2>
        {activeGroupCount > 0 ? (
          <Badge tone="brand" size="sm">
            {labels.applied}
          </Badge>
        ) : null}
      </div>

      {activeGroupCount > 0 ? (
        <Button
          variant="ghost"
          onClick={onClearAll}
          className="mb-3 w-full justify-start px-2"
        >
          {labels.clearAll}
        </Button>
      ) : null}

      <FlightFilterGroups
        filters={filters}
        onChangeCheckboxes={onChangeCheckboxes}
        onCommitPrice={onCommitPrice}
        onCommitDuration={onCommitDuration}
        labels={labels}
        {...groupsProps}
      />
    </aside>
  );
}
