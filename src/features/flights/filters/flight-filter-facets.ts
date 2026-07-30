import type { FlightOffer } from "../flight-offer-types";
import { applyFilters } from "./flight-filter-application";
import {
  arrivalAirportCodeForOffer,
  departureAirportCodeForOffer,
  departureTimeBucketForOffer,
  maxStopCountForOffer,
  stopCategoryForCount,
} from "./flight-filter-application";
import {
  DEPARTURE_TIME_BUCKETS,
  STOP_CATEGORIES,
  type DepartureTimeBucket,
  type FilterDimension,
  type FlightFilterState,
  type StopCategory,
} from "./flight-filter-types";

export interface RangeBounds {
  readonly min: number;
  readonly max: number;
}

/** Read fresh from the complete, unfiltered offer set — never a fixed scale. */
export function priceBounds(offers: readonly FlightOffer[]): RangeBounds {
  const prices = offers.map((offer) => offer.totalPrice);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/** Per-itinerary duration bounds — the same scale the maximum-duration filter is checked against. */
export function durationBounds(offers: readonly FlightOffer[]): RangeBounds {
  const durations = offers.flatMap((offer) =>
    offer.itineraries.map((itinerary) => itinerary.durationMinutes),
  );
  return { min: Math.min(...durations), max: Math.max(...durations) };
}

/**
 * The domain a `<input type="range">` actually needs, kept separate from the
 * observed filter bounds: `(max - min)` is not guaranteed to be a multiple of
 * `step` (425–763 at a 15-minute step, for instance), so the slider's own
 * maximum has to be rounded *up* to the next reachable step position —
 * `sliderMax` — while every filtering and URL decision still compares
 * against the true observed `max`. `sliderMax` is exactly the position that
 * represents "unrestricted": committing at or past the observed `max`
 * (which the slider can always reach, since `sliderMax >= max`) yields
 * `null`, never a value the filter would actually enforce.
 */
export interface RangeSliderDomain {
  readonly min: number;
  readonly max: number;
  readonly sliderMax: number;
  readonly step: number;
}

export function computeRangeSliderDomain(
  bounds: RangeBounds,
  step: number,
): RangeSliderDomain {
  const steps = Math.ceil((bounds.max - bounds.min) / step);
  return {
    min: bounds.min,
    max: bounds.max,
    sliderMax: bounds.min + steps * step,
    step,
  };
}

export interface CarrierOption {
  readonly id: string;
  readonly name: string;
}

/** Every fictional validating carrier actually present in this result set, in a stable order. */
export function availableCarriers(
  offers: readonly FlightOffer[],
): readonly CarrierOption[] {
  const byId = new Map<string, string>();
  for (const offer of offers) {
    if (!byId.has(offer.validatingCarrierId)) {
      byId.set(offer.validatingCarrierId, offer.validatingCarrierName);
    }
  }
  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function availableDepartureAirportCodes(
  offers: readonly FlightOffer[],
): readonly string[] {
  return [...new Set(offers.map(departureAirportCodeForOffer))].sort();
}

export function availableArrivalAirportCodes(
  offers: readonly FlightOffer[],
): readonly string[] {
  return [...new Set(offers.map(arrivalAirportCodeForOffer))].sort();
}

function withoutStops(filters: FlightFilterState): FlightFilterState {
  return { ...filters, stopCategories: [] };
}
function withoutCarriers(filters: FlightFilterState): FlightFilterState {
  return { ...filters, carrierIds: [] };
}
function withoutDepartureTime(filters: FlightFilterState): FlightFilterState {
  return { ...filters, departureTimeBuckets: [] };
}
function withoutDepartureAirports(filters: FlightFilterState): FlightFilterState {
  return { ...filters, departureAirportCodes: [] };
}
function withoutArrivalAirports(filters: FlightFilterState): FlightFilterState {
  return { ...filters, arrivalAirportCodes: [] };
}

function countByStopCategory(
  offers: readonly FlightOffer[],
): ReadonlyMap<StopCategory, number> {
  const counts = new Map<StopCategory, number>(STOP_CATEGORIES.map((c) => [c, 0]));
  for (const offer of offers) {
    const category = stopCategoryForCount(maxStopCountForOffer(offer));
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return counts;
}

function countByDepartureTimeBucket(
  offers: readonly FlightOffer[],
): ReadonlyMap<DepartureTimeBucket, number> {
  const counts = new Map<DepartureTimeBucket, number>(
    DEPARTURE_TIME_BUCKETS.map((b) => [b, 0]),
  );
  for (const offer of offers) {
    const bucket = departureTimeBucketForOffer(offer);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return counts;
}

function countByKey(
  offers: readonly FlightOffer[],
  keyFor: (offer: FlightOffer) => string,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const offer of offers) {
    const key = keyFor(offer);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export interface FacetCounts {
  readonly stopCategories: ReadonlyMap<StopCategory, number>;
  readonly carriers: ReadonlyMap<string, number>;
  readonly departureTimeBuckets: ReadonlyMap<DepartureTimeBucket, number>;
  readonly departureAirportCodes: ReadonlyMap<string, number>;
  readonly arrivalAirportCodes: ReadonlyMap<string, number>;
}

/**
 * Contextual facet counts: each dimension's option counts are computed after
 * applying every *other* active filter dimension, but never the dimension
 * itself — so checking a Stops box narrows the Carrier counts, but never
 * narrows its own Stops counts down to only the checked option. Never
 * queries or regenerates the repository; this is a pure function of the
 * already-fetched complete offer set.
 */
export function computeFacetCounts(
  offers: readonly FlightOffer[],
  filters: FlightFilterState,
): FacetCounts {
  return {
    stopCategories: countByStopCategory(
      applyFilters(offers, withoutStops(filters)),
    ),
    carriers: countByKey(
      applyFilters(offers, withoutCarriers(filters)),
      (offer) => offer.validatingCarrierId,
    ),
    departureTimeBuckets: countByDepartureTimeBucket(
      applyFilters(offers, withoutDepartureTime(filters)),
    ),
    departureAirportCodes: countByKey(
      applyFilters(offers, withoutDepartureAirports(filters)),
      departureAirportCodeForOffer,
    ),
    arrivalAirportCodes: countByKey(
      applyFilters(offers, withoutArrivalAirports(filters)),
      arrivalAirportCodeForOffer,
    ),
  };
}

const ACTIVE_DIMENSIONS: readonly FilterDimension[] = [
  "stopCategories",
  "carrierIds",
  "departureTimeBuckets",
  "maxTotalPrice",
  "maxDurationMinutes",
  "departureAirportCodes",
  "arrivalAirportCodes",
];

function isDimensionActive(
  filters: FlightFilterState,
  dimension: FilterDimension,
): boolean {
  const value = filters[dimension];
  return Array.isArray(value) ? value.length > 0 : value !== null;
}

/**
 * The number of independently-active filter *groups* (at most 7) — not the
 * number of individual selected values. Selecting two carriers still counts
 * as one active group. Sort is never counted.
 */
export function activeFilterGroupCount(filters: FlightFilterState): number {
  return ACTIVE_DIMENSIONS.filter((dimension) =>
    isDimensionActive(filters, dimension),
  ).length;
}
