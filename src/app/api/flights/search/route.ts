import "@/server/server-only";

import { MAX_REQUEST_BODY_BYTES } from "@/features/flights/flight-search-api-contract";
import type { ClientFlightSearchErrorCode } from "@/features/flights/flight-search-api-contract";
import { validateFlightSearchRequestBody } from "@/server/flights/flight-search-request-validation";
import type { RequestRejectionReason } from "@/server/flights/flight-search-request-validation";
import {
  isJsonContentType,
  readBoundedRequestBody,
} from "@/server/flights/request-body-reader";
import {
  buildErrorResponse,
  buildSuccessResponse,
  RESPONSE_HEADERS,
} from "@/server/flights/flight-search-response";
import { orchestrateProviderSearch } from "@/server/flights/providers/provider-search-orchestrator";
import { runtimeProviderRegistry } from "@/server/flights/providers/provider-registry";

/**
 * The internal GTAI flight-search endpoint.
 *
 * This is the server boundary V2.7 exists to establish. Everything above it —
 * the provider registry, the adapters, the orchestrator, the audit sink —
 * runs only here; everything below it receives a narrow, versioned envelope
 * with no provider payload, provider URL, provider error text or correlation
 * id in it.
 *
 * It is a same-origin internal API, not a public one: there are no CORS
 * headers, no API key, no authentication of its own, and nothing in a request
 * can select a provider, set a timeout or influence where a search goes.
 */

/** Offers are generated per request; nothing here may be prerendered or cached. */
export const dynamic = "force-dynamic";

/** How a rejected request maps onto the two codes the client vocabulary has for it. */
function errorCodeFor(reason: RequestRejectionReason): ClientFlightSearchErrorCode {
  return reason === "unsupportedVersion" ? "unsupportedVersion" : "invalidRequest";
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: RESPONSE_HEADERS,
  });
}

export async function POST(request: Request): Promise<Response> {
  // Content type first, before reading a single byte of the body: a caller
  // that did not declare JSON does not get to have its payload parsed. The
  // check is an exact media-type match, so `application/jsonp` and
  // `text/application/json` are refused while `charset` parameters are not.
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return json(buildErrorResponse("invalidRequest"), 415);
  }

  // Read the body as a stream under a byte ceiling, consuming it exactly
  // once. Counting decoded string length would under-measure multibyte text
  // by roughly half, and reading first and checking afterwards would already
  // have accepted whatever arrived.
  const bodyRead = await readBoundedRequestBody(request, MAX_REQUEST_BODY_BYTES);
  if (!bodyRead.ok) {
    return json(buildErrorResponse("invalidRequest"), 400);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyRead.text);
  } catch {
    // The parse error is discarded rather than forwarded: its message quotes
    // the offending input, which would make this endpoint reflect payloads.
    return json(buildErrorResponse("invalidRequest"), 400);
  }

  // The environment policy is decided here, once, and passed down explicitly.
  // The client already sends `"normal"` in production, but client-side gating
  // is a convenience rather than a boundary — anyone can post to this route,
  // so the refusal has to live on this side of it.
  const validation = validateFlightSearchRequestBody(parsed, {
    allowDevelopmentScenarios: process.env.NODE_ENV !== "production",
  });
  if (!validation.ok) {
    return json(buildErrorResponse(errorCodeFor(validation.reason)), 400);
  }

  // The client's abort — a visitor navigating away mid-search — propagates
  // all the way to each adapter, so no provider keeps working for a page
  // nobody is looking at.
  const result = await orchestrateProviderSearch(
    {
      intent: validation.intent,
      signal: request.signal,
      scenario: validation.scenario,
    },
    { registry: runtimeProviderRegistry },
  );

  if (result.status === "failed") {
    // Every provider failed. That is not an empty result set, and saying so
    // would tell the visitor there are no flights when nobody managed to
    // look. 503 with a safe code; the reasons stay in the audit stream.
    return json(buildErrorResponse("providerUnavailable"), 503);
  }

  return json(buildSuccessResponse(result), 200);
}
