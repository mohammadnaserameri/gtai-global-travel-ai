import type { SortOption } from "../flight-offer-ranking";

/** An offer's chronological complexity, classified by its worst-case direction. */
export type StopCategory = "direct" | "oneStop" | "twoPlusStops";

/** Canonical, deterministic order — used for both facet iteration and URL serialization. */
export const STOP_CATEGORIES: readonly StopCategory[] = [
  "direct",
  "oneStop",
  "twoPlusStops",
];

/** Outbound departure time of day, bucketed at the origin airport's local clock. */
export type DepartureTimeBucket =
  "earlyMorning" | "morning" | "afternoon" | "evening";

export const DEPARTURE_TIME_BUCKETS: readonly DepartureTimeBucket[] = [
  "earlyMorning",
  "morning",
  "afternoon",
  "evening",
];

/**
 * Provider-independent filter selection. Every field is either an empty
 * array/`null` (no restriction on that dimension) or a positive selection —
 * there is no separate "all" sentinel value to keep in sync with the option
 * lists themselves.
 */
export interface FlightFilterState {
  readonly stopCategories: readonly StopCategory[];
  readonly carrierIds: readonly string[];
  readonly departureTimeBuckets: readonly DepartureTimeBucket[];
  /** `null` means unrestricted (equivalent to the complete set's maximum). */
  readonly maxTotalPrice: number | null;
  /** `null` means unrestricted (equivalent to the complete set's maximum). */
  readonly maxDurationMinutes: number | null;
  readonly departureAirportCodes: readonly string[];
  readonly arrivalAirportCodes: readonly string[];
}

export const EMPTY_FILTER_STATE: FlightFilterState = {
  stopCategories: [],
  carrierIds: [],
  departureTimeBuckets: [],
  maxTotalPrice: null,
  maxDurationMinutes: null,
  departureAirportCodes: [],
  arrivalAirportCodes: [],
};

/**
 * How the generated result set is currently being viewed — separate from the
 * `FlightSearchIntent` that identifies *what trip* was requested. Sort and
 * filters never change which offers exist, only which are shown and in what
 * order.
 */
export interface ResultsViewState {
  readonly sort: SortOption;
  readonly filters: FlightFilterState;
}

export const DEFAULT_RESULTS_VIEW_STATE: ResultsViewState = {
  sort: "best",
  filters: EMPTY_FILTER_STATE,
};

/** The seven independently-toggleable filter dimensions, for active-group counting. */
export type FilterDimension =
  | "stopCategories"
  | "carrierIds"
  | "departureTimeBuckets"
  | "maxTotalPrice"
  | "maxDurationMinutes"
  | "departureAirportCodes"
  | "arrivalAirportCodes";
