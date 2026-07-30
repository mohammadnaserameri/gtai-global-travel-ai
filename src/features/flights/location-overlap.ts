import type { TravelLocation } from "../locations/location-types";

/**
 * True when using `origin` and `destination` as a flight search's two ends
 * would produce a same-airport itinerary — not just when the two entity ids
 * are literally equal.
 *
 * Four cases overlap:
 * 1. The ids are equal.
 * 2. Both are airports sharing one IATA code (defensive — ids already encode
 *    the code, so this only guards against a future non-1:1 dataset change).
 * 3. One is an airport that is a member of the other's City-all-airports set.
 * 4. Both are City-all-airports entities whose member airports intersect.
 *
 * A single shared policy function means the form, the strict URL validator,
 * `buildSearchIntent` and the verification script can never drift into
 * checking different rules.
 */
export function locationsOverlapForFlightSearch(
  origin: TravelLocation,
  destination: TravelLocation,
): boolean {
  if (origin.id === destination.id) return true;

  const originIsAirport = origin.entityType === "AIRPORT";
  const destinationIsAirport = destination.entityType === "AIRPORT";

  if (originIsAirport && destinationIsAirport) {
    return origin.iataCode !== null && origin.iataCode === destination.iataCode;
  }

  if (originIsAirport && destination.entityType === "CITY_ALL_AIRPORTS") {
    return (
      origin.iataCode !== null && destination.airportCodes.includes(origin.iataCode)
    );
  }

  if (destinationIsAirport && origin.entityType === "CITY_ALL_AIRPORTS") {
    return (
      destination.iataCode !== null &&
      origin.airportCodes.includes(destination.iataCode)
    );
  }

  if (
    origin.entityType === "CITY_ALL_AIRPORTS" &&
    destination.entityType === "CITY_ALL_AIRPORTS"
  ) {
    return origin.airportCodes.some((code) =>
      destination.airportCodes.includes(code),
    );
  }

  return false;
}
