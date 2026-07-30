import type { FlexibilityDays, IsoDate } from "../dates/date-types";
import {
  createDateBounds,
  isAfter,
  isValidIsoDate,
  isWithinBounds,
  todayIso,
} from "../dates/date-utils";
import {
  defaultCurrency,
  isSupportedCurrency,
  type CurrencyCode,
} from "../../config/currencies";
import type { TravelLocation } from "../locations/location-types";
import { resolveLocationIds } from "../locations/location-search";
import { cityLabel, localizedName } from "../locations/location-presentation";
import { locationsOverlapForFlightSearch } from "./location-overlap";
import {
  CABIN_CLASSES,
  DEFAULT_TRAVELERS,
  MAX_TRAVELERS,
  MIN_ADULTS,
  SEARCH_INTENT_VERSION,
  totalTravelers,
  type CabinClass,
  type FlightSearchIntent,
  type FlightTripType,
  type InitialFlightSearch,
  type LocationSnapshot,
  type TravelerCounts,
} from "./search-intent-types";
import {
  sanitizeDuplicateFields,
  type RawSearchIntentParams,
} from "./search-intent-url";

export type SearchIntentInvalidReason =
  | "unsupportedVersion"
  | "duplicateParameter"
  | "unsupportedTripType"
  | "unknownOrigin"
  | "unknownDestination"
  | "sameLocation"
  | "destinationIsEverywhere"
  | "invalidDeparture"
  | "departureOutOfRange"
  | "missingReturn"
  | "invalidReturn"
  | "returnOutOfRange"
  | "returnNotAfterDeparture"
  | "invalidTravelers"
  | "invalidCabin"
  | "invalidFlexibility";

export interface SearchIntentValidationSuccess {
  readonly ok: true;
  readonly intent: FlightSearchIntent;
}

export interface SearchIntentValidationFailure {
  readonly ok: false;
  readonly reason: SearchIntentInvalidReason;
}

export type SearchIntentValidationResult =
  SearchIntentValidationSuccess | SearchIntentValidationFailure;

/** The bare locale-appropriate name, and the code it is displayed with, kept separate for bidi isolation. */
function nameAndCode(
  location: TravelLocation,
  locale: string,
): { readonly name: string; readonly code: string | null } {
  const isCity = location.entityType === "CITY_ALL_AIRPORTS";
  return {
    name: isCity ? cityLabel(location, locale) : localizedName(location, locale),
    code: isCity ? location.cityCode : location.iataCode,
  };
}

/** Everywhere is deliberately excluded — a normal Search Intent never carries it. */
function toSnapshot(
  location: TravelLocation,
  locale: string,
): LocationSnapshot | null {
  if (location.entityType === "FLEXIBLE_DESTINATION") return null;
  const { name, code } = nameAndCode(location, locale);
  return {
    entityId: location.id,
    entityType: location.entityType,
    displayName: name,
    displayCode: code,
    displayLabel: code ? `${name} (${code})` : name,
    cityCode: location.cityCode,
    iataCode: location.iataCode,
    airportCodes: location.airportCodes,
    countryCode: location.countryCode,
    timeZone: location.timeZone,
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

function resolveOne(id: string | null): TravelLocation | null {
  if (!id) return null;
  return resolveLocationIds([id])[0] ?? null;
}

/** A non-negative integer parsed strictly — `"1.5"`, `"-1"` and `"x"` all fail. */
function parseCount(value: string | null, fallback: number): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  return Number.parseInt(value, 10);
}

function parseTravelers(raw: {
  adults: string | null;
  children: string | null;
  infantsInSeat: string | null;
  infantsOnLap: string | null;
}): TravelerCounts | null {
  const adults = parseCount(raw.adults, MIN_ADULTS);
  const children = parseCount(raw.children, 0);
  const infantsInSeat = parseCount(raw.infantsInSeat, 0);
  const infantsOnLap = parseCount(raw.infantsOnLap, 0);
  if (
    adults === null ||
    children === null ||
    infantsInSeat === null ||
    infantsOnLap === null
  ) {
    return null;
  }
  const travelers: TravelerCounts = {
    adults,
    children,
    infantsInSeat,
    infantsOnLap,
  };
  if (!isValidTravelerCounts(travelers)) return null;
  return travelers;
}

/** The same rule the Travelers control enforces client-side, checked again here. */
export function isValidTravelerCounts(travelers: TravelerCounts): boolean {
  // Every field must be a finite integer — not just `adults`. A fractional or
  // non-finite count (`1.5`, `NaN`, `Infinity`) in any of the four fields is
  // rejected here, before any of the range rules below are even considered.
  const counts = [
    travelers.adults,
    travelers.children,
    travelers.infantsInSeat,
    travelers.infantsOnLap,
  ];
  if (!counts.every((count) => Number.isFinite(count) && Number.isInteger(count))) {
    return false;
  }
  if (travelers.adults < MIN_ADULTS) return false;
  if (
    travelers.children < 0 ||
    travelers.infantsInSeat < 0 ||
    travelers.infantsOnLap < 0
  ) {
    return false;
  }
  if (totalTravelers(travelers) > MAX_TRAVELERS) return false;
  if (travelers.infantsOnLap > travelers.adults) return false;
  return true;
}

function parseCabin(value: string | null): CabinClass | null {
  if (value === null) return "economy";
  const match = CABIN_CLASSES.find((cabin) => cabin === value);
  return match ?? null;
}

function parseFlex(value: string | null): FlexibilityDays | null {
  if (value === null) return 0;
  return value === "0" || value === "1" || value === "2" || value === "3"
    ? (Number(value) as FlexibilityDays)
    : null;
}

function parseCurrency(value: string | null): CurrencyCode {
  // Truthfulness applies to prices, not to link plumbing — an unsupported or
  // missing currency falls back silently rather than invalidating the whole
  // search, exactly like an unsupported locale falls back to English.
  return value !== null && isSupportedCurrency(value) ? value : defaultCurrency;
}

export type DatePolicyFailureReason =
  | "invalidDeparture"
  | "departureOutOfRange"
  | "missingReturn"
  | "invalidReturn"
  | "returnOutOfRange"
  | "returnNotAfterDeparture";

export type DatePolicyResult =
  | {
      readonly ok: true;
      readonly departureDate: IsoDate;
      readonly returnDate: IsoDate | null;
    }
  | { readonly ok: false; readonly reason: DatePolicyFailureReason };

/**
 * The single shared rule for a departure/return pair, used identically by
 * strict URL validation and `buildSearchIntent`. Both bounds — today through
 * +12 months — apply to **both** dates; the earlier implementation only ever
 * bounds-checked departure, silently accepting a return date years in the
 * future.
 */
export function validateFlightDatePair(
  tripType: FlightTripType,
  departure: string | null,
  returnValue: string | null,
): DatePolicyResult {
  if (!departure || !isValidIsoDate(departure)) {
    return { ok: false, reason: "invalidDeparture" };
  }
  const bounds = createDateBounds(todayIso());
  if (!isWithinBounds(departure, bounds)) {
    return { ok: false, reason: "departureOutOfRange" };
  }

  if (tripType !== "roundTrip") {
    // One way never trusts a stray return parameter — it is dropped, not read.
    return { ok: true, departureDate: departure, returnDate: null };
  }

  if (!returnValue || !isValidIsoDate(returnValue)) {
    return { ok: false, reason: returnValue ? "invalidReturn" : "missingReturn" };
  }
  if (!isWithinBounds(returnValue, bounds)) {
    return { ok: false, reason: "returnOutOfRange" };
  }
  if (!isAfter(returnValue, departure)) {
    return { ok: false, reason: "returnNotAfterDeparture" };
  }

  return { ok: true, departureDate: departure, returnDate: returnValue };
}

/**
 * The single authority for turning parsed URL fields into a normalized
 * `FlightSearchIntent`, or a specific, safe-to-render failure reason.
 *
 * Never throws. A malformed, truncated or hand-edited URL always resolves to
 * a `SearchIntentValidationFailure`, never an unhandled exception.
 */
export function validateSearchIntentParams(
  raw: RawSearchIntentParams,
  locale: string,
): SearchIntentValidationResult {
  // A duplicated known parameter is never trusted, even if every value is
  // individually well-formed — the strict path rejects the whole URL rather
  // than silently picking a "first" value.
  if (raw.duplicateKeys.length > 0) {
    return { ok: false, reason: "duplicateParameter" };
  }

  // The version parameter is required, not merely validated when present —
  // a link with no version is not a link this parser recognizes.
  if (raw.version !== String(SEARCH_INTENT_VERSION)) {
    return { ok: false, reason: "unsupportedVersion" };
  }

  if (raw.trip !== "roundTrip" && raw.trip !== "oneWay") {
    return { ok: false, reason: "unsupportedTripType" };
  }
  const tripType: FlightTripType = raw.trip;

  const originLocation = resolveOne(raw.origin);
  if (!originLocation || originLocation.entityType === "FLEXIBLE_DESTINATION") {
    return { ok: false, reason: "unknownOrigin" };
  }

  const destinationLocation = resolveOne(raw.destination);
  if (!destinationLocation) return { ok: false, reason: "unknownDestination" };
  if (destinationLocation.entityType === "FLEXIBLE_DESTINATION") {
    return { ok: false, reason: "destinationIsEverywhere" };
  }

  if (locationsOverlapForFlightSearch(originLocation, destinationLocation)) {
    return { ok: false, reason: "sameLocation" };
  }

  const dates = validateFlightDatePair(tripType, raw.departure, raw.returnDate);
  if (!dates.ok) return { ok: false, reason: dates.reason };

  const travelers = parseTravelers(raw);
  if (!travelers) return { ok: false, reason: "invalidTravelers" };

  const cabinClass = parseCabin(raw.cabin);
  if (!cabinClass) return { ok: false, reason: "invalidCabin" };

  const flexibilityDays = parseFlex(raw.flex);
  if (flexibilityDays === null) return { ok: false, reason: "invalidFlexibility" };

  const origin = toSnapshot(originLocation, locale);
  const destination = toSnapshot(destinationLocation, locale);
  if (!origin || !destination) return { ok: false, reason: "unknownOrigin" };

  return {
    ok: true,
    intent: {
      version: SEARCH_INTENT_VERSION,
      tripType,
      origin,
      destination,
      departureDate: dates.departureDate,
      returnDate: dates.returnDate,
      travelers,
      cabinClass,
      flexibilityDays,
      currency: parseCurrency(raw.currency),
      locale,
    },
  };
}

export interface BuildSearchIntentInput {
  readonly tripType: FlightTripType;
  readonly origin: TravelLocation;
  readonly destination: TravelLocation;
  readonly departureDate: IsoDate;
  readonly returnDate: IsoDate | null;
  readonly travelers: TravelerCounts;
  readonly cabinClass: CabinClass;
  readonly flexibilityDays: FlexibilityDays;
  readonly currency: CurrencyCode;
  readonly locale: string;
}

/**
 * Builds a Search Intent directly from already-selected form state.
 *
 * The Flight Search form re-validates trip type, Everywhere and overlapping
 * locations before this is ever called, so this returns `null` rather than a
 * reason — it is a last defensive check, not the form's primary validation
 * path. It still runs the *complete* set of checks (dates, cabin, flex,
 * travelers, overlap) rather than trusting the caller, because a defensive
 * check that only covers some fields is not actually defensive.
 */
export function buildSearchIntent(
  input: BuildSearchIntentInput,
): FlightSearchIntent | null {
  if (input.tripType !== "roundTrip" && input.tripType !== "oneWay") return null;

  const origin = toSnapshot(input.origin, input.locale);
  const destination = toSnapshot(input.destination, input.locale);
  if (!origin || !destination) return null;
  if (locationsOverlapForFlightSearch(input.origin, input.destination)) return null;

  const dates = validateFlightDatePair(
    input.tripType,
    input.departureDate,
    input.returnDate,
  );
  if (!dates.ok) return null;

  if (!isValidTravelerCounts(input.travelers)) return null;
  if (!CABIN_CLASSES.includes(input.cabinClass)) return null;
  if (
    input.flexibilityDays !== 0 &&
    input.flexibilityDays !== 1 &&
    input.flexibilityDays !== 2 &&
    input.flexibilityDays !== 3
  ) {
    return null;
  }

  return {
    version: SEARCH_INTENT_VERSION,
    tripType: input.tripType,
    origin,
    destination,
    departureDate: dates.departureDate,
    returnDate: dates.returnDate,
    travelers: input.travelers,
    cabinClass: input.cabinClass,
    flexibilityDays: input.flexibilityDays,
    currency: isSupportedCurrency(input.currency)
      ? input.currency
      : defaultCurrency,
    locale: input.locale,
  };
}

/**
 * Restores the Flight Search form from a query string leniently — the
 * opposite policy from `validateSearchIntentParams`. Each field is accepted
 * or safely defaulted on its own, so one bad parameter never discards a
 * request to restore the rest of a search. Only ever built from ids the
 * location repository already recognizes, so it can never create stale or
 * invented airport metadata. A duplicated field is treated as absent rather
 * than trusting one of its repeated values arbitrarily, and a past, out of
 * range, or otherwise invalid date is dropped rather than replaced with an
 * invented one — the field is simply left empty for the user to choose again.
 */
export function parseInitialFlightSearch(
  rawInput: RawSearchIntentParams,
): InitialFlightSearch | undefined {
  const raw = sanitizeDuplicateFields(rawInput);

  const hasAnyField = Boolean(
    raw.origin || raw.destination || raw.departure || raw.trip,
  );
  if (!hasAnyField) return undefined;

  const tripType: FlightTripType = raw.trip === "oneWay" ? "oneWay" : "roundTrip";

  const originLocation = resolveOne(raw.origin);
  const origin =
    originLocation && originLocation.entityType !== "FLEXIBLE_DESTINATION"
      ? originLocation
      : null;

  // Destination may restore to Everywhere — unlike a Results URL, the form
  // itself already knows how to display and submit that choice safely.
  const destination = resolveOne(raw.destination);

  const bounds = createDateBounds(todayIso());
  const departureDate =
    raw.departure &&
    isValidIsoDate(raw.departure) &&
    isWithinBounds(raw.departure, bounds)
      ? raw.departure
      : null;
  const returnCandidate =
    raw.returnDate &&
    isValidIsoDate(raw.returnDate) &&
    isWithinBounds(raw.returnDate, bounds)
      ? raw.returnDate
      : null;
  const returnDate =
    tripType === "roundTrip" &&
    departureDate &&
    returnCandidate &&
    isAfter(returnCandidate, departureDate)
      ? returnCandidate
      : null;

  return {
    tripType,
    origin,
    destination,
    departureDate,
    returnDate,
    travelers: parseTravelers(raw) ?? DEFAULT_TRAVELERS,
    cabinClass: parseCabin(raw.cabin) ?? "economy",
    flexibilityDays: parseFlex(raw.flex) ?? 0,
  };
}

export { DEFAULT_TRAVELERS };
