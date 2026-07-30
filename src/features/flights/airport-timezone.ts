import { DEMO_LOCATIONS } from "../locations/demo-location-data";

/**
 * IATA code → IANA time zone, built once from the normalized GTAI location
 * directory. Every airport entity already carries its city's IANA zone
 * (`location.timeZone`), so this is a lookup, never a second source of truth.
 */
const AIRPORT_TIME_ZONES: ReadonlyMap<string, string> = new Map(
  DEMO_LOCATIONS.filter(
    (
      location,
    ): location is typeof location & { iataCode: string; timeZone: string } =>
      location.entityType === "AIRPORT" &&
      location.iataCode !== null &&
      location.timeZone !== null,
  ).map((location) => [location.iataCode, location.timeZone]),
);

/** The IANA time zone for a GTAI airport code, or `null` if unrecognized. */
export function resolveAirportTimeZone(iataCode: string): string | null {
  return AIRPORT_TIME_ZONES.get(iataCode) ?? null;
}
