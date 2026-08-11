import "../../../../../server/server-only";

import {
  buildTripComFlightRedirect,
  recordTripComAffiliateClick,
} from "../../../../../server/affiliate/trip-com/trip-com-affiliate";

export const dynamic = "force-dynamic";

const ALLOWED_QUERY_KEYS = new Set([
  "origin",
  "destination",
  "departure",
  "return",
  "trip",
  "cabin",
  "adults",
  "children",
  "locale",
  "currency",
]);

function safeResponse(code: string, status: number): Response {
  return Response.json(
    { ok: false, code },
    {
      status,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function integer(value: string | null): number {
  return value !== null && /^\d$/.test(value) ? Number(value) : -1;
}

export function GET(request: Request): Response {
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some((key) => !ALLOWED_QUERY_KEYS.has(key))) {
    return safeResponse("invalidRequest", 400);
  }
  const trip = url.searchParams.get("trip");
  const cabin = url.searchParams.get("cabin");
  const origin = url.searchParams.get("origin") ?? "";
  const destination = url.searchParams.get("destination") ?? "";
  if (
    (trip !== "oneWay" && trip !== "roundTrip") ||
    !["economy", "premiumEconomy", "business", "first"].includes(cabin ?? "")
  ) {
    return safeResponse("invalidRequest", 400);
  }
  const redirect = buildTripComFlightRedirect({
    origin,
    destination,
    departureDate: url.searchParams.get("departure") ?? "",
    returnDate: url.searchParams.get("return"),
    tripType: trip,
    cabinClass: cabin as "economy" | "premiumEconomy" | "business" | "first",
    adults: integer(url.searchParams.get("adults")),
    children: integer(url.searchParams.get("children")),
    locale: url.searchParams.get("locale") ?? "",
    currency: url.searchParams.get("currency") ?? "",
  });
  if (!redirect) return safeResponse("affiliateUnavailable", 503);

  recordTripComAffiliateClick({
    clickId: redirect.clickId,
    providerId: "trip-com-affiliate",
    origin,
    destination,
    departureDate: url.searchParams.get("departure") ?? "",
    returnDate: url.searchParams.get("return"),
    locale: url.searchParams.get("locale") ?? "",
    currency: url.searchParams.get("currency") ?? "",
    createdAt: new Date().toISOString(),
    result: "redirected",
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: redirect.destination.toString(),
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
