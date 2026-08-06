import "../server-only";

import {
  FLIGHT_SEARCH_API_VERSION,
  RESPONSE_MODE,
  LIVE_PREVIEW_RESPONSE_MODE,
  type ClientFlightSearchErrorCode,
  type ClientProviderSummary,
  type FlightSearchApiResponse,
} from "../../features/flights/flight-search-api-contract";
import { durationBand } from "./providers/provider-audit";
import type { OrchestratedSearchResult } from "./providers/provider-runtime-types";

/**
 * Projects the rich internal orchestration result onto the narrow envelope
 * the browser is allowed to see.
 *
 * This is the single point where the two vocabularies meet, and it is
 * deliberately lossy in one direction only. The internal result knows *why*
 * each provider failed — a timeout, a rate limit, a credential problem, a
 * response this boundary refused; the envelope keeps only that coverage was
 * reduced. An operator can reconstruct the detail from the audit stream
 * correlated by `searchContextId`; a visitor, and anyone watching their
 * network tab, cannot.
 *
 * `searchContextId` is not passed through. There is no support workflow in
 * V2.7 that needs it client-side, and a correlation id in the browser is a
 * tracking surface that has to be justified rather than defaulted to.
 */

function toProviderSummary(
  result: OrchestratedSearchResult,
): readonly ClientProviderSummary[] {
  return result.outcomes.map((outcome) => ({
    providerId: outcome.providerId,
    status: outcome.status,
    offerCount: outcome.offers.length,
    durationBucket: durationBand(outcome.durationMs),
  }));
}

export function buildSuccessResponse(
  result: OrchestratedSearchResult,
): FlightSearchApiResponse {
  // `failed` never reaches here — the route maps it to a 503 error envelope
  // instead, because presenting a total provider failure as an empty result
  // would tell the visitor there are no flights when in fact nobody looked.
  const status: "success" | "partial" | "empty" =
    result.status === "partial"
      ? "partial"
      : result.offers.length === 0
        ? "empty"
        : "success";

  return {
    version: FLIGHT_SEARCH_API_VERSION,
    status,
    mode: result.offers.some((offer) => !offer.isDemonstration)
      ? LIVE_PREVIEW_RESPONSE_MODE
      : RESPONSE_MODE,
    offers: result.offers,
    providerSummary: toProviderSummary(result),
  };
}

export function buildErrorResponse(
  errorCode: ClientFlightSearchErrorCode,
): FlightSearchApiResponse {
  return {
    version: FLIGHT_SEARCH_API_VERSION,
    status: "error",
    mode: RESPONSE_MODE,
    errorCode,
  };
}

/**
 * The response headers every reply carries.
 *
 * `no-store` because a search result is per-visitor and must not sit in a
 * shared or browser cache. No CORS headers at all: this is a same-origin
 * internal API, and adding a permissive `Access-Control-Allow-Origin` would
 * hand any site the ability to run searches through this deployment.
 * `X-Content-Type-Options` stops a browser from re-interpreting the JSON.
 */
export const RESPONSE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
