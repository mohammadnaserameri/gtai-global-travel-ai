import type { IsoDate } from "../dates/date-types";
import { addDays, compareIso } from "../dates/date-utils";
import type {
  FlightItinerary,
  FlightOffer,
  FlightSegment,
} from "./flight-offer-types";
import type { FlightSearchIntent, LocationSnapshot } from "./search-intent-types";
import { isCanonicalFlightOffer } from "./flight-offer-validation";
import { resolveAirportTimeZone } from "./airport-timezone";
import { toLocalDateTime } from "./utc-timeline";
import { MIN_ROUND_TRIP_TURNAROUND_MINUTES } from "./flight-offer-policy";
import {
  findDemoCarrierById,
  isDemoBookingProvider,
  isDemoCarrierName,
  isDemoFlightNumberFor,
} from "./demo-flight-catalog";

/**
 * Intent-aware validation: whether an offer is internally consistent *and*
 * actually answers the search that was asked.
 *
 * `isCanonicalFlightOffer` establishes shape — the right fields, the right
 * types, exact keys, no smuggled properties. That is necessary and not
 * sufficient. A payload can satisfy every structural rule and still be
 * nonsense: a Montreal→London search answered with a Tokyo→Seoul itinerary,
 * a segment whose stated duration disagrees with its own timestamps, an
 * itinerary whose departure does not match its first segment, a layover at an
 * airport the route never touches, a total price that is not the per-traveler
 * price times the traveler count, a `"99:99"` wall clock. Every one of those
 * was demonstrably accepted before this module existed.
 *
 * Three more classes of nonsense are rejected here as of this round: a
 * `LocalDateTime` whose displayed date and time are not what its UTC epoch
 * reads as in that airport's own zone; an airport code that is regex-shaped
 * but absent from the GTAI location directory; and an identity — carrier,
 * flight number, validating carrier or booking provider — that is not in the
 * shared demonstration catalog. The last of those is what stops a real airline
 * or travel agency's name from appearing on an offer the interface labels as
 * a demonstration.
 *
 * The rules live here once and are applied at both boundaries — the server
 * over adapter output, the client over API responses — because a rule
 * implemented twice is a rule that will eventually disagree with itself. Both
 * callers pass the same normalized Search Intent that produced the request.
 *
 * Nothing here repairs anything. An inconsistent offer fails, and its whole
 * provider response is rejected: a partially trusted offer is worse than
 * none, because it looks exactly as authoritative as a real one.
 */

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Whether a `LocalDateTime` genuinely describes its epoch at `iataCode`'s
 * airport.
 *
 * A `LocalDateTime` carries three values — a local date, a local wall clock
 * and a UTC epoch minute — and only the epoch is authoritative. Nothing
 * previously required the other two to *be* that instant, so a payload could
 * state 08:00 on the departure date while its epoch pointed at 23:59 the day
 * before, and every downstream check (durations, chronology, ordering, the
 * flexibility window) would still pass because those all read the epoch. The
 * interface, which renders the date and time, would show a schedule that does
 * not exist.
 *
 * The comparison goes through the same shared conversion the generator uses,
 * so DST is handled by the project's one timezone architecture rather than by
 * arithmetic here — and by ICU data for the exact instant, never by a fixed
 * offset. An unknown airport is a rejection, not a skipped check: a code with
 * no zone cannot have its local time verified, and "unverifiable" must not
 * read as "valid".
 */
function localDateTimeMatchesAirport(
  value: {
    readonly date: IsoDate;
    readonly time: string;
    readonly epochMinutes: number;
  },
  iataCode: string,
): boolean {
  const timeZone = resolveAirportTimeZone(iataCode);
  if (timeZone === null) return false;
  // Structural validation has already bounded the epoch to the ECMAScript
  // range, so this conversion should not be able to fail. The guard is
  // defence in depth, not a substitute for that check: a validator whose job
  // is to answer yes or no must not have a third outcome, and an
  // `Intl.DateTimeFormat` that throws for any reason we did not anticipate
  // must read as "cannot be verified" — which is a rejection. The `catch` is
  // deliberately narrow, wrapping only the conversion, and it accepts nothing:
  // it returns `false`.
  try {
    const derived = toLocalDateTime(value.epochMinutes, timeZone);
    return derived.date === value.date && derived.time === value.time;
  } catch {
    return false;
  }
}

/**
 * Whether an airport code exists in the GTAI location directory.
 *
 * Membership is decided by the shared location/timezone source of truth — the
 * same map the generator resolves zones from — rather than by a second
 * allowlist that would need keeping in sync. A regex-valid invention like
 * `ZZZ`, `ABC` or `XXX` has no zone and is therefore not an airport.
 */
function isKnownAirport(iataCode: string): boolean {
  return resolveAirportTimeZone(iataCode) !== null;
}

/** Every airport code the location may legitimately appear as. */
function permittedCodes(location: LocationSnapshot): readonly string[] {
  if (location.entityType === "CITY_ALL_AIRPORTS") {
    // A city stands for its own airports and nothing else.
    return location.airportCodes;
  }
  // An airport entity is exactly itself.
  return location.iataCode === null ? [] : [location.iataCode];
}

/** `HH:mm` as a real 24-hour clock reading — not merely two digits, a colon and two digits. */
function isRealWallClock(time: string): boolean {
  return TIME_PATTERN.test(time);
}

/**
 * Whether `date` falls inside the flexibility window around `anchor`.
 *
 * Compared through the project's ISO helpers rather than `new Date(...)`:
 * parsing a date-only string with the platform constructor is UTC-anchored
 * and shifts under a negative local offset, which would quietly reject a
 * legitimate boundary date for anyone west of Greenwich.
 */
function withinFlexWindow(
  date: IsoDate,
  anchor: IsoDate,
  flexDays: number,
): boolean {
  const earliest = addDays(anchor, -flexDays);
  const latest = addDays(anchor, flexDays);
  return compareIso(date, earliest) >= 0 && compareIso(date, latest) <= 0;
}

function segmentIsConsistent(
  segment: FlightSegment,
  intent: FlightSearchIntent,
  demonstration: boolean,
): boolean {
  // Both endpoints must be airports GTAI actually knows. This is checked
  // before anything derived from them, because an unknown code makes the
  // timezone conversion below impossible rather than merely inconvenient.
  if (!isKnownAirport(segment.originCode)) return false;
  if (!isKnownAirport(segment.destinationCode)) return false;
  if (segment.originCode === segment.destinationCode) return false;

  if (!isRealWallClock(segment.departure.time)) return false;
  if (!isRealWallClock(segment.arrival.time)) return false;

  // Each end's displayed date and time must be the epoch, read in *that*
  // airport's zone — departure at the origin, arrival at the destination.
  if (!localDateTimeMatchesAirport(segment.departure, segment.originCode)) {
    return false;
  }
  if (!localDateTimeMatchesAirport(segment.arrival, segment.destinationCode)) {
    return false;
  }

  // Chronology and duration are checked against the authoritative epoch
  // minutes, and the stated duration must *be* that difference rather than
  // merely resemble it.
  const elapsed = segment.arrival.epochMinutes - segment.departure.epochMinutes;
  if (elapsed <= 0) return false;
  if (segment.durationMinutes !== elapsed) return false;

  // Demonstration identity, checked as a pair. A catalogued id with another
  // catalogued carrier's name is as wrong as a real airline's name — it makes
  // the offer internally inconsistent about who is flying it.
  if (demonstration) {
    const carrier = findDemoCarrierById(segment.carrierId);
    if (carrier === null) return false;
    if (segment.carrierName !== carrier.name) return false;
    if (!isDemoFlightNumberFor(segment.flightNumber, carrier)) return false;
  } else {
    if (!/^[A-Z0-9]{2}$/.test(segment.carrierId)) return false;
    if (!/^[A-Z0-9]{2}[A-Z0-9]{1,8}$/.test(segment.flightNumber)) return false;
  }

  return segment.cabinClass === intent.cabinClass;
}

function itineraryIsConsistent(itinerary: FlightItinerary): boolean {
  const segments = itinerary.segments;
  if (segments.length === 0) return false;

  const first = segments[0];
  const last = segments[segments.length - 1];

  // The itinerary's own endpoints must be the first and last segment's, in
  // all three fields — an epoch that agrees while the displayed date or time
  // does not is a rendering lie.
  if (
    itinerary.departure.date !== first.departure.date ||
    itinerary.departure.time !== first.departure.time ||
    itinerary.departure.epochMinutes !== first.departure.epochMinutes
  ) {
    return false;
  }
  if (
    itinerary.arrival.date !== last.arrival.date ||
    itinerary.arrival.time !== last.arrival.time ||
    itinerary.arrival.epochMinutes !== last.arrival.epochMinutes
  ) {
    return false;
  }

  // The route must actually connect: each leg starts where the previous one
  // ended. Without this a "Montreal → London" itinerary can contain
  // Montreal → Toronto followed by Dubai → London.
  for (let index = 1; index < segments.length; index += 1) {
    if (segments[index].originCode !== segments[index - 1].destinationCode) {
      return false;
    }
  }

  if (itinerary.stopCount !== segments.length - 1) return false;
  if (itinerary.layovers.length !== itinerary.stopCount) return false;

  let layoverTotal = 0;
  const layoverAirports = new Set<string>();
  for (let index = 0; index < itinerary.layovers.length; index += 1) {
    const layover = itinerary.layovers[index];
    const arriving = segments[index];
    const departing = segments[index + 1];

    // The connection is at a real airport, and at the one the route actually
    // passes through — stated from both sides, because a layover sits between
    // two segments and must agree with each of them independently.
    if (!isKnownAirport(layover.airportCode)) return false;
    if (layover.airportCode !== arriving.destinationCode) return false;
    if (layover.airportCode !== departing.originCode) return false;

    const ground = departing.departure.epochMinutes - arriving.arrival.epochMinutes;
    if (ground <= 0) return false;
    if (layover.durationMinutes !== ground) return false;

    // The generated-data policy requires distinct connection airports within
    // one direction; a repeat means the itinerary doubles back.
    if (layoverAirports.has(layover.airportCode)) return false;
    layoverAirports.add(layover.airportCode);

    layoverTotal += ground;
  }

  const elapsed = itinerary.arrival.epochMinutes - itinerary.departure.epochMinutes;
  if (elapsed <= 0) return false;
  if (itinerary.durationMinutes !== elapsed) return false;

  // The same total reached the other way: flying time plus ground time. Two
  // independent derivations must agree, which catches a doctored segment or
  // layover that left the endpoints untouched.
  const segmentTotal = segments.reduce((sum, s) => sum + s.durationMinutes, 0);
  return itinerary.durationMinutes === segmentTotal + layoverTotal;
}

/**
 * The itinerary's departure date as the origin airport's clock would actually
 * show it, derived from the epoch — never the date string the payload states.
 *
 * The flexibility window is a claim about *when the traveler leaves*, so it
 * has to be checked against the real local date. Reading `itinerary.departure.date`
 * instead would let a payload sit inside the window by assertion while its
 * instant fell outside it. `null` means the origin airport is unknown, which
 * fails the search-correspondence check that calls this.
 */
function airportLocalDepartureDate(itinerary: FlightItinerary): IsoDate | null {
  const first = itinerary.segments[0];
  if (first === undefined) return null;
  const timeZone = resolveAirportTimeZone(first.originCode);
  if (timeZone === null) return null;
  // Same totality guard as `localDateTimeMatchesAirport`: an unconvertible
  // instant yields `null`, which the caller treats as a failed check.
  try {
    return toLocalDateTime(first.departure.epochMinutes, timeZone).date;
  } catch {
    return null;
  }
}

function endpointsMatch(
  itinerary: FlightItinerary,
  originCodes: readonly string[],
  destinationCodes: readonly string[],
): boolean {
  const first = itinerary.segments[0];
  const last = itinerary.segments[itinerary.segments.length - 1];
  return (
    originCodes.includes(first.originCode) &&
    destinationCodes.includes(last.destinationCode)
  );
}

/**
 * The demonstration pricing policy, stated once.
 *
 * Infants on a lap are not charged; everyone else is, and a search always
 * charges at least one traveler. This mirrors the generator exactly, so a
 * provider cannot return a total that does not reconcile with the
 * per-traveler figure the interface displays beside it.
 */
export function chargeableTravelerCount(intent: FlightSearchIntent): number {
  return Math.max(
    1,
    intent.travelers.adults +
      intent.travelers.children +
      intent.travelers.infantsInSeat,
  );
}

/**
 * Whether an unknown value is a canonical offer that genuinely answers
 * `intent`.
 *
 * Structural validation runs first; everything after it is about meaning.
 */
export function isCanonicalFlightOfferForIntent(
  value: unknown,
  intent: FlightSearchIntent,
): value is FlightOffer {
  if (!isCanonicalFlightOffer(value)) return false;
  const offer: FlightOffer = value;

  // --- Search correspondence -------------------------------------------------
  if (offer.currency !== intent.currency) return false;

  const expectedItineraries = intent.tripType === "roundTrip" ? 2 : 1;
  if (offer.itineraries.length !== expectedItineraries) return false;

  const outbound = offer.itineraries[0];
  if (outbound.direction !== "outbound") return false;

  const originCodes = permittedCodes(intent.origin);
  const destinationCodes = permittedCodes(intent.destination);
  if (originCodes.length === 0 || destinationCodes.length === 0) return false;
  if (!endpointsMatch(outbound, originCodes, destinationCodes)) return false;

  const outboundLocalDate = airportLocalDepartureDate(outbound);
  if (outboundLocalDate === null) return false;
  if (
    !withinFlexWindow(
      outboundLocalDate,
      intent.departureDate,
      intent.flexibilityDays,
    )
  ) {
    return false;
  }

  if (expectedItineraries === 2) {
    const inbound = offer.itineraries[1];
    if (inbound.direction !== "inbound") return false;
    // The return leg reverses the endpoint sets.
    if (!endpointsMatch(inbound, destinationCodes, originCodes)) return false;
    if (intent.returnDate === null) return false;
    const inboundLocalDate = airportLocalDepartureDate(inbound);
    if (inboundLocalDate === null) return false;
    if (
      !withinFlexWindow(inboundLocalDate, intent.returnDate, intent.flexibilityDays)
    ) {
      return false;
    }

    // The turnaround floor, from the one shared policy the generator also
    // builds against. Decided from UTC instants only — a local wall clock
    // says nothing useful across two time zones. Without this the validator
    // accepted a one-minute "round trip" the generator would never produce.
    if (
      inbound.departure.epochMinutes <
      outbound.arrival.epochMinutes + MIN_ROUND_TRIP_TURNAROUND_MINUTES
    ) {
      return false;
    }
  }

  // --- Segment and itinerary consistency -------------------------------------
  for (const itinerary of offer.itineraries) {
    if (!itineraryIsConsistent(itinerary)) return false;
    for (const segment of itinerary.segments) {
      if (!segmentIsConsistent(segment, intent, offer.isDemonstration))
        return false;
    }
  }

  // --- Offer totals ----------------------------------------------------------
  const durationTotal = offer.itineraries.reduce(
    (sum, it) => sum + it.durationMinutes,
    0,
  );
  if (offer.rankingMetadata.totalDurationMinutes !== durationTotal) return false;

  const stopTotal = offer.itineraries.reduce((sum, it) => sum + it.stopCount, 0);
  if (offer.rankingMetadata.totalStopCount !== stopTotal) return false;

  if (offer.pricePerTraveler <= 0) return false;
  if (
    offer.isDemonstration &&
    offer.totalPrice !== offer.pricePerTraveler * chargeableTravelerCount(intent)
  ) {
    return false;
  }

  // --- Demonstration identity ------------------------------------------------
  // The validating carrier is a catalogued fictional airline, named
  // consistently with its own id, and — per the generated-data policy — one
  // that actually operates a segment of this offer rather than a label
  // attached from outside.
  const validatingCarrier = offer.isDemonstration
    ? findDemoCarrierById(offer.validatingCarrierId)
    : null;
  if (offer.isDemonstration) {
    if (validatingCarrier === null) return false;
    if (offer.validatingCarrierName !== validatingCarrier.name) return false;
  } else if (!/^[A-Z0-9]{2}$/.test(offer.validatingCarrierId)) return false;

  // The declared operating carriers must be exactly the set actually flying —
  // no missing carrier the traveler would meet at the gate, and no unrelated
  // name padding the list.
  const actualCarriers = new Set<string>();
  for (const itinerary of offer.itineraries) {
    for (const segment of itinerary.segments)
      actualCarriers.add(segment.carrierName);
  }
  const declaredCarriers = new Set(offer.operatingCarrierNames);
  if (declaredCarriers.size !== actualCarriers.size) return false;
  for (const carrier of actualCarriers) {
    if (!declaredCarriers.has(carrier)) return false;
    // Redundant given the per-segment check, and kept deliberately: this is
    // the assertion that the *offer-level* name list contains nothing but
    // catalogued fictional airlines, stated where a reader looking for "can a
    // real airline name appear here" will find it.
    if (offer.isDemonstration && !isDemoCarrierName(carrier)) return false;
  }
  if (
    offer.isDemonstration &&
    validatingCarrier !== null &&
    !actualCarriers.has(validatingCarrier.name)
  )
    return false;

  // The booking provider is one of the fictional demonstration providers.
  // A real agency name on a demonstration offer is a claim GTAI has no right
  // to make, whatever the rest of the payload looks like.
  if (offer.isDemonstration) {
    if (!isDemoBookingProvider(offer.provider)) return false;
  } else if (offer.provider !== "Duffel test inventory") return false;

  return true;
}

/** Every offer valid for the intent, with ids unique across the array. */
export function isCanonicalFlightOfferArrayForIntent(
  value: unknown,
  intent: FlightSearchIntent,
): value is readonly FlightOffer[] {
  if (!Array.isArray(value)) return false;
  if (!value.every((offer) => isCanonicalFlightOfferForIntent(offer, intent))) {
    return false;
  }
  const ids = new Set<string>();
  for (const offer of value as readonly FlightOffer[]) {
    if (ids.has(offer.id)) return false;
    ids.add(offer.id);
  }
  return true;
}
