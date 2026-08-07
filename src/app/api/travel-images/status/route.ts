import "../../../../server/server-only";

import { verifyTravelImageRuntime } from "../../../../server/travel-images/travel-image-preview-status";

export const dynamic = "force-dynamic";

const SAFE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function GET(): Promise<Response> {
  try {
    const status = await verifyTravelImageRuntime();
    return new Response(JSON.stringify(status), {
      status: 200,
      headers: SAFE_HEADERS,
    });
  } catch {
    return new Response(
      JSON.stringify({
        imageEngineMode: "fallback",
        providerCallAttempted: false,
        providerCallSucceeded: false,
        normalizedAssetCount: 0,
        attributionPresent: false,
        fallbackActive: true,
        cacheMode: "durableUnavailable",
        providerScope: "none",
        safeReasonCode: "providerUnavailable",
      }),
      { status: 200, headers: SAFE_HEADERS },
    );
  }
}
