"use client";

import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";

import type { Direction } from "@/config/locales";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { TravelLocation } from "@/features/locations/location-types";
import { AirportSelector } from "@/components/search/airport-selector/AirportSelector";
import { SwapControl } from "@/components/search/SwapControl";
import { cn } from "@/lib/utilities/cn";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { InputShell } from "@/components/ui/InputShell";
import { SelectShell } from "@/components/ui/SelectShell";
import { Tabs, TabPanel, type TabItem } from "@/components/ui/Tabs";
import {
  TripTypeSelector,
  type TripType,
} from "@/components/search/TripTypeSelector";
import {
  CalendarIcon,
  CarIcon,
  FlightIcon,
  PackageIcon,
  PinIcon,
  SearchIcon,
  SeatIcon,
  StayIcon,
  TravelersIcon,
} from "@/components/ui/icons";

type ProductId = "flights" | "stays" | "cars" | "packages";

interface SearchShellProps {
  tabs: Dictionary["searchTabs"];
  labels: Dictionary["search"];
  dir?: Direction;
  /** Active locale — the selector uses it for localized location names. */
  locale?: string;
  /** Which product tab opens first. Product pages preselect their own. */
  defaultProduct?: ProductId;
  className?: string;
}

/** One side of the origin/destination pair. */
interface LocationFieldState {
  readonly selected: TravelLocation | null;
  readonly query: string;
  readonly error: string | null;
}

const EMPTY_FIELD: LocationFieldState = {
  selected: null,
  query: "",
  error: null,
};

/**
 * Groups the locate/date fields and the submit control into one visually
 * connected block, so the row reads as a single search bar rather than five
 * separate widgets.
 *
 * Column spans are assigned per product and always total 12 on `lg`, which is
 * what keeps a control such as Cabin class from stranding on a near-empty
 * second row.
 */
function FieldGroup({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background-muted grid gap-2 rounded-xl p-2 sm:grid-cols-2 lg:grid-cols-12">
      {children}
    </div>
  );
}

/** Submit cell, bottom-aligned so the CTA lines up with the field boxes. */
function SubmitCell({ label }: { label: string }) {
  return (
    <div className="flex items-end sm:col-span-2 lg:col-span-2">
      <Button type="submit" size="lg" fullWidth className="min-h-12">
        <SearchIcon size={18} />
        {label}
      </Button>
    </div>
  );
}

/**
 * The standard travel search surface, and the visual focal point of the
 * homepage.
 *
 * This is a **presentational shell**. There is no airport dataset, no
 * autocomplete, no calendar picker, no provider query and no results route —
 * submitting only announces that results are not available yet. The controls
 * are nevertheless real, labelled form elements so focus order, mobile
 * keyboards and screen-reader output can be verified now rather than
 * retrofitted later.
 */
export function SearchShell({
  tabs,
  labels,
  dir = "ltr",
  locale = "en",
  defaultProduct = "flights",
  className,
}: SearchShellProps) {
  const idPrefix = useId().replace(/:/g, "");
  const [product, setProduct] = useState<ProductId>(defaultProduct);
  const [tripType, setTripType] = useState<TripType>("roundTrip");
  const [announced, setAnnounced] = useState(false);

  const [origin, setOrigin] = useState<LocationFieldState>(EMPTY_FIELD);
  const [destination, setDestination] = useState<LocationFieldState>(EMPTY_FIELD);

  const departureRef = useRef<HTMLInputElement>(null);
  const destinationWrapperRef = useRef<HTMLDivElement>(null);

  const locationLabels = labels.locations;
  const destinationIsFlexible =
    destination.selected?.isFlexibleDestination === true;

  /**
   * Validates one side. A typed query with no explicit selection is invalid —
   * that is the rule the whole selector is built around.
   */
  function validateField(
    state: LocationFieldState,
    requiredMessage: string,
  ): string | null {
    if (state.selected) return null;
    return state.query.trim().length > 0
      ? locationLabels.unresolved
      : requiredMessage;
  }

  function swapLocations() {
    if (destinationIsFlexible) return;
    setOrigin({ ...destination, error: null });
    setDestination({ ...origin, error: null });
    setAnnounced(false);
  }

  const items: TabItem[] = [
    { id: "flights", label: tabs.flights, icon: <FlightIcon size={18} /> },
    { id: "stays", label: tabs.stays, icon: <StayIcon size={18} /> },
    { id: "cars", label: tabs.cars, icon: <CarIcon size={18} /> },
    { id: "packages", label: tabs.packages, icon: <PackageIcon size={18} /> },
  ];

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (product !== "flights") {
      setAnnounced(true);
      return;
    }

    let originError = validateField(origin, locationLabels.originRequired);
    let destinationError = validateField(
      destination,
      locationLabels.destinationRequired,
    );

    // Both sides resolved to the same entity — a search that cannot fly.
    if (
      !originError &&
      !destinationError &&
      origin.selected &&
      destination.selected &&
      origin.selected.id === destination.selected.id
    ) {
      originError = locationLabels.sameLocation;
      destinationError = locationLabels.sameLocation;
    }

    setOrigin((state) => ({ ...state, error: originError }));
    setDestination((state) => ({ ...state, error: destinationError }));

    if (originError || destinationError) {
      setAnnounced(false);
      // Move focus to the first field that needs attention.
      const target = originError
        ? document.getElementById(`${field("from")}-input`)
        : document.getElementById(`${field("to")}-input`);
      target?.focus();
      return;
    }

    // Locations are resolved, but GTAI still connects no provider. The shell
    // reports that truthfully instead of fabricating a result set.
    setAnnounced(true);
  }

  const cabinOptions = [
    { value: "economy", label: labels.options.cabin.economy },
    { value: "premium", label: labels.options.cabin.premiumEconomy },
    { value: "business", label: labels.options.cabin.business },
    { value: "first", label: labels.options.cabin.first },
  ];

  const field = (id: string) => `${idPrefix}-${id}`;

  return (
    <div
      className={cn(
        "border-border bg-surface-elevated rounded-2xl border p-3 shadow-xl sm:p-5",
        className,
      )}
    >
      <h2 className="sr-only">{labels.heading}</h2>

      <Tabs
        label={tabs.label}
        items={items}
        value={product}
        onValueChange={(id) => {
          setProduct(id as ProductId);
          setAnnounced(false);
        }}
        idPrefix={idPrefix}
        dir={dir}
        className="mb-4"
      />

      <form onSubmit={onSubmit} noValidate>
        <TabPanel idPrefix={idPrefix} id="flights" active={product === "flights"}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <TripTypeSelector
              label={labels.tripType.label}
              value={tripType}
              onChange={setTripType}
              name={field("trip-type")}
              options={{
                roundTrip: labels.tripType.roundTrip,
                oneWay: labels.tripType.oneWay,
                multiCity: labels.tripType.multiCity,
              }}
            />
            <SelectShell
              layout="inline"
              id={field("travelers")}
              label={labels.fields.travelers}
              icon={<TravelersIcon size={16} />}
              options={[{ value: "1", label: labels.options.travelersValue }]}
            />
            <SelectShell
              layout="inline"
              id={field("cabin")}
              label={labels.fields.cabinClass}
              icon={<SeatIcon size={16} />}
              options={cabinOptions}
            />
          </div>

          <FieldGroup>
            {/* From · Swap · To share one flex row so the swap control sits
                between the pair at every width and mirrors under RTL without
                a second rule. */}
            <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-start lg:col-span-6">
              <AirportSelector
                id={field("from")}
                context="origin"
                label={labels.fields.from}
                labels={locationLabels}
                locale={locale}
                value={origin.selected}
                query={origin.query}
                invalid={Boolean(origin.error)}
                errorMessage={origin.error ?? undefined}
                onQueryChange={(query) =>
                  setOrigin({ selected: null, query, error: null })
                }
                onSelect={(selected) =>
                  setOrigin({ selected, query: "", error: null })
                }
                onClear={() => setOrigin(EMPTY_FIELD)}
                onSelectionComplete={() => {
                  destinationWrapperRef.current
                    ?.querySelector<HTMLElement>("input,button")
                    ?.focus();
                }}
                className="min-w-0 flex-1"
              />

              <SwapControl
                label={locationLabels.swap}
                disabled={destinationIsFlexible}
                disabledReason={locationLabels.everywhereOriginBlocked}
                onSwap={swapLocations}
                className="self-center sm:mt-6 sm:self-start"
              />

              <div ref={destinationWrapperRef} className="min-w-0 flex-1">
                <AirportSelector
                  id={field("to")}
                  context="destination"
                  label={labels.fields.to}
                  labels={locationLabels}
                  locale={locale}
                  value={destination.selected}
                  query={destination.query}
                  invalid={Boolean(destination.error)}
                  errorMessage={destination.error ?? undefined}
                  onQueryChange={(query) =>
                    setDestination({ selected: null, query, error: null })
                  }
                  onSelect={(selected) =>
                    setDestination({ selected, query: "", error: null })
                  }
                  onClear={() => setDestination(EMPTY_FIELD)}
                  onSelectionComplete={() => departureRef.current?.focus()}
                />
              </div>
            </div>

            <InputShell
              ref={departureRef}
              id={field("departure")}
              label={labels.fields.departure}
              type="date"
              icon={<CalendarIcon size={18} />}
              className="lg:col-span-2"
            />
            <InputShell
              id={field("return")}
              label={labels.fields.return}
              type="date"
              icon={<CalendarIcon size={18} />}
              disabled={tripType !== "roundTrip"}
              className={cn(
                "lg:col-span-2",
                tripType !== "roundTrip" && "opacity-55",
              )}
            />
            <SubmitCell label={labels.submit} />
          </FieldGroup>
        </TabPanel>

        <TabPanel idPrefix={idPrefix} id="stays" active={product === "stays"}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SelectShell
              layout="inline"
              id={field("guests")}
              label={labels.fields.guests}
              icon={<TravelersIcon size={16} />}
              options={[{ value: "2", label: labels.options.guestsValue }]}
            />
          </div>

          <FieldGroup>
            <InputShell
              id={field("stay-destination")}
              label={labels.fields.destination}
              placeholder={labels.placeholders.destination}
              icon={<PinIcon size={18} />}
              className="sm:col-span-2 lg:col-span-4"
            />
            <InputShell
              id={field("check-in")}
              label={labels.fields.checkIn}
              type="date"
              icon={<CalendarIcon size={18} />}
              className="lg:col-span-3"
            />
            <InputShell
              id={field("check-out")}
              label={labels.fields.checkOut}
              type="date"
              icon={<CalendarIcon size={18} />}
              className="lg:col-span-3"
            />
            <SubmitCell label={labels.submit} />
          </FieldGroup>
        </TabPanel>

        <TabPanel idPrefix={idPrefix} id="cars" active={product === "cars"}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SelectShell
              layout="inline"
              id={field("driver-age")}
              label={labels.fields.driverAge}
              icon={<CarIcon size={16} />}
              options={[{ value: "30-65", label: labels.options.driverAgeValue }]}
            />
          </div>

          <FieldGroup>
            <InputShell
              id={field("pick-up")}
              label={labels.fields.pickUp}
              placeholder={labels.placeholders.pickUp}
              icon={<PinIcon size={18} />}
              className="lg:col-span-3"
            />
            <InputShell
              id={field("drop-off")}
              label={labels.fields.dropOff}
              placeholder={labels.placeholders.pickUp}
              icon={<PinIcon size={18} />}
              className="lg:col-span-3"
            />
            <InputShell
              id={field("pick-up-date")}
              label={labels.fields.pickUpDate}
              type="date"
              icon={<CalendarIcon size={18} />}
              className="lg:col-span-2"
            />
            <InputShell
              id={field("drop-off-date")}
              label={labels.fields.dropOffDate}
              type="date"
              icon={<CalendarIcon size={18} />}
              className="lg:col-span-2"
            />
            <SubmitCell label={labels.submit} />
          </FieldGroup>
        </TabPanel>

        <TabPanel idPrefix={idPrefix} id="packages" active={product === "packages"}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SelectShell
              layout="inline"
              id={field("package-travelers")}
              label={labels.fields.packageTravelers}
              icon={<TravelersIcon size={16} />}
              options={[{ value: "1", label: labels.options.travelersValue }]}
            />
          </div>

          <FieldGroup>
            <InputShell
              id={field("package-origin")}
              label={labels.fields.origin}
              placeholder={labels.placeholders.from}
              icon={<PinIcon size={18} />}
              className="lg:col-span-3"
            />
            <InputShell
              id={field("package-destination")}
              label={labels.fields.packageDestination}
              placeholder={labels.placeholders.destination}
              icon={<PinIcon size={18} />}
              className="lg:col-span-3"
            />
            <InputShell
              id={field("package-departure")}
              label={labels.fields.departure}
              type="date"
              icon={<CalendarIcon size={18} />}
              className="lg:col-span-2"
            />
            <InputShell
              id={field("package-return")}
              label={labels.fields.return}
              type="date"
              icon={<CalendarIcon size={18} />}
              className="lg:col-span-2"
            />
            <SubmitCell label={labels.submit} />
          </FieldGroup>
        </TabPanel>

        <p className="text-foreground-muted mt-3 text-xs leading-relaxed">
          {labels.helper}
        </p>

        <div aria-live="polite" className="mt-3 empty:mt-0">
          {announced ? (
            <Alert tone="brand" live>
              {labels.submitDisabledHint} {labels.notice}
            </Alert>
          ) : null}
        </div>
      </form>
    </div>
  );
}
