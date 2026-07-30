"use client";

import type { Dictionary } from "@/i18n/get-dictionary";
import type { CurrencyCode } from "@/config/currencies";
import type { FlightFilterState } from "@/features/flights/filters/flight-filter-types";
import type {
  CarrierOption,
  FacetCounts,
  RangeBounds,
} from "@/features/flights/filters/flight-filter-facets";
import {
  formatLocaleNumber,
  formatTemplate,
  type DurationUnitLabels,
} from "@/features/flights/flight-offer-formatting";
import { Button } from "@/components/ui/Button";
import { DrawerShell } from "@/components/ui/DrawerShell";
import { FlightFilterGroups } from "./FlightFilterGroups";

interface FlightFilterSheetProps {
  open: boolean;
  draft: FlightFilterState;
  onDraftChange: (next: FlightFilterState) => void;
  onCancel: () => void;
  onApply: () => void;
  onClearAllDraft: () => void;
  /** How many offers the *draft* (not-yet-applied) selection currently matches. */
  matchCount: number;
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
 * Below the desktop breakpoint (see `DrawerShell`'s own `lg:hidden`). Owns a
 * *draft* copy of the filters — nothing here ever touches the URL directly.
 * Cancel discards the draft with no visible or URL side effect at all;
 * Apply is the only action that commits, and it does so exactly once.
 */
export function FlightFilterSheet({
  open,
  draft,
  onDraftChange,
  onCancel,
  onApply,
  onClearAllDraft,
  matchCount,
  priceBounds,
  durationBounds,
  carrierOptions,
  fromAirportOptions,
  toAirportOptions,
  facetCounts,
  currency,
  locale,
  labels,
  durationUnitLabels,
  airportName,
}: FlightFilterSheetProps) {
  const applyLabel =
    matchCount === 1
      ? labels.showOptions.one
      : formatTemplate(labels.showOptions.other, {
          count: formatLocaleNumber(matchCount, locale),
        });

  return (
    <DrawerShell
      open={open}
      onClose={onCancel}
      title={labels.showFilters}
      closeLabel={labels.closeFilters}
      footer={
        // Stacked, full-width rows below `sm` so a long Persian/Arabic label
        // never has to fit three controls on one 360px-wide row — each
        // control keeps its natural text size and its full 44px target
        // either way; from `sm` up there is plenty of width for one row.
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            onClick={onClearAllDraft}
            className="w-full sm:w-auto"
          >
            {labels.clearAll}
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              variant="secondary"
              onClick={onCancel}
              className="w-full sm:w-auto"
            >
              {labels.cancel}
            </Button>
            <Button
              variant="primary"
              onClick={onApply}
              className="w-full sm:w-auto"
            >
              {applyLabel}
            </Button>
          </div>
        </div>
      }
    >
      <FlightFilterGroups
        filters={draft}
        onChangeCheckboxes={onDraftChange}
        onCommitPrice={(value) =>
          onDraftChange({
            ...draft,
            maxTotalPrice: value >= priceBounds.max ? null : value,
          })
        }
        onCommitDuration={(value) =>
          onDraftChange({
            ...draft,
            maxDurationMinutes: value >= durationBounds.max ? null : value,
          })
        }
        priceBounds={priceBounds}
        durationBounds={durationBounds}
        carrierOptions={carrierOptions}
        fromAirportOptions={fromAirportOptions}
        toAirportOptions={toAirportOptions}
        facetCounts={facetCounts}
        currency={currency}
        locale={locale}
        labels={labels}
        durationUnitLabels={durationUnitLabels}
        airportName={airportName}
      />
    </DrawerShell>
  );
}
