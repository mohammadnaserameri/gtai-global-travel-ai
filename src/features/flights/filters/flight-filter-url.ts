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

/** Writes the canonical filter/sort parameters onto an existing `URLSearchParams`, replacing any previous values for these keys. */
export function appendResultsViewStateParams(
  params: URLSearchParams,
  state: ResultsViewState,
  defaults: { readonly priceMax: number; readonly durationMax: number },
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

  if (
    state.filters.maxTotalPrice !== null &&
    state.filters.maxTotalPrice < defaults.priceMax
  ) {
    params.set(FILTER_PARAM.maxPrice, String(state.filters.maxTotalPrice));
  }

  if (
    state.filters.maxDurationMinutes !== null &&
    state.filters.maxDurationMinutes < defaults.durationMax
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
 */
export function buildResultsSearchParams(
  currentParams: URLSearchParams,
  state: ResultsViewState,
  defaults: { readonly priceMax: number; readonly durationMax: number },
): URLSearchParams {
  const next = new URLSearchParams();
  for (const key of Object.values(SEARCH_PARAM)) {
    const value = currentParams.get(key);
    if (value !== null) next.set(key, value);
  }
  const devScenario = currentParams.get(DEV_SCENARIO_PARAM);
  if (devScenario !== null) next.set(DEV_SCENARIO_PARAM, devScenario);

  appendResultsViewStateParams(next, state, defaults);
  return next;
}

export type { StopCategory, DepartureTimeBucket };
