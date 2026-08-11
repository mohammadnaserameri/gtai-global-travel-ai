import "../../../../../server/server-only";

import {
  createViatorProductReference,
  getViatorAvailabilitySchedule,
  getViatorProductDetails,
} from "@/server/affiliate/viator/viator-adapter";
import { ViatorProviderError } from "@/server/affiliate/viator/viator-client";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ productCode: string }> },
): Promise<Response> {
  const { productCode } = await context.params;
  const locale = new URL(request.url).searchParams.get("locale") ?? "en";
  try {
    const details = await getViatorProductDetails(productCode, locale);
    const availability = await getViatorAvailabilitySchedule(productCode, locale);
    return Response.json(
      {
        ok: true,
        provider: "viator-affiliate",
        environment: "sandbox",
        details,
        availability,
        redirectRef: createViatorProductReference(productCode),
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    const code =
      error instanceof ViatorProviderError ? error.code : "providerUnavailable";
    return Response.json(
      { ok: false, code },
      {
        status: code === "providerInactive" ? 503 : 502,
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  }
}
