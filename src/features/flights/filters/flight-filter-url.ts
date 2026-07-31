import type { SortOption } from "../flight-offer-ranking";
import { SORT_OPTIONS } from "../flight-offer-ranking";
import type { FlightOffer } from "../flight-offer-types";
import { SEARCH_PARAM } from "../search-intent-url";
import {
  arrivalAirportCodeForOffer,
  departureAirportCodeForOffer,
} from "./flight-filter-application";
import { durationBounds, priceBounds } from "./flight-filter-facets";
import {
  DEFAULT_RESULTS_VIEW_STATE,
  DEPARTURE_TIME_BUCKETS,
  STOP_CATEGORIES,
  type DepartureTimeBucket,
  type FlightFilterState,
  type ResultsViewState,
  type StopCategory,
} from "./flight-filter-types";

/**
 * The Results *view-state* URL contract — entirely separate from
 * `SEARCH_PARAM` in `search-intent-url.ts`. These parameters never identify
 * the requested trip; they only ever describe how the already-generated
 * result set is currently being viewed.
 */
export const FILTER_PARAM = {
  sort: "sort",
  stops: "stops",
  carriers: "carriers",
  departTime: "departTime",
  maxPrice: "maxPrice",
  maxDuration: "maxDuration",
  fromAirports: "fromAirports",
  toAirports: "toAirports",
} as const;

const DEV_SCENARIO_PARAM = "__devScenario";

export interface RawFilterParams {
  readonly sort: string | null;
  readonly stops: string | null;
  readonly carriers: string | null;
  readonly departTime: string | null;
  readonly maxPrice: string | null;
  readonly maxDuration: string | null;
  readonly fromAirports: string | null;
  readonly toAirports: string | null;
}

/**
 * Reads each known filter parameter, treating a duplicated key exactly like
 * an absent one — "ignore that filter field completely" is the same outcome
 * as "not present", so no separate duplicate-tracking is needed here (unlike
 * the strict Search Intent parser, which must distinguish "absent" from
 * "duplicated" to invalidate the whole URL).
 */
export function parseRawFilterParams(params: URLSearchParams): RawFilterParams {
  const read = (key: string): string | null => {
    const all = params.getAll(key);
    return all.length === 1 ? all[0] : null;
  };
  return {
    sort: read(FILTER_PARAM.sort),
    stops: read(FILTER_PARAM.stops),
    carriers: read(FILTER_PARAM.carriers),
    departTime: read(FILTER_PARAM.departTime),
    maxPrice: read(FILTER_PARAM.maxPrice),
    maxDuration: read(FILTER_PARAM.maxDuration),
    fromAirports: read(FILTER_PARAM.fromAirports),
    toAirports: read(FILTER_PARAM.toAirports),
  };
}

export function parseSortOption(raw: string | null): SortOption {
  return raw !== null && (SORT_OPTIONS as readonly string[]).includes(raw)
    ? (raw as SortOption)
    : "best";
}

/** A closed-enum CSV value: unknown members dropped, deduped, canonical order. */
function parseCsvEnum<T extends string>(
  raw: string | null,
  validValues: readonly T[],
): readonly T[] {
  if (raw === null || raw.length === 0) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if ((validValues as readonly string[]).includes(trimmed)) seen.add(trimmed);
  }
  return validValues.filter((value) => seen.has(value));
}

/** An open-ended CSV value (carrier ids, airport codes): deduped, alphabetically ordered. */
function parseCsvOpen(raw: string | null): readonly string[] {
  if (raw === null || raw.length === 0) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed.length > 0) seen.add(trimmed);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/** Strictly digits only — rejects negative, decimal, `NaN`, `Infinity` and empty values alike. */
function parseNonNegativeInteger(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

/** Format-level parsing only — does not yet know which carriers/airports/bounds actually exist. */
export function parseFilterState(params: URLSearchParams): FlightFilterState {
  const raw = parseRawFilterParams(params);
  return {
    stopCategories: parseCsvEnum(raw.stops, STOP_CATEGORIES),
    carrierIds: parseCsvOpen(raw.carriers),
    departureTimeBuckets: parseCsvEnum(raw.departTime, DEPARTURE_TIME_BUCKETS),
    maxTotalPrice: parseNonNegativeInteger(raw.maxPrice),
    maxDurationMinutes: parseNonNegativeInteger(raw.maxDuration),
    departureAirportCodes: parseCsvOpen(raw.fromAirports),
    arrivalAirportCodes: parseCsvOpen(raw.toAirports),
  };
}

export function parseResultsViewState(params: URLSearchParams): ResultsViewState {
  return {
    sort: parseSortOption(parseRawFilterParams(params).sort),
    filters: parseFilterState(params),
  };
}

/**
 * The second half of validation: values that were well-formed on their own
 * (right type, right shape) but only make sense once the complete offer set
 * is known. Applied every time a Results URL is read, including immediately
 * after a Search Intent change, so a stale carrier/airport id or an
 * out-of-range bound from a previous search can never leak into a new one —
 * the URL is re-read fresh, and only what is genuinely present now survives.
 */
export function sanitizeFiltersAgainstOffers(
  filters: FlightFilterState,
  offers: readonly FlightOffer[],
): FlightFilterState {
  const knownCarrierIds = new Set(offers.map((offer) => offer.validatingCarrierId));
  const knownDepartureCodes = new Set(offers.map(departureAirportCodeForOffer));
  const knownArrivalCodes = new Set(offers.map(arrivalAirportCodeForOffer));
  const price = priceBounds(offers);
  const duration = durationBounds(offers);

  return {
    stopCategories: filters.stopCategories,
    carrierIds: filters.carrierIds.filter((id) => knownCarrierIds.has(id)),
    departureTimeBuckets: filters.departureTimeBuckets,
    // A value below the observed minimum is just as unusable as one at or
    // above the maximum — both default to "unrestricted" rather than
    // silently producing a filter that (for a stale Search-state URL, or a
    // hand-edited one) could match nothing in the *current* offer set.
    maxTotalPrice:
      filters.maxTotalPrice !== null &&
      filters.maxTotalPrice >= price.min &&
      filters.maxTotalPrice < price.max
        ? filters.maxTotalPrice
        : null,
    maxDurationMinutes:
      filters.maxDurationMinutes !== null &&
      filters.maxDurationMinutes >= duration.min &&
      filters.maxDurationMinutes < duration.max
        ? filters.maxDurationMinutes
        : null,
    departureAirportCodes: filters.departureAirportCodes.filter((code) =>
      knownDepartureCodes.has(code),
    ),
    arrivalAirportCodes: filters.arrivalAirportCodes.filter((code) =>
      knownArrivalCodes.has(code),
    ),
  };
}

/**
 * The observed maxima the serializer compares numeric filters against when
 * deciding whether a value is restrictive enough to be worth writing down.
 *
 * The `null` case is the important one, and it is deliberately part of the
 * type rather than encoded as a magic number. It means **"the complete offer
 * set is not available here"** — not "there is no maximum", and certainly not
 * "the maximum is zero". A page that has not (or cannot) fetch offers still
 * holds a format-valid numeric filter parsed from the URL; it simply has
 * nothing to assess that value against yet. Dropping the value in that
 * situation would silently discard part of the visitor's view state on the
 * way back to Results.
 *
 * So: a number means offer-aware serialization (omit anything at or above the
 * real maximum); `null` means format-level serialization (keep the parsed
 * value verbatim and let Results sanitize it once its own offer set
 * resolves). No sentinel — no `Infinity`, no `-Infinity`, no
 * `Number.MAX_SAFE_INTEGER` — is ever used to fake an unknown bound, and no
 * sentinel is ever written into a URL.
 */
export interface ResultsSerializationBounds {
  readonly priceMax: number | null;
  readonly durationMax: number | null;
}

/**
 * The single numeric-serialization rule, shared by Price and Duration:
 *
 * - `null` value → omit (the filter is unset).
 * - unknown maximum → serialize (format-valid, not yet assessable).
 * - known maximum, value below it → serialize (genuinely restrictive).
 * - known maximum, value at or above it → omit (equivalent to unrestricted).
 */
function serializesNumericFilter(
  value: number | null,
  max: number | null,
): value is number {
  if (value === null) return false;
  return max === null || value < max;
}

/**
 * Derives serialization bounds from an offer set — the one place that decides
 * what "the bounds are known" means, so Results and Details can never disagree
 * about it.
 *
 * An empty set yields unknown bounds rather than numbers: `Math.min`/`Math.max`
 * over nothing produce `Infinity`/`-Infinity`, which are exactly the sentinels
 * this contract refuses to traffic in. Duration is measured per itinerary (see
 * `durationBounds`), never as a combined round-trip total.
 */
export function serializationBoundsForOffers(
  offers: readonly FlightOffer[],
): ResultsSerializationBounds {
  if (offers.length === 0) return { priceMax: null, durationMax: null };
  return {
    priceMax: priceBounds(offers).max,
    durationMax: durationBounds(offers).max,
  };
}

/** Writes the canonical filter/sort parameters onto an existing `URLSearchParams`, replacing any previous values for these keys. */
export function appendResultsViewStateParams(
  params: URLSearchParams,
  state: ResultsViewState,
  bounds: ResultsSerializationBounds,
): void {
  for (const key of Object.values(FILTER_PARAM)) params.delete(key);

  if (state.sort !== DEFAULT_RESULTS_VIEW_STATE.sort) {
    params.set(FILTER_PARAM.sort, state.sort);
  }

  const stops = STOP_CATEGORIES.filter((category) =>
    state.filters.stopCategories.includes(category),
  );
  if (stops.length > 0) params.set(FILTER_PARAM.stops, stops.join(","));

  const carriers = [...new Set(state.filters.carrierIds)].sort((a, b) =>
    a.localeCompare(b),
  );
  if (carriers.length > 0) params.set(FILTER_PARAM.carriers, carriers.join(","));

  const departTimes = DEPARTURE_TIME_BUCKETS.filter((bucket) =>
    state.filters.departureTimeBuckets.includes(bucket),
  );
  if (departTimes.length > 0)
    params.set(FILTER_PARAM.departTime, departTimes.join(","));

  if (serializesNumericFilter(state.filters.maxTotalPrice, bounds.priceMax)) {
    params.set(FILTER_PARAM.maxPrice, String(state.filters.maxTotalPrice));
  }

  if (
    serializesNumericFilter(state.filters.maxDurationMinutes, bounds.durationMax)
  ) {
    params.set(FILTER_PARAM.maxDuration, String(state.filters.maxDurationMinutes));
  }

  const fromAirports = [...new Set(state.filters.departureAirportCodes)].sort(
    (a, b) => a.localeCompare(b),
  );
  if (fromAirports.length > 0) {
    params.set(FILTER_PARAM.fromAirports, fromAirports.join(","));
  }

  const toAirports = [...new Set(state.filters.arrivalAirportCodes)].sort((a, b) =>
    a.localeCompare(b),
  );
  if (toAirports.length > 0)
    params.set(FILTER_PARAM.toAirports, toAirports.join(","));
}

/**
 * Builds the next full Results URL query string: every Search Intent
 * parameter is copied over **exactly** from the current URL (this function
 * never re-derives or re-validates them), `__devScenario` is preserved only
 * because it is an existing development escape hatch, and the canonical
 * filter/sort parameters are (re)written from `state`. Any other stray
 * parameter — including a stale or hand-edited filter key — is dropped,
 * since the canonical filter params above are the only ones this contract
 * recognizes.
 *
 * `bounds` decides only how the two numeric filters are treated: offer-aware
 * omission when the maxima are known, verbatim preservation when they are not.
 * See `ResultsSerializationBounds`.
 */
export function buildResultsSearchParams(
  currentParams: URLSearchParams,
  state: ResultsViewState,
  bounds: ResultsSerializationBounds,
): URLSearchParams {
  const next = new URLSearchParams();
  for (const key of Object.values(SEARCH_PARAM)) {
    const value = currentParams.get(key);
    if (value !== null) next.set(key, value);
  }
  const devScenario = currentParams.get(DEV_SCENARIO_PARAM);
  if (devScenario !== null) next.set(DEV_SCENARIO_PARAM, devScenario);

  appendResultsViewStateParams(next, state, bounds);
  return next;
}

export type { StopCategory, DepartureTimeBucket };
