import { isSupportedCurrency } from "../../config/currencies";
import { isValidIsoDate } from "../dates/date-utils";
import { CABIN_CLASSES } from "./search-intent-types";
import { isValidOfferId } from "./details/flight-details-url";
import { isSafeInteger, isValidEpochMinutes } from "./flight-offer-policy";
import type { FlightOffer } from "./flight-offer-types";

/**
 * Structural validation for a canonical `FlightOffer` arriving from
 * *anywhere* that is not this process's own generator.
 *
 * Both sides of the V2.7 boundary use it, for the same reason and with the
 * same suspicion:
 *
 * - the **server** runs it over every adapter's output, because an adapter is
 *   untrusted by policy even when today's only adapter is local and
 *   deterministic — the whole point of the boundary is that it does not
 *   depend on which adapter happens to be registered;
 * - the **client** runs it over every API response, because "it came from our
 *   own origin" is not evidence that a payload is well-formed. A cast would
 *   assert the shape; this checks it.
 *
 * The checks are structural and domain-level, never cosmetic: chronology must
 * hold on the authoritative epoch minutes, money must be a finite integer in a
 * supported currency, airport codes must look like codes, and the
 * demonstration marker must be present. Anything that fails is rejected whole
 * rather than repaired — a half-trusted offer is worse than none.
 */

const AIRPORT_CODE_PATTERN = /^[A-Z]{3}$/;
const AIRCRAFT_TYPES: readonly string[] = ["widebody", "narrowbody", "regionalJet"];
const DIRECTIONS: readonly string[] = ["outbound", "inbound"];

/**
 * The exact property set of every canonical shape.
 *
 * Checking only the fields we expect would let an *extra* one through — a
 * provider's own offer reference, a commission weight, a freshness timestamp,
 * an opaque token. Any of those would then flow into Filters, Sort,
 * Highlights and Details as if it were part of the model, and would be
 * serialized into the API response. So the check is exact rather than
 * partial: an object carrying a key this model does not define is rejected,
 * which is what makes "no provider-specific property reaches `FlightOffer`" a
 * property of the code rather than a hope about adapters.
 */
const OFFER_KEYS: readonly string[] = [
  "id",
  "currency",
  "totalPrice",
  "pricePerTraveler",
  "itineraries",
  "validatingCarrierId",
  "validatingCarrierName",
  "operatingCarrierNames",
  "provider",
  "baggage",
  "fare",
  "rankingMetadata",
  "isDemonstration",
];
const ITINERARY_KEYS: readonly string[] = [
  "direction",
  "segments",
  "departure",
  "arrival",
  "durationMinutes",
  "stopCount",
  "layovers",
];
const SEGMENT_KEYS: readonly string[] = [
  "id",
  "carrierId",
  "carrierName",
  "flightNumber",
  "originCode",
  "destinationCode",
  "departure",
  "arrival",
  "durationMinutes",
  "aircraftType",
  "cabinClass",
];
const LAYOVER_KEYS: readonly string[] = ["airportCode", "durationMinutes"];
const LOCAL_DATE_TIME_KEYS: readonly string[] = ["date", "time", "epochMinutes"];
const BAGGAGE_KEYS: readonly string[] = ["carryOnIncluded", "checkedBagIncluded"];
const FARE_KEYS: readonly string[] = ["refundable", "changeable"];
const RANKING_KEYS: readonly string[] = ["totalDurationMinutes", "totalStopCount"];

/** Whether an object carries exactly the allowed keys — no more, no fewer. */
function hasExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const keys = Object.keys(value);
  if (keys.length !== allowed.length) return false;
  return keys.every((key) => allowed.includes(key));
}

/**
 * Money, durations and counts are modelled in whole integers; a float here is
 * a defect, not a rounding style.
 *
 * `Number.isSafeInteger` rather than `Number.isInteger`, from the shared
 * policy module: past 2^53 the integers stop being distinct, so every identity
 * validation relies on — a total equalling the sum of its parts, a duration
 * equalling an epoch difference — quietly stops being decidable.
 */
const isFiniteInteger = isSafeInteger;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKnownCurrency(value: unknown): boolean {
  return typeof value === "string" && isSupportedCurrency(value);
}

function isLocalDateTime(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!hasExactKeys(value, LOCAL_DATE_TIME_KEYS)) return false;
  if (typeof value.date !== "string" || !isValidIsoDate(value.date)) return false;
  if (typeof value.time !== "string" || !/^\d{2}:\d{2}$/.test(value.time))
    return false;
  // Convertibility, not merely integrality: this epoch will be handed to
  // `Intl.DateTimeFormat` to be read in an airport's zone, and that call
  // throws for a time value outside the ECMAScript range.
  return isValidEpochMinutes(value.epochMinutes);
}

function epochOf(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const epoch = value.epochMinutes;
  // The same predicate as `isLocalDateTime`, so no path can extract an epoch
  // that structural validation would have refused.
  return isValidEpochMinutes(epoch) ? epoch : null;
}

function isSegment(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!hasExactKeys(value, SEGMENT_KEYS)) return false;
  if (!isNonEmptyString(value.id)) return false;
  if (!isNonEmptyString(value.carrierId)) return false;
  if (!isNonEmptyString(value.carrierName)) return false;
  // Demonstration flight identifiers are prefixed so they can never be
  // mistaken for, or matched against, a real airline's schedule.
  if (
    typeof value.flightNumber !== "string" ||
    !value.flightNumber.startsWith("DEMO-")
  ) {
    return false;
  }
  if (
    typeof value.originCode !== "string" ||
    !AIRPORT_CODE_PATTERN.test(value.originCode)
  ) {
    return false;
  }
  if (
    typeof value.destinationCode !== "string" ||
    !AIRPORT_CODE_PATTERN.test(value.destinationCode)
  ) {
    return false;
  }
  if (value.originCode === value.destinationCode) return false;
  if (!isLocalDateTime(value.departure) || !isLocalDateTime(value.arrival)) {
    return false;
  }
  const departure = epochOf(value.departure);
  const arrival = epochOf(value.arrival);
  if (departure === null || arrival === null || arrival <= departure) return false;
  if (!isFiniteInteger(value.durationMinutes) || value.durationMinutes <= 0) {
    return false;
  }
  if (typeof value.aircraftType !== "string") return false;
  if (!AIRCRAFT_TYPES.includes(value.aircraftType)) return false;
  if (typeof value.cabinClass !== "string") return false;
  return (CABIN_CLASSES as readonly string[]).includes(value.cabinClass);
}

function isItinerary(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!hasExactKeys(value, ITINERARY_KEYS)) return false;
  if (
    typeof value.direction !== "string" ||
    !DIRECTIONS.includes(value.direction)
  ) {
    return false;
  }
  const segments = value.segments;
  if (!Array.isArray(segments) || segments.length === 0) return false;
  if (!segments.every(isSegment)) return false;

  // Chronology is checked on the authoritative epoch minutes, never on the
  // wall-clock strings — those belong to different airports and cannot be
  // compared across time zones.
  for (let index = 1; index < segments.length; index += 1) {
    const previousArrival = epochOf(
      (segments[index - 1] as Record<string, unknown>).arrival,
    );
    const nextDeparture = epochOf(
      (segments[index] as Record<string, unknown>).departure,
    );
    if (previousArrival === null || nextDeparture === null) return false;
    if (nextDeparture <= previousArrival) return false;
  }

  if (!isLocalDateTime(value.departure) || !isLocalDateTime(value.arrival)) {
    return false;
  }
  const start = epochOf(value.departure);
  const end = epochOf(value.arrival);
  if (start === null || end === null || end <= start) return false;
  if (!isFiniteInteger(value.durationMinutes) || value.durationMinutes <= 0) {
    return false;
  }
  if (!isFiniteInteger(value.stopCount) || value.stopCount < 0) return false;
  if (value.stopCount !== segments.length - 1) return false;

  const layovers = value.layovers;
  if (!Array.isArray(layovers)) return false;
  if (layovers.length !== value.stopCount) return false;
  return layovers.every((layover) => {
    if (!isRecord(layover)) return false;
    if (!hasExactKeys(layover, LAYOVER_KEYS)) return false;
    if (
      typeof layover.airportCode !== "string" ||
      !AIRPORT_CODE_PATTERN.test(layover.airportCode)
    ) {
      return false;
    }
    return isFiniteInteger(layover.durationMinutes) && layover.durationMinutes > 0;
  });
}

function isBooleanPair(value: unknown, keys: readonly string[]): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, keys) &&
    keys.every((key) => typeof value[key] === "boolean")
  );
}

/**
 * Whether an unknown value is a canonical `FlightOffer`.
 *
 * Note what is deliberately *not* here: no provider-specific property is
 * tolerated or copied through, no URL field of any kind is accepted (the
 * caller additionally screens for those by name), and no price-freshness
 * timestamp exists on this model at all — there is nothing live to be fresh.
 */
export function isCanonicalFlightOffer(value: unknown): value is FlightOffer {
  if (!isRecord(value)) return false;
  // Exact keys, so a provider-specific field cannot ride in alongside valid ones.
  if (!hasExactKeys(value, OFFER_KEYS)) return false;

  if (!isNonEmptyString(value.id) || !isValidOfferId(value.id)) return false;
  if (!isKnownCurrency(value.currency)) return false;
  if (!isFiniteInteger(value.totalPrice) || value.totalPrice <= 0) return false;
  if (!isFiniteInteger(value.pricePerTraveler) || value.pricePerTraveler <= 0) {
    return false;
  }

  const itineraries = value.itineraries;
  if (!Array.isArray(itineraries)) return false;
  if (itineraries.length < 1 || itineraries.length > 2) return false;
  if (!itineraries.every(isItinerary)) return false;
  if (itineraries.length === 2) {
    // A return leg that departs before the outbound lands is not a schedule.
    const outboundArrival = epochOf(
      (itineraries[0] as Record<string, unknown>).arrival,
    );
    const inboundDeparture = epochOf(
      (itineraries[1] as Record<string, unknown>).departure,
    );
    if (outboundArrival === null || inboundDeparture === null) return false;
    if (inboundDeparture <= outboundArrival) return false;
  }

  if (!isNonEmptyString(value.validatingCarrierId)) return false;
  if (!isNonEmptyString(value.validatingCarrierName)) return false;
  const operating = value.operatingCarrierNames;
  if (!Array.isArray(operating) || !operating.every(isNonEmptyString)) return false;
  if (!isNonEmptyString(value.provider)) return false;

  if (!isBooleanPair(value.baggage, BAGGAGE_KEYS)) return false;
  if (!isBooleanPair(value.fare, FARE_KEYS)) return false;

  const ranking = value.rankingMetadata;
  if (!isRecord(ranking)) return false;
  if (!hasExactKeys(ranking, RANKING_KEYS)) return false;
  if (!isFiniteInteger(ranking.totalDurationMinutes)) return false;
  if (!isFiniteInteger(ranking.totalStopCount)) return false;

  // The demonstration marker is required, not defaulted: an offer that does
  // not assert it is demonstrative is not one this product will display.
  return value.isDemonstration === true;
}

export function isCanonicalFlightOfferArray(
  value: unknown,
): value is readonly FlightOffer[] {
  return Array.isArray(value) && value.every(isCanonicalFlightOffer);
}
