import type { IsoDate, FlexibilityDays } from "../dates/date-types";
import type { CurrencyCode } from "../../config/currencies";
import type {
  LocationEntityType,
  TravelLocation,
} from "../locations/location-types";

/**
 * Bumped only if the URL parameter contract changes in a way older links
 * cannot survive. A link built by an older version still round-trips as long
 * as every field it wrote is still readable — this only guards the shape.
 */
export const SEARCH_INTENT_VERSION = 1;

/** Multi-city is deliberately absent — the product has no leg model yet. */
export type FlightTripType = "roundTrip" | "oneWay";

export type CabinClass = "economy" | "premiumEconomy" | "business" | "first";

export const CABIN_CLASSES: readonly CabinClass[] = [
  "economy",
  "premiumEconomy",
  "business",
  "first",
];

export const MIN_ADULTS = 1;
export const MAX_TRAVELERS = 9;

export interface TravelerCounts {
  readonly adults: number;
  readonly children: number;
  readonly infantsInSeat: number;
  readonly infantsOnLap: number;
}

export const DEFAULT_TRAVELERS: TravelerCounts = {
  adults: MIN_ADULTS,
  children: 0,
  infantsInSeat: 0,
  infantsOnLap: 0,
};

export function totalTravelers(travelers: TravelerCounts): number {
  return (
    travelers.adults +
    travelers.children +
    travelers.infantsInSeat +
    travelers.infantsOnLap
  );
}

/**
 * A frozen snapshot of a resolved GTAI location entity — never a live
 * reference into the location repository, and never a provider identifier.
 * `FLEXIBLE_DESTINATION` never appears here: Everywhere is rejected before a
 * normal Search Intent is built.
 */
export interface LocationSnapshot {
  readonly entityId: string;
  readonly entityType: Exclude<LocationEntityType, "FLEXIBLE_DESTINATION">;
  /** Locale-appropriate name alone — no code, no parentheses. Bidi-isolate separately from `displayCode`. */
  readonly displayName: string;
  /** The code this entity is displayed with (`cityCode` for a city, `iataCode` for an airport). */
  readonly displayCode: string | null;
  /** `"Name (CODE)"`, kept for contexts that render one opaque string rather than isolating the code. */
  readonly displayLabel: string;
  readonly cityCode: string | null;
  readonly iataCode: string | null;
  readonly airportCodes: readonly string[];
  readonly countryCode: string;
  readonly timeZone: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

/**
 * The normalized, provider-independent description of a flight search.
 *
 * This is what the rest of GTAI reasons about — the Results page, the offer
 * repository, the search summary. It is never a provider payload: nothing
 * here is shaped for, or copied from, a booking API.
 */
export interface FlightSearchIntent {
  readonly version: number;
  readonly tripType: FlightTripType;
  readonly origin: LocationSnapshot;
  readonly destination: LocationSnapshot;
  readonly departureDate: IsoDate;
  /** Always null for one-way — absence, not an empty placeholder. */
  readonly returnDate: IsoDate | null;
  readonly travelers: TravelerCounts;
  readonly cabinClass: CabinClass;
  readonly flexibilityDays: FlexibilityDays;
  readonly currency: CurrencyCode;
  readonly locale: string;
}

/**
 * A safe, already-resolved flight search used to restore the form — built
 * server-side from a Results URL's query string with every field validated
 * or defaulted, never from raw untrusted input. `TravelLocation` is imported
 * as a type-only reference here to avoid a runtime dependency between the
 * flights feature and the location domain.
 */
export interface InitialFlightSearch {
  readonly tripType: FlightTripType;
  readonly origin: TravelLocation | null;
  readonly destination: TravelLocation | null;
  readonly departureDate: IsoDate | null;
  readonly returnDate: IsoDate | null;
  readonly travelers: TravelerCounts;
  readonly cabinClass: CabinClass;
  readonly flexibilityDays: FlexibilityDays;
}
