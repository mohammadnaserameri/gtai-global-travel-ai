import type { IsoDate } from "../dates/date-types";
import type {
  CabinClass,
  FlightSearchIntent,
  LocationSnapshot,
} from "./search-intent-types";
import type {
  AircraftType,
  BaggageSummary,
  FareSummary,
  FlightItinerary,
  FlightOffer,
  FlightSegment,
  ItineraryDirection,
  Layover,
} from "./flight-offer-types";
import { resolveAirportTimeZone } from "./airport-timezone";
import { fromLocalDateTime, toLocalDateTime } from "./utc-timeline";
import {
  abortError,
  FlightOfferRepositoryError,
  type FlightOfferRepository,
  type FlightOfferSearchResult,
} from "./flight-offer-repository";

/** Fictional demonstration airlines. No real livery, logo or IATA identity is implied. */
const CARRIERS: readonly { id: string; name: string; mark: string }[] = [
  { id: "aurora", name: "Aurora Air", mark: "AUR" },
  { id: "maple", name: "Maple Wings", mark: "MPW" },
  { id: "skyline", name: "Skyline Airways", mark: "SKY" },
  { id: "meridian", name: "Meridian Air", mark: "MER" },
];

/** Fictional demonstration booking providers — never a real travel agency. */
const PROVIDERS: readonly string[] = [
  "Atlas Connect",
  "Northstar Travel",
  "Voyage Hub",
];

const AIRCRAFT_TYPES: readonly AircraftType[] = [
  "widebody",
  "narrowbody",
  "regionalJet",
];

/**
 * Real, valid GTAI hub airports used only as plausible connection points.
 * Routing a demo layover through a real airport is not a schedule claim —
 * every card and the page-level disclosure both say these are demonstration
 * offers with no live schedule.
 */
const LAYOVER_HUB_CODES: readonly string[] = ["YYZ", "AMS", "FRA", "DXB"];

const CABIN_MULTIPLIER: Record<CabinClass, number> = {
  economy: 1,
  premiumEconomy: 1.6,
  business: 2.8,
  first: 4.2,
};

const OFFER_COUNT = 12;
/**
 * A round-trip offer whose inbound departure cannot be placed on the selected
 * Return date without violating chronology (see `MIN_ROUND_TRIP_TURNAROUND_MINUTES`
 * below) is skipped rather than forced, so the candidate pool is generated
 * slightly larger than `OFFER_COUNT` — bounded, never unbounded — to absorb
 * the rare skip and still land in the "approximately 10-16 offers" range.
 */
const MAX_OFFER_CANDIDATES = 24;
const KM_PER_MINUTE = 13.33; // ~800 km/h cruise, a round demo constant.
const TAXI_CLIMB_BUFFER_MINUTES = 35;
const FALLBACK_DISTANCE_KM = 3000;
const BASE_FARE_PER_KM = 0.11;

/** The minimum honest ground time between an inbound arrival and its return departure — never a same-instant or negative "turnaround". */
export const MIN_ROUND_TRIP_TURNAROUND_MINUTES = 60;

/**
 * A round-trip's inbound start time is only ever shifted by retrying with an
 * earlier *outbound* departure — never by re-rolling a different itinerary
 * shape. One retry (the earliest possible outbound slot) is the most benefit
 * shifting can ever provide, so two bounded attempts (natural, then earliest)
 * is enough to either succeed or correctly conclude the offer is infeasible.
 */
const MAX_OUTBOUND_DEPARTURE_ATTEMPTS = 2;

/** 05:00-22:45 in 15-minute steps, ascending — the fixed, finite pool used to deterministically find (or shift to) a valid departure slot. */
const CANDIDATE_START_SLOTS: readonly {
  readonly hour: number;
  readonly minute: number;
}[] = Array.from({ length: 18 * 4 }, (_, index) => ({
  hour: 5 + Math.floor(index / 4),
  minute: [0, 15, 30, 45][index % 4],
}));

function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic PRNG (mulberry32) — same seed always yields the same sequence. */
function createRng(seed: number): () => number {
  let state = seed;
  return function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

/** Deterministically draws `count` distinct items from `pool` — never with replacement. */
function pickDistinct<T>(
  rng: () => number,
  pool: readonly T[],
  count: number,
): T[] {
  const available = [...pool];
  const picked: T[] = [];
  for (let index = 0; index < count && available.length > 0; index += 1) {
    const at = Math.floor(rng() * available.length);
    picked.push(available[at]);
    available.splice(at, 1);
  }
  return picked;
}

/** Draws a departure slot in 05:00-22:45, 15-minute steps — unconstrained by chronology. */
function drawStartSlot(rng: () => number): { hour: number; minute: number } {
  const hour = 5 + Math.floor(rng() * 18);
  const minute = [0, 15, 30, 45][Math.floor(rng() * 4)];
  return { hour, minute };
}

/**
 * Finds a departure slot on `date`, local to `timeZone`, whose UTC instant is
 * no earlier than `earliestPermittedEpoch`. The naturally drawn slot is kept
 * whenever it already satisfies that bound (the common case); otherwise the
 * earliest still-valid slot from the fixed candidate pool is chosen — a
 * deterministic selection from the valid remainder, never a re-roll. Returns
 * `null` if even the last slot of the day is too early, meaning no departure
 * time on this exact calendar date can satisfy the bound.
 */
function resolveStartSlotNoEarlierThan(
  naturalSlot: { hour: number; minute: number },
  date: IsoDate,
  timeZone: string,
  earliestPermittedEpoch: number,
): { hour: number; minute: number } | null {
  const naturalEpoch = fromLocalDateTime(
    date,
    naturalSlot.hour,
    naturalSlot.minute,
    timeZone,
  );
  if (naturalEpoch >= earliestPermittedEpoch) return naturalSlot;

  for (const slot of CANDIDATE_START_SLOTS) {
    const epoch = fromLocalDateTime(date, slot.hour, slot.minute, timeZone);
    if (epoch >= earliestPermittedEpoch) return slot;
  }
  return null;
}

/**
 * Shifts every segment of an already-built itinerary by `deltaMinutes` of UTC
 * instant — chronology (durations, layover gaps) is preserved exactly because
 * every epoch moves by the same amount; only each segment's displayed local
 * date/time is recomputed, in its own airport's zone. Used to deterministically
 * retry an earlier outbound departure without re-drawing any randomness (the
 * itinerary's shape — stops, layovers, carriers, aircraft — never changes).
 */
function shiftItineraryStart(
  itinerary: FlightItinerary,
  deltaMinutes: number,
): FlightItinerary {
  if (deltaMinutes === 0) return itinerary;
  const segments = itinerary.segments.map((segment) => ({
    ...segment,
    departure: toLocalDateTime(
      segment.departure.epochMinutes + deltaMinutes,
      requireTimeZone(segment.originCode),
    ),
    arrival: toLocalDateTime(
      segment.arrival.epochMinutes + deltaMinutes,
      requireTimeZone(segment.destinationCode),
    ),
  }));
  return {
    ...itinerary,
    segments,
    departure: segments[0].departure,
    arrival: segments[segments.length - 1].arrival,
  };
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in kilometres, or a fallback when coordinates are absent. */
function distanceKm(a: LocationSnapshot, b: LocationSnapshot): number {
  if (
    a.latitude === null ||
    a.longitude === null ||
    b.latitude === null ||
    b.longitude === null
  ) {
    return FALLBACK_DISTANCE_KM;
  }
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** The specific member airport an offer uses for a City-all-airports entity. */
function resolveAirportCode(
  location: LocationSnapshot,
  offerIndex: number,
): string {
  if (location.entityType === "CITY_ALL_AIRPORTS") {
    const codes = location.airportCodes;
    return codes.length > 0
      ? codes[offerIndex % codes.length]
      : (location.cityCode ?? "???");
  }
  return location.iataCode ?? "???";
}

function requireTimeZone(code: string): string {
  const zone = resolveAirportTimeZone(code);
  if (!zone) {
    throw new FlightOfferRepositoryError(`No time zone known for airport ${code}`);
  }
  return zone;
}

function baggageFor(cabinClass: CabinClass): BaggageSummary {
  if (cabinClass === "economy")
    return { carryOnIncluded: true, checkedBagIncluded: false };
  return { carryOnIncluded: true, checkedBagIncluded: true };
}

function fareFor(cabinClass: CabinClass): FareSummary {
  if (cabinClass === "business" || cabinClass === "first") {
    return { refundable: true, changeable: true };
  }
  if (cabinClass === "premiumEconomy")
    return { refundable: false, changeable: true };
  return { refundable: false, changeable: false };
}

interface BuildItineraryResult {
  readonly itinerary: FlightItinerary;
  readonly operatingCarrierNames: readonly string[];
}

function buildItinerary(
  rng: () => number,
  direction: ItineraryDirection,
  date: IsoDate,
  originCode: string,
  originTimeZone: string,
  destinationCode: string,
  destinationTimeZone: string,
  stopCount: number,
  totalFlightMinutes: number,
  validatingCarrier: { id: string; name: string; mark: string },
  cabinClass: CabinClass,
  startHour: number,
  startMinute: number,
): BuildItineraryResult {
  const excluded = new Set([originCode, destinationCode]);
  const hubCandidates = LAYOVER_HUB_CODES.filter((code) => !excluded.has(code));
  // Picked without replacement, so no two layovers in one itinerary can ever
  // be the same airport, and neither can equal this itinerary's own ends.
  const layoverCodes = pickDistinct(rng, hubCandidates, stopCount);
  const layoverTimeZones = layoverCodes.map(requireTimeZone);
  const layoverMinutes = layoverCodes.map(() => 45 + Math.floor(rng() * 106)); // 45–150 minutes.

  const segmentCount = stopCount + 1;
  const perSegment = Math.floor(totalFlightMinutes / segmentCount);
  const segmentMinutes = Array.from({ length: segmentCount }, (_, index) =>
    index === segmentCount - 1
      ? totalFlightMinutes - perSegment * (segmentCount - 1)
      : perSegment,
  );

  let epochMinutes = fromLocalDateTime(
    date,
    startHour,
    startMinute,
    originTimeZone,
  );

  const segments: FlightSegment[] = [];
  const operatingCarriers = new Set<string>([validatingCarrier.name]);

  for (let index = 0; index < segmentCount; index += 1) {
    const isConnecting = index > 0;
    // A connecting segment is occasionally operated by a partner carrier —
    // the validating carrier still identifies the offer as a whole.
    const operatingCarrier =
      isConnecting && rng() < 0.3 ? pick(rng, CARRIERS) : validatingCarrier;
    operatingCarriers.add(operatingCarrier.name);

    const segmentOriginCode = index === 0 ? originCode : layoverCodes[index - 1];
    const segmentOriginTz =
      index === 0 ? originTimeZone : layoverTimeZones[index - 1];
    const segmentDestinationCode =
      index === segmentCount - 1 ? destinationCode : layoverCodes[index];
    const segmentDestinationTz =
      index === segmentCount - 1 ? destinationTimeZone : layoverTimeZones[index];

    const departureEpoch = epochMinutes;
    const arrivalEpoch = departureEpoch + segmentMinutes[index];

    segments.push({
      id: `${direction}-${index}-${segmentOriginCode}${segmentDestinationCode}`,
      carrierId: operatingCarrier.id,
      carrierName: operatingCarrier.name,
      flightNumber: `DEMO-${operatingCarrier.mark}-${100 + Math.floor(rng() * 900)}`,
      originCode: segmentOriginCode,
      destinationCode: segmentDestinationCode,
      departure: toLocalDateTime(departureEpoch, segmentOriginTz),
      arrival: toLocalDateTime(arrivalEpoch, segmentDestinationTz),
      durationMinutes: segmentMinutes[index],
      aircraftType: pick(rng, AIRCRAFT_TYPES),
      cabinClass,
    });

    epochMinutes =
      index < segmentCount - 1
        ? arrivalEpoch + layoverMinutes[index]
        : arrivalEpoch;
  }

  const layovers: Layover[] = layoverCodes.map((airportCode, index) => ({
    airportCode,
    durationMinutes: layoverMinutes[index],
  }));

  const totalDuration =
    segmentMinutes.reduce((sum, minutes) => sum + minutes, 0) +
    layoverMinutes.reduce((sum, minutes) => sum + minutes, 0);

  return {
    itinerary: {
      direction,
      segments,
      departure: segments[0].departure,
      arrival: segments[segments.length - 1].arrival,
      durationMinutes: totalDuration,
      stopCount,
      layovers,
    },
    operatingCarrierNames: [...operatingCarriers],
  };
}

/**
 * Defensive, throw-on-violation checks run on every generated offer before it
 * is returned. These should be unreachable given the construction above; they
 * exist so a future change to the generator fails loudly in verification
 * rather than silently shipping an impossible itinerary. Never exposed to the
 * customer — the repository only ever surfaces a generic error message.
 */
function assertOfferInvariants(
  offer: FlightOffer,
  intent: FlightSearchIntent,
  expectedOriginCode: string,
  expectedDestinationCode: string,
): void {
  const fail = (reason: string): never => {
    throw new FlightOfferRepositoryError(`Invariant violated: ${reason}`);
  };

  const expectedItineraryCount = intent.tripType === "roundTrip" ? 2 : 1;
  if (offer.itineraries.length !== expectedItineraryCount) fail("itinerary count");
  if (offer.totalPrice <= 0 || offer.pricePerTraveler <= 0)
    fail("non-positive price");

  for (const itinerary of offer.itineraries) {
    if (itinerary.segments.length === 0) fail("empty segments");
    if (itinerary.stopCount !== itinerary.segments.length - 1) fail("stop count");
    if (itinerary.layovers.length !== itinerary.stopCount) fail("layover count");

    const codes = itinerary.layovers.map((l) => l.airportCode);
    if (new Set(codes).size !== codes.length) fail("repeated layover");

    const isOutbound = itinerary.direction === "outbound";
    const itineraryOrigin = isOutbound
      ? expectedOriginCode
      : expectedDestinationCode;
    const itineraryDestination = isOutbound
      ? expectedDestinationCode
      : expectedOriginCode;

    if (itinerary.segments[0].originCode !== itineraryOrigin)
      fail("origin mismatch");
    if (
      itinerary.segments[itinerary.segments.length - 1].destinationCode !==
      itineraryDestination
    ) {
      fail("destination mismatch");
    }

    for (let index = 0; index < itinerary.segments.length; index += 1) {
      const segment = itinerary.segments[index];
      if (segment.originCode === segment.destinationCode) fail("self-segment");
      if (segment.arrival.epochMinutes <= segment.departure.epochMinutes) {
        fail("non-chronological segment");
      }
      if (index > 0) {
        const previous = itinerary.segments[index - 1];
        if (segment.originCode !== previous.destinationCode)
          fail("route discontinuity");
        const layover = itinerary.layovers[index - 1];
        if (
          segment.departure.epochMinutes !==
          previous.arrival.epochMinutes + layover.durationMinutes
        ) {
          fail("layover chronology");
        }
      }
      if (/^[A-Z]{2}\d{2,4}$/.test(segment.flightNumber))
        fail("real-looking flight number");
    }

    const segmentTotal = itinerary.segments.reduce(
      (sum, s) => sum + s.durationMinutes,
      0,
    );
    const layoverTotal = itinerary.layovers.reduce(
      (sum, l) => sum + l.durationMinutes,
      0,
    );
    if (itinerary.durationMinutes !== segmentTotal + layoverTotal)
      fail("duration mismatch");
  }

  if (intent.tripType === "roundTrip") {
    const [outbound, inbound] = offer.itineraries;
    if (outbound.direction !== "outbound") fail("first itinerary not outbound");
    if (inbound.direction !== "inbound") fail("second itinerary not inbound");
    if (outbound.departure.date !== intent.departureDate) {
      fail("outbound local departure date does not match selected departure date");
    }
    if (
      intent.returnDate === null ||
      inbound.departure.date !== intent.returnDate
    ) {
      fail("inbound local departure date does not match selected return date");
    }
    // Chronology and turnaround are decided from UTC instants only — never
    // from either itinerary's local wall-clock date or time.
    if (inbound.departure.epochMinutes <= outbound.arrival.epochMinutes) {
      fail("inbound departs before outbound arrives");
    }
    if (
      inbound.departure.epochMinutes <
      outbound.arrival.epochMinutes + MIN_ROUND_TRIP_TURNAROUND_MINUTES
    ) {
      fail("round-trip turnaround below the minimum");
    }
  }
}

/**
 * Builds one offer, or `null` if a round trip's inbound cannot be placed on
 * the selected Return date without violating chronology even after retrying
 * with the earliest possible outbound departure — see `MAX_OFFER_CANDIDATES`
 * at the call site, which simply skips such an index rather than forcing an
 * impossible itinerary.
 */
function buildOffer(
  intent: FlightSearchIntent,
  offerIndex: number,
): FlightOffer | null {
  const seedBase = [
    intent.origin.entityId,
    intent.destination.entityId,
    intent.departureDate,
    intent.returnDate ?? "",
    intent.tripType,
    intent.cabinClass,
  ].join("|");
  const rng = createRng(hashString(`${seedBase}#${offerIndex}`));

  const roll = rng();
  const stopCount = roll < 0.45 ? 0 : roll < 0.8 ? 1 : 2;

  const validatingCarrier = pick(rng, CARRIERS);
  const provider = pick(rng, PROVIDERS);

  const originCode = resolveAirportCode(intent.origin, offerIndex);
  const destinationCode = resolveAirportCode(intent.destination, offerIndex);
  const originTimeZone = requireTimeZone(originCode);
  const destinationTimeZone = requireTimeZone(destinationCode);

  const distance = distanceKm(intent.origin, intent.destination);
  const adjustedDistance = distance * (1 + stopCount * 0.12);
  const flightMinutes =
    Math.round(adjustedDistance / KM_PER_MINUTE) + TAXI_CLIMB_BUFFER_MINUTES;

  const outboundSlot = drawStartSlot(rng);
  const outboundBuild = buildItinerary(
    rng,
    "outbound",
    intent.departureDate,
    originCode,
    originTimeZone,
    destinationCode,
    destinationTimeZone,
    stopCount,
    flightMinutes,
    validatingCarrier,
    intent.cabinClass,
    outboundSlot.hour,
    outboundSlot.minute,
  );

  let outboundItinerary = outboundBuild.itinerary;
  const itineraries: FlightItinerary[] = [];
  const operatingCarrierNames = new Set(outboundBuild.operatingCarrierNames);

  if (intent.tripType === "roundTrip" && intent.returnDate) {
    const returnDate = intent.returnDate;
    const inboundStopRoll = rng();
    const inboundStops = inboundStopRoll < 0.45 ? 0 : inboundStopRoll < 0.8 ? 1 : 2;
    const inboundMinutes =
      Math.round((distance * (1 + inboundStops * 0.12)) / KM_PER_MINUTE) +
      TAXI_CLIMB_BUFFER_MINUTES;
    // Drawn once, up front, so the rng stream used by the inbound leg's own
    // hub/aircraft/carrier choices below is identical regardless of whether
    // an outbound-departure retry ends up being needed.
    const inboundNaturalSlot = drawStartSlot(rng);

    let resolvedInboundSlot: { hour: number; minute: number } | null = null;
    for (let attempt = 0; attempt < MAX_OUTBOUND_DEPARTURE_ATTEMPTS; attempt += 1) {
      const earliestPermittedEpoch =
        outboundItinerary.arrival.epochMinutes + MIN_ROUND_TRIP_TURNAROUND_MINUTES;
      resolvedInboundSlot = resolveStartSlotNoEarlierThan(
        inboundNaturalSlot,
        returnDate,
        destinationTimeZone,
        earliestPermittedEpoch,
      );
      if (resolvedInboundSlot) break;
      if (attempt + 1 < MAX_OUTBOUND_DEPARTURE_ATTEMPTS) {
        // Deterministically retry with the earliest possible outbound
        // departure — the most an earlier departure can ever help by. This
        // reshapes no randomness: only the UTC instant every segment sits at
        // shifts, via `shiftItineraryStart`.
        const earliestSlot = CANDIDATE_START_SLOTS[0];
        const earliestOutboundEpoch = fromLocalDateTime(
          intent.departureDate,
          earliestSlot.hour,
          earliestSlot.minute,
          originTimeZone,
        );
        const delta =
          earliestOutboundEpoch - outboundItinerary.departure.epochMinutes;
        outboundItinerary = shiftItineraryStart(outboundItinerary, delta);
      }
    }

    if (!resolvedInboundSlot) {
      // Bounded attempts exhausted: this offer index cannot honor round-trip
      // chronology on the selected Return date. Skip it rather than return
      // an impossible offer — the caller generates a slightly larger
      // candidate pool to absorb this.
      return null;
    }

    itineraries.push(outboundItinerary);

    const inboundBuild = buildItinerary(
      rng,
      "inbound",
      returnDate,
      destinationCode,
      destinationTimeZone,
      originCode,
      originTimeZone,
      inboundStops,
      inboundMinutes,
      validatingCarrier,
      intent.cabinClass,
      resolvedInboundSlot.hour,
      resolvedInboundSlot.minute,
    );
    itineraries.push(inboundBuild.itinerary);
    inboundBuild.operatingCarrierNames.forEach((name) =>
      operatingCarrierNames.add(name),
    );
  } else {
    itineraries.push(outboundItinerary);
  }

  const cabinMultiplier = CABIN_MULTIPLIER[intent.cabinClass];
  const tripFactor = intent.tripType === "roundTrip" ? 1.8 : 1;
  const stopDiscount = stopCount > 0 ? 0.94 : 1;
  const providerVariance = 0.85 + rng() * 0.3;

  const pricePerTraveler = Math.max(
    1,
    Math.round(
      distance *
        BASE_FARE_PER_KM *
        cabinMultiplier *
        tripFactor *
        stopDiscount *
        providerVariance,
    ),
  );

  const chargeableTravelers = Math.max(
    1,
    intent.travelers.adults +
      intent.travelers.children +
      intent.travelers.infantsInSeat,
  );
  const totalPrice = pricePerTraveler * chargeableTravelers;

  const totalDurationMinutes = itineraries.reduce(
    (sum, it) => sum + it.durationMinutes,
    0,
  );
  const totalStopCount = itineraries.reduce((sum, it) => sum + it.stopCount, 0);

  const offer: FlightOffer = {
    id: `demo-${hashString(seedBase).toString(36)}-${offerIndex}`,
    currency: intent.currency,
    totalPrice,
    pricePerTraveler,
    itineraries,
    validatingCarrierId: validatingCarrier.id,
    validatingCarrierName: validatingCarrier.name,
    operatingCarrierNames: [...operatingCarrierNames],
    provider,
    baggage: baggageFor(intent.cabinClass),
    fare: fareFor(intent.cabinClass),
    rankingMetadata: { totalDurationMinutes, totalStopCount },
    isDemonstration: true,
  };

  assertOfferInvariants(offer, intent, originCode, destinationCode);

  return offer;
}

export type DemoOfferScenario = "normal" | "empty" | "error";

interface DemoFlightOfferRepositoryOptions {
  /** Constant delay rather than a random one, so timing stays deterministic. */
  delayMs?: number;
  scenario?: DemoOfferScenario;
}

/**
 * Generates flight offers entirely locally. No network request is made and
 * no external dependency is used — every price, time and identifier is a
 * pure function of the Search Intent and an offer index.
 */
export class DemoFlightOfferRepository implements FlightOfferRepository {
  private readonly delayMs: number;
  private readonly scenario: DemoOfferScenario;

  constructor(options: DemoFlightOfferRepositoryOptions = {}) {
    this.delayMs = options.delayMs ?? 550;
    this.scenario = options.scenario ?? "normal";
  }

  private delay(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, this.delayMs);
      function onAbort() {
        clearTimeout(timer);
        reject(abortError());
      }
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  async search(
    intent: FlightSearchIntent,
    signal?: AbortSignal,
  ): Promise<FlightOfferSearchResult> {
    await this.delay(signal);
    if (signal?.aborted) throw abortError();

    if (this.scenario === "error") {
      throw new FlightOfferRepositoryError();
    }
    if (this.scenario === "empty") {
      return { offers: [] };
    }

    // A bounded candidate scan, not an unbounded loop: at most
    // `MAX_OFFER_CANDIDATES` offer indices are ever built, and any index
    // whose round trip cannot honor chronology (see `buildOffer`) is skipped
    // rather than forced — the target count is a target, not a guarantee.
    const offers: FlightOffer[] = [];
    for (
      let index = 0;
      offers.length < OFFER_COUNT && index < MAX_OFFER_CANDIDATES;
      index += 1
    ) {
      const offer = buildOffer(intent, index);
      if (offer) offers.push(offer);
    }
    return { offers };
  }
}
