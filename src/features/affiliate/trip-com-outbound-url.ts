import type { FlightSearchIntent } from "@/features/flights/search-intent-types";

/** Builds only a same-origin GTAI endpoint URL; tracking configuration stays server-side. */
export function buildTripComOutboundUrl(intent: FlightSearchIntent): string | null {
  if (
    intent.tripType !== "roundTrip" ||
    !intent.returnDate ||
    intent.cabinClass !== "economy" ||
    intent.travelers.adults !== 1 ||
    intent.travelers.children !== 0 ||
    intent.travelers.infantsInSeat !== 0 ||
    intent.travelers.infantsOnLap !== 0
  ) {
    return null;
  }
  const origin = intent.origin.iataCode ?? intent.origin.cityCode;
  const destination = intent.destination.iataCode ?? intent.destination.cityCode;
  if (!origin || !destination) return null;
  const query = new URLSearchParams({
    origin,
    destination,
    departure: intent.departureDate,
    trip: intent.tripType,
    cabin: intent.cabinClass,
    adults: String(intent.travelers.adults),
    children: String(intent.travelers.children),
    locale: intent.locale,
    currency: intent.currency,
  });
  if (intent.returnDate) query.set("return", intent.returnDate);
  return `/api/outbound/trip-com/flight?${query.toString()}`;
}
