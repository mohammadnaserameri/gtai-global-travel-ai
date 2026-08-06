"use client";

import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import type { Direction } from "@/config/locales";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { TravelLocation } from "@/features/locations/location-types";
import type { DateSelection } from "@/features/dates/date-types";
import { EMPTY_DATE_SELECTION } from "@/features/dates/date-types";
import { isAfter, isValidIsoDate } from "@/features/dates/date-utils";
import {
  CABIN_CLASSES,
  DEFAULT_TRAVELERS,
  type CabinClass,
  type InitialFlightSearch,
  type TravelerCounts,
} from "@/features/flights/search-intent-types";
import { buildSearchIntent } from "@/features/flights/search-intent-validation";
import { locationsOverlapForFlightSearch } from "@/features/flights/location-overlap";
import { serializeSearchIntent } from "@/features/flights/search-intent-url";
import { localePath } from "@/i18n/routing";
import { useRegion } from "@/components/region/RegionProvider";
import { DatePicker } from "@/components/search/date-picker/DatePicker";
import { AirportSelector } from "@/components/search/airport-selector/AirportSelector";
import { SwapControl } from "@/components/search/SwapControl";
import { TravelersControl } from "@/components/search/TravelersControl";
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
  /** Seeds the flight fields once, from an Edit-search return trip. */
  initialFlightSearch?: InitialFlightSearch;
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
 * The Flights tab is fully functional: real airport/city resolution via
 * `AirportSelector`, a real `DatePicker`, and real Travelers/Cabin class
 * selection, all validated into a Search Intent and submitted to
 * `/flights/results`. Stays, Cars and Packages remain presentational —
 * submitting one of those tabs only announces that results are not
 * available yet.
 */
export function SearchShell({
  tabs,
  labels,
  dir = "ltr",
  locale = "en",
  defaultProduct = "flights",
  initialFlightSearch,
  className,
}: SearchShellProps) {
  const idPrefix = useId().replace(/:/g, "");
  const router = useRouter();
  const { currency } = useRegion();

  const [product, setProduct] = useState<ProductId>(defaultProduct);
  const [tripType, setTripType] = useState<TripType>(
    initialFlightSearch?.tripType ?? "roundTrip",
  );
  /**
   * Replaces the single `announced` flag: the flights tab now has three
   * distinct outcomes on submit (nothing, the honest "not connected yet"
   * notice for the other product tabs, or the Everywhere carve-out) instead
   * of one generic message.
   */
  const [formNotice, setFormNotice] = useState<
    "none" | "unavailable" | "everywhere"
  >("none");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [origin, setOrigin] = useState<LocationFieldState>(
    initialFlightSearch?.origin
      ? { selected: initialFlightSearch.origin, query: "", error: null }
      : EMPTY_FIELD,
  );
  const [destination, setDestination] = useState<LocationFieldState>(
    initialFlightSearch?.destination
      ? { selected: initialFlightSearch.destination, query: "", error: null }
      : EMPTY_FIELD,
  );
  const [stayDestination, setStayDestination] =
    useState<LocationFieldState>(EMPTY_FIELD);
  const [carPickUp, setCarPickUp] = useState<LocationFieldState>(EMPTY_FIELD);
  const [carDropOff, setCarDropOff] = useState<LocationFieldState>(EMPTY_FIELD);
  const [packageOrigin, setPackageOrigin] =
    useState<LocationFieldState>(EMPTY_FIELD);
  const [packageDestination, setPackageDestination] =
    useState<LocationFieldState>(EMPTY_FIELD);

  const [dates, setDatesState] = useState<DateSelection>(
    initialFlightSearch
      ? {
          departure: initialFlightSearch.departureDate,
          returnDate: initialFlightSearch.returnDate,
          flexibilityDays: initialFlightSearch.flexibilityDays,
        }
      : EMPTY_DATE_SELECTION,
  );
  const [datesTouched, setDatesTouched] = useState(false);

  const [travelers, setTravelers] = useState<TravelerCounts>(
    initialFlightSearch?.travelers ?? DEFAULT_TRAVELERS,
  );
  const [cabinClass, setCabinClass] = useState<CabinClass>(
    initialFlightSearch?.cabinClass ?? "economy",
  );

  /**
   * A return that One way hid is remembered here so switching back can restore
   * it — but only through `setTripType`, which revalidates it first. It is
   * never part of the submitted state while One way is active.
   */
  const rememberedReturn = useRef<string | null>(null);

  const destinationWrapperRef = useRef<HTMLDivElement>(null);
  const departureRef = useRef<HTMLButtonElement>(null);

  const locationLabels = labels.locations;
  const dateLabelsSource = labels.dates;

  /** Dictionary slice mapped onto the picker's label contract. */
  const dateLabels = {
    ...dateLabelsSource,
    title: dateLabelsSource.title,
    departureLabel: labels.fields.departure,
    returnLabel: labels.fields.return,
  };
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
    setFormNotice("none");
  }

  function setDates(next: DateSelection) {
    setDatesState(next);
    setFormNotice("none");
  }

  const roundTrip = tripType === "roundTrip";

  /**
   * Switching trip type must never leave an invalid return behind.
   *
   * Round trip → One way drops the return from the submitted state and parks
   * it in a ref. One way → Round trip restores it only if it is still after
   * the departure; otherwise the field stays empty and must be chosen again.
   */
  function changeTripType(next: TripType) {
    if (next !== "roundTrip" && tripType === "roundTrip") {
      rememberedReturn.current = dates.returnDate;
      setDatesState({ ...dates, returnDate: null });
    } else if (next === "roundTrip" && tripType !== "roundTrip") {
      const remembered = rememberedReturn.current;
      const restorable =
        remembered !== null &&
        isValidIsoDate(remembered) &&
        dates.departure !== null &&
        isAfter(remembered, dates.departure);
      setDatesState({ ...dates, returnDate: restorable ? remembered : null });
    }
    setTripType(next);
    setFormNotice("none");
  }

  // Date validity is derived, never stored: an existing return that a later
  // departure invalidates keeps its value and simply reports the conflict.
  const returnConflict =
    roundTrip &&
    dates.departure !== null &&
    dates.returnDate !== null &&
    !isAfter(dates.returnDate, dates.departure);

  const departureError =
    datesTouched && dates.departure === null
      ? dateLabelsSource.departureRequired
      : null;

  const returnError = returnConflict
    ? dateLabelsSource.returnAfterDeparture
    : datesTouched && roundTrip && dates.returnDate === null
      ? dateLabelsSource.returnRequired
      : null;

  const items: TabItem[] = [
    { id: "flights", label: tabs.flights, icon: <FlightIcon size={18} /> },
    { id: "stays", label: tabs.stays, icon: <StayIcon size={18} /> },
    { id: "cars", label: tabs.cars, icon: <CarIcon size={18} /> },
    { id: "packages", label: tabs.packages, icon: <PackageIcon size={18} /> },
  ];

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    if (product !== "flights") {
      setFormNotice("unavailable");
      return;
    }

    let originError = validateField(origin, locationLabels.originRequired);
    let destinationError = validateField(
      destination,
      locationLabels.destinationRequired,
    );

    // Both sides resolve to the same airport (or overlapping airport sets) —
    // a search that cannot fly. The same policy the URL validator and the
    // intent builder use, so the form can never accept what they would reject.
    if (
      !originError &&
      !destinationError &&
      origin.selected &&
      destination.selected &&
      locationsOverlapForFlightSearch(origin.selected, destination.selected)
    ) {
      originError = locationLabels.sameLocation;
      destinationError = locationLabels.sameLocation;
    }

    setOrigin((state) => ({ ...state, error: originError }));
    setDestination((state) => ({ ...state, error: destinationError }));
    setDatesTouched(true);

    const datesInvalid =
      dates.departure === null ||
      returnConflict ||
      (roundTrip && dates.returnDate === null);

    if (originError || destinationError || datesInvalid) {
      setFormNotice("none");
      // Move focus to the first field that needs attention.
      const targetId = originError
        ? `${field("from")}-input`
        : destinationError
          ? `${field("to")}-input`
          : dates.departure === null
            ? `${field("dates")}-departure`
            : `${field("dates")}-return`;
      document.getElementById(targetId)?.focus();
      return;
    }

    // Everywhere is a real, resolved destination — it just has no ordinary
    // Flight Results yet. The search values stay exactly as entered.
    if (destination.selected?.isFlexibleDestination) {
      setFormNotice("everywhere");
      return;
    }

    if (!origin.selected || !destination.selected || !dates.departure) {
      // Unreachable given the checks above — kept as a guard so the intent
      // builder below never receives a null it would have to assert past.
      setFormNotice("unavailable");
      return;
    }

    const intent = buildSearchIntent({
      tripType: roundTrip ? "roundTrip" : "oneWay",
      origin: origin.selected,
      destination: destination.selected,
      departureDate: dates.departure,
      returnDate: dates.returnDate,
      travelers,
      cabinClass,
      flexibilityDays: dates.flexibilityDays,
      currency,
      locale,
    });

    if (!intent) {
      setFormNotice("unavailable");
      return;
    }

    setIsSubmitting(true);
    setFormNotice("none");
    const params = serializeSearchIntent(intent);
    router.push(`${localePath(locale, "/flights/results")}?${params.toString()}`);
  }

  const cabinOptions: readonly { value: CabinClass; label: string }[] = [
    { value: "economy", label: labels.options.cabin.economy },
    { value: "premiumEconomy", label: labels.options.cabin.premiumEconomy },
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
          setFormNotice("none");
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
              onChange={changeTripType}
              name={field("trip-type")}
              options={{
                roundTrip: labels.tripType.roundTrip,
                oneWay: labels.tripType.oneWay,
                multiCity: labels.tripType.multiCity,
              }}
              // Multi-city has no leg model yet. Leaving it selectable made the
              // form silently behave like One way, which is a lie about what
              // GTAI can do — so it stays visible and stays unavailable.
              unavailable={{
                multiCity: {
                  badge: labels.tripType.multiCityBadge,
                  explanation: labels.tripType.multiCityUnavailable,
                },
              }}
            />
            <TravelersControl
              value={travelers}
              onChange={setTravelers}
              labels={labels.travelers}
              locale={locale}
            />
            <SelectShell
              layout="inline"
              id={field("cabin")}
              label={labels.fields.cabinClass}
              icon={<SeatIcon size={16} />}
              options={cabinOptions}
              value={cabinClass}
              onChange={(event) => {
                const next = CABIN_CLASSES.find(
                  (cabin) => cabin === event.target.value,
                );
                if (next) setCabinClass(next);
              }}
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

            <DatePicker
              idPrefix={field("dates")}
              locale={locale}
              roundTrip={tripType === "roundTrip"}
              showReturn={tripType === "roundTrip"}
              value={dates}
              onChange={setDates}
              labels={dateLabels}
              departureError={departureError ?? undefined}
              returnError={returnError ?? undefined}
              className="sm:col-span-2 lg:col-span-4"
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
            <AirportSelector
              id={field("stay-destination")}
              context="destination"
              label={labels.fields.destination}
              labels={locationLabels}
              locale={locale}
              value={stayDestination.selected}
              query={stayDestination.query}
              onQueryChange={(query) =>
                setStayDestination({ selected: null, query, error: null })
              }
              onSelect={(selected) =>
                setStayDestination({ selected, query: "", error: null })
              }
              onClear={() => setStayDestination(EMPTY_FIELD)}
              allowFlexibleDestination={false}
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
            <AirportSelector
              id={field("pick-up")}
              context="origin"
              label={labels.fields.pickUp}
              labels={locationLabels}
              locale={locale}
              value={carPickUp.selected}
              query={carPickUp.query}
              onQueryChange={(query) =>
                setCarPickUp({ selected: null, query, error: null })
              }
              onSelect={(selected) =>
                setCarPickUp({ selected, query: "", error: null })
              }
              onClear={() => setCarPickUp(EMPTY_FIELD)}
              className="lg:col-span-3"
            />
            <AirportSelector
              id={field("drop-off")}
              context="destination"
              label={labels.fields.dropOff}
              labels={locationLabels}
              locale={locale}
              value={carDropOff.selected}
              query={carDropOff.query}
              onQueryChange={(query) =>
                setCarDropOff({ selected: null, query, error: null })
              }
              onSelect={(selected) =>
                setCarDropOff({ selected, query: "", error: null })
              }
              onClear={() => setCarDropOff(EMPTY_FIELD)}
              allowFlexibleDestination={false}
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
            <AirportSelector
              id={field("package-origin")}
              context="origin"
              label={labels.fields.origin}
              labels={locationLabels}
              locale={locale}
              value={packageOrigin.selected}
              query={packageOrigin.query}
              onQueryChange={(query) =>
                setPackageOrigin({ selected: null, query, error: null })
              }
              onSelect={(selected) =>
                setPackageOrigin({ selected, query: "", error: null })
              }
              onClear={() => setPackageOrigin(EMPTY_FIELD)}
              className="lg:col-span-3"
            />
            <AirportSelector
              id={field("package-destination")}
              context="destination"
              label={labels.fields.packageDestination}
              labels={locationLabels}
              locale={locale}
              value={packageDestination.selected}
              query={packageDestination.query}
              onQueryChange={(query) =>
                setPackageDestination({ selected: null, query, error: null })
              }
              onSelect={(selected) =>
                setPackageDestination({ selected, query: "", error: null })
              }
              onClear={() => setPackageDestination(EMPTY_FIELD)}
              allowFlexibleDestination={false}
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
          {formNotice === "unavailable" ? (
            <Alert tone="brand" live>
              {labels.submitDisabledHint} {labels.notice}
            </Alert>
          ) : formNotice === "everywhere" ? (
            <Alert tone="brand" live>
              {locationLabels.everywhereResultsUnavailable}{" "}
              <a
                href={localePath(locale, "/explore")}
                className="font-semibold underline underline-offset-2"
              >
                {locationLabels.exploreLink}
              </a>
            </Alert>
          ) : null}
        </div>
      </form>
    </div>
  );
}
