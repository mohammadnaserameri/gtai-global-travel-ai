"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";

import type { Dictionary } from "@/i18n/get-dictionary";
import type { FlightSearchIntent } from "@/features/flights/search-intent-types";
import type { FlightOffer } from "@/features/flights/flight-offer-types";
import { applyFilters } from "@/features/flights/filters/flight-filter-application";
import {
  activeFilterGroupCount,
  availableCarriers,
  availableDepartureAirportCodes,
  availableArrivalAirportCodes,
  computeFacetCounts,
  durationBounds as computeDurationBounds,
  priceBounds as computePriceBounds,
} from "@/features/flights/filters/flight-filter-facets";
import {
  EMPTY_FILTER_STATE,
  type FlightFilterState,
  type ResultsViewState,
} from "@/features/flights/filters/flight-filter-types";
import {
  formatLocaleNumber,
  formatTemplate,
} from "@/features/flights/flight-offer-formatting";
import { DEMO_LOCATIONS } from "@/features/locations/demo-location-data";
import { localizedName } from "@/features/locations/location-presentation";
import { useMediaQuery } from "@/lib/utilities/use-media-query";
import { FlightFilterSidebar } from "./FlightFilterSidebar";
import { FlightFilterSheet } from "./FlightFilterSheet";
import { AppliedFilterChips } from "./AppliedFilterChips";

const AIRPORTS_BY_CODE = new Map(
  DEMO_LOCATIONS.filter(
    (location): location is typeof location & { iataCode: string } =>
      location.entityType === "AIRPORT" && location.iataCode !== null,
  ).map((location) => [location.iataCode, location] as const),
);

interface FlightFiltersProps {
  /** The complete, unfiltered demonstration offer set for this Search Intent. */
  offers: readonly FlightOffer[];
  viewState: ResultsViewState;
  onCommit: (next: ResultsViewState) => void;
  intent: FlightSearchIntent;
  labels: Dictionary["flightResults"];
  /** Rendered in the same row as the mobile Filters trigger — kept as a separate, unchanged component. */
  sortControl: ReactNode;
  /** The result cards, or the filtered-empty block — rendered below the chips. */
  children: ReactNode;
}

/**
 * The whole V2.4 filtering system: a Desktop Sidebar, a Mobile/Tablet Sheet
 * behind a Filters trigger, and the Applied-filter chips row, all sharing one
 * set of bounds/options derived once from `offers`. Facet counts are not
 * shared, by design: the Desktop Sidebar's counts are derived from the
 * committed `viewState.filters`, while the Mobile Sheet's counts are derived
 * from its own local draft — so the Sidebar never changes until Apply, and
 * the Sheet always reflects whatever the user is currently editing.
 * `FlightResultsExperience` only has to fetch the offers, apply the
 * (already-sanitized) filters and sort, and render this component around the
 * result — every filter-specific behaviour lives here and in the sibling
 * files in this directory.
 */
export function FlightFilters({
  offers,
  viewState,
  onCommit,
  intent,
  labels,
  sortControl,
  children,
}: FlightFiltersProps) {
  const locale = intent.locale;
  const currency = intent.currency;
  const filterLabels = labels.filters;

  const priceBounds = useMemo(() => computePriceBounds(offers), [offers]);
  const durationBounds = useMemo(() => computeDurationBounds(offers), [offers]);
  const carrierOptions = useMemo(() => availableCarriers(offers), [offers]);
  const fromAirportOptions = useMemo(
    () => availableDepartureAirportCodes(offers),
    [offers],
  );
  const toAirportOptions = useMemo(
    () => availableArrivalAirportCodes(offers),
    [offers],
  );
  const facetCounts = useMemo(
    () => computeFacetCounts(offers, viewState.filters),
    [offers, viewState.filters],
  );
  const activeGroupCount = activeFilterGroupCount(viewState.filters);
  const durationUnitLabels = {
    hour: labels.duration.hourUnit,
    minute: labels.duration.minuteUnit,
  };

  const airportName = useMemo(
    () => (code: string) => {
      const location = AIRPORTS_BY_CODE.get(code);
      return location ? localizedName(location, locale) : code;
    },
    [locale],
  );

  function commitFilters(nextFilters: FlightFilterState) {
    onCommit({ sort: viewState.sort, filters: nextFilters });
  }

  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<FlightFilterState>(viewState.filters);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // The Sheet's own markup is `lg:hidden`, but that only hides it visually —
  // React state (and with it, the Sheet's body-scroll lock and focus trap)
  // stays exactly as it was unless something closes it. Mirror the same
  // `lg` breakpoint here so crossing into Desktop closes the Sheet for real:
  // the render-time comparison below is the same "adjust state" pattern
  // already used elsewhere in this component tree (e.g. the Sort-reset and
  // `offerState` sync in `FlightResultsExperience`), not a new effect.
  const isDesktopViewport = useMediaQuery("(min-width: 1024px)");
  const [syncedIsDesktopViewport, setSyncedIsDesktopViewport] =
    useState(isDesktopViewport);
  if (isDesktopViewport !== syncedIsDesktopViewport) {
    setSyncedIsDesktopViewport(isDesktopViewport);
    if (isDesktopViewport && sheetOpen) {
      setSheetOpen(false);
      setDraft(viewState.filters);
    }
  }

  // Same computation as `facetCounts` above, but against the Sheet's local
  // draft rather than the committed URL filters — the Desktop Sidebar's
  // `facetCounts` is derived from `viewState.filters` and stays untouched by
  // anything the Sheet does until Apply commits it.
  const draftFacetCounts = useMemo(
    () => computeFacetCounts(offers, draft),
    [offers, draft],
  );

  function openSheet() {
    setDraft(viewState.filters);
    setSheetOpen(true);
  }
  function cancelSheet() {
    setSheetOpen(false);
  }
  function applySheet() {
    commitFilters(draft);
    setSheetOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  const draftMatchCount = useMemo(
    () => applyFilters(offers, draft).length,
    [offers, draft],
  );

  const triggerLabel =
    activeGroupCount > 0
      ? formatTemplate(filterLabels.triggerActive, {
          count: formatLocaleNumber(activeGroupCount, locale),
        })
      : filterLabels.trigger;

  return (
    <div className="lg:grid lg:grid-cols-[16rem_1fr] lg:items-start lg:gap-6">
      <FlightFilterSidebar
        className="hidden lg:block"
        filters={viewState.filters}
        onChangeCheckboxes={commitFilters}
        onCommitPrice={(value) =>
          commitFilters({
            ...viewState.filters,
            maxTotalPrice: value >= priceBounds.max ? null : value,
          })
        }
        onCommitDuration={(value) =>
          commitFilters({
            ...viewState.filters,
            maxDurationMinutes: value >= durationBounds.max ? null : value,
          })
        }
        onClearAll={() => commitFilters(EMPTY_FILTER_STATE)}
        activeGroupCount={activeGroupCount}
        priceBounds={priceBounds}
        durationBounds={durationBounds}
        carrierOptions={carrierOptions}
        fromAirportOptions={fromAirportOptions}
        toAirportOptions={toAirportOptions}
        facetCounts={facetCounts}
        currency={currency}
        locale={locale}
        labels={filterLabels}
        durationUnitLabels={durationUnitLabels}
        airportName={airportName}
      />

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {sortControl}

          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            onClick={openSheet}
            className="border-border-strong bg-surface text-foreground-secondary hover:border-brand-300 hover:text-brand-ink focus-visible:outline-focus-ring inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-4 text-sm font-semibold shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 lg:hidden"
          >
            {triggerLabel}
          </button>
        </div>

        <FlightFilterSheet
          open={sheetOpen}
          draft={draft}
          onDraftChange={setDraft}
          onCancel={cancelSheet}
          onApply={applySheet}
          onClearAllDraft={() => setDraft(EMPTY_FILTER_STATE)}
          matchCount={draftMatchCount}
          priceBounds={priceBounds}
          durationBounds={durationBounds}
          carrierOptions={carrierOptions}
          fromAirportOptions={fromAirportOptions}
          toAirportOptions={toAirportOptions}
          facetCounts={draftFacetCounts}
          currency={currency}
          locale={locale}
          labels={filterLabels}
          durationUnitLabels={durationUnitLabels}
          airportName={airportName}
        />

        <AppliedFilterChips
          filters={viewState.filters}
          onChange={commitFilters}
          onClearAll={() => commitFilters(EMPTY_FILTER_STATE)}
          carrierOptions={carrierOptions}
          currency={currency}
          locale={locale}
          labels={filterLabels}
          durationUnitLabels={durationUnitLabels}
        />

        {children}
      </div>
    </div>
  );
}
