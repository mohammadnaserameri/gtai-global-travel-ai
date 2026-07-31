import { DEMO_LOCATIONS } from "../../locations/demo-location-data";
import { localizedName } from "../../locations/location-presentation";
import type { FlightItinerary } from "../flight-offer-types";
import type { ItineraryTimelineEntry } from "./flight-details-types";

/**
 * Presentation helpers unique to the Details page. Everything that already
 * exists — duration, stop count, local date, signed day offset, price,
 * aircraft label — is reused from `flight-offer-formatting` rather than
 * reimplemented here.
 */

const AIRPORTS_BY_CODE = new Map(
  DEMO_LOCATIONS.filter(
    (location): location is typeof location & { iataCode: string } =>
      location.entityType === "AIRPORT" && location.iataCode !== null,
  ).map((location) => [location.iataCode, location] as const),
);

/**
 * The localized airport name for an IATA code, falling back to the code
 * itself when the demonstration directory has no entry — the fallback is
 * deliberately the bare code rather than an invented name, and callers
 * still render it inside `<bdi dir="auto">` so an English fallback inside a
 * Persian or Arabic page stays correctly isolated.
 */
export function airportName(code: string, locale: string): string {
  const location = AIRPORTS_BY_CODE.get(code);
  return location ? localizedName(location, locale) : code;
}

/**
 * Interleaves an itinerary's segments and layovers into one chronological
 * list: segment 0, layover 0, segment 1, layover 1, … Rendered as a single
 * ordered list so assistive tech reads the journey in the order it happens,
 * with connections in their real position between flights rather than
 * collected in a separate block.
 */
export function buildItineraryTimeline(
  itinerary: FlightItinerary,
): readonly ItineraryTimelineEntry[] {
  const entries: ItineraryTimelineEntry[] = [];
  itinerary.segments.forEach((_segment, index) => {
    entries.push({ kind: "segment", index });
    if (index < itinerary.layovers.length) {
      entries.push({ kind: "layover", index });
    }
  });
  return entries;
}

/**
 * Whether every segment in an itinerary runs forward in real time, using
 * the stored UTC epoch minutes rather than comparing wall-clock strings
 * across different airport time zones. Used by the deterministic
 * verification script as an invariant check.
 */
export function isItineraryChronological(itinerary: FlightItinerary): boolean {
  let previousArrival: number | null = null;
  for (const segment of itinerary.segments) {
    if (segment.arrival.epochMinutes < segment.departure.epochMinutes) {
      return false;
    }
    if (
      previousArrival !== null &&
      segment.departure.epochMinutes < previousArrival
    ) {
      return false;
    }
    previousArrival = segment.arrival.epochMinutes;
  }
  return true;
}
