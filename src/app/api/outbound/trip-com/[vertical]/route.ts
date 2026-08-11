import "../../../../../server/server-only";

import {
  buildTripComCategoryRedirect,
  recordTripComAffiliateClick,
  type TripComVertical,
} from "../../../../../server/affiliate/trip-com/trip-com-affiliate";

export const dynamic = "force-dynamic";
const VERTICALS = new Set<TripComVertical>([
  "hotel",
  "train",
  "attraction",
  "package",
  "car",
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

export async function GET(
  request: Request,
  context: { params: Promise<{ vertical: string }> },
): Promise<Response> {
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].length > 0)
    return safeResponse("dynamicSearchNotSupported", 400);
  const { vertical: candidate } = await context.params;
  if (!VERTICALS.has(candidate as TripComVertical))
    return safeResponse("invalidVertical", 404);
  const vertical = candidate as TripComVertical;
  const redirect = buildTripComCategoryRedirect(vertical);
  if (!redirect) return safeResponse("affiliateUnavailable", 503);
  recordTripComAffiliateClick({
    clickId: redirect.clickId,
    providerId: "trip-com-affiliate",
    createdAt: new Date().toISOString(),
    result: "redirected",
    vertical,
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
