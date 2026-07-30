import type { FlightItinerary, FlightOffer } from "../flight-offer-types";
import type {
  DepartureTimeBucket,
  FlightFilterState,
  StopCategory,
} from "./flight-filter-types";

/**
 * An offer's outbound itinerary — the one direction V2.4 filters by for
 * departure time and departure/arrival airport. Falls back to the only
 * itinerary for a one-way offer, where "outbound" is simply the whole trip.
 */
export function outboundItinerary(offer: FlightOffer): FlightItinerary {
  return (
    offer.itineraries.find((itinerary) => itinerary.direction === "outbound") ??
    offer.itineraries[0]
  );
}

/**
 * The worst-case stop count across every itinerary in the offer — a round
 * trip with a direct outbound and a one-stop inbound is classified "1 stop",
 * matching the spec's `max(outbound.stopCount, inbound.stopCount)` rule.
 */
export function maxStopCountForOffer(offer: FlightOffer): number {
  return Math.max(...offer.itineraries.map((itinerary) => itinerary.stopCount));
}

export function stopCategoryForCount(stopCount: number): StopCategory {
  if (stopCount === 0) return "direct";
  if (stopCount === 1) return "oneStop";
  return "twoPlusStops";
}

/** Outbound departure hour, read from the first segment's origin-airport local time — never UTC. */
function outboundDepartureHour(offer: FlightOffer): number {
  const firstSegment = outboundItinerary(offer).segments[0];
  return Number(firstSegment.departure.time.slice(0, 2));
}

/** 00:00-05:59 / 06:00-11:59 / 12:00-17:59 / 18:00-23:59, outbound only. */
export function departureTimeBucketForOffer(
  offer: FlightOffer,
): DepartureTimeBucket {
  const hour = outboundDepartureHour(offer);
  if (hour < 6) return "earlyMorning";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

/** The outbound itinerary's first segment origin — where the traveller actually leaves from. */
export function departureAirportCodeForOffer(offer: FlightOffer): string {
  return outboundItinerary(offer).segments[0].originCode;
}

/** The outbound itinerary's last segment destination — where the outbound leg actually lands. */
export function arrivalAirportCodeForOffer(offer: FlightOffer): string {
  const segments = outboundItinerary(offer).segments;
  return segments[segments.length - 1].destinationCode;
}

/**
 * Whether every itinerary in the offer is within the maximum — checked
 * per-direction, never against the combined round-trip total, so a round
 * trip's outbound and inbound each have to individually qualify.
 */
function everyItineraryWithinDuration(
  offer: FlightOffer,
  maxMinutes: number,
): boolean {
  return offer.itineraries.every(
    (itinerary) => itinerary.durationMinutes <= maxMinutes,
  );
}

/**
 * The single predicate every filter dimension is combined through — an empty
 * selection array (or a `null` numeric maximum) means that dimension imposes
 * no restriction at all, never "matches nothing". Dimensions combine with
 * AND; values within one multi-select dimension combine with OR.
 */
export function offerMatchesFilters(
  offer: FlightOffer,
  filters: FlightFilterState,
): boolean {
  if (
    filters.stopCategories.length > 0 &&
    !filters.stopCategories.includes(
      stopCategoryForCount(maxStopCountForOffer(offer)),
    )
  ) {
    return false;
  }
  if (
    filters.carrierIds.length > 0 &&
    !filters.carrierIds.includes(offer.validatingCarrierId)
  ) {
    return false;
  }
  if (
    filters.departureTimeBuckets.length > 0 &&
    !filters.departureTimeBuckets.includes(departureTimeBucketForOffer(offer))
  ) {
    return false;
  }
  if (filters.maxTotalPrice !== null && offer.totalPrice > filters.maxTotalPrice) {
    return false;
  }
  if (
    filters.maxDurationMinutes !== null &&
    !everyItineraryWithinDuration(offer, filters.maxDurationMinutes)
  ) {
    return false;
  }
  if (
    filters.departureAirportCodes.length > 0 &&
    !filters.departureAirportCodes.includes(departureAirportCodeForOffer(offer))
  ) {
    return false;
  }
  if (
    filters.arrivalAirportCodes.length > 0 &&
    !filters.arrivalAirportCodes.includes(arrivalAirportCodeForOffer(offer))
  ) {
    return false;
  }
  return true;
}

/**
 * Filtering only ever removes non-matching offers — it never reorders,
 * mutates, regenerates or drops fields from the ones that remain. Sorting is
 * a separate, later step (see `flight-offer-ranking.ts`).
 */
export function applyFilters(
  offers: readonly FlightOffer[],
  filters: FlightFilterState,
): readonly FlightOffer[] {
  return offers.filter((offer) => offerMatchesFilters(offer, filters));
}
