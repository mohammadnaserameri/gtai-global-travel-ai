import "../../../../server-only";

import { mapExternalOffers } from "../external-provider-offer-mapping";
import { CONTRACT_FIXTURE_PROVIDER_ID } from "./fixture-identity";
import {
  buildExternalRequest,
  buildNeutralQuery,
} from "../external-provider-request-contract";
import { DEFAULT_RETRYABLE_FAILURES } from "../external-provider-retry";
import { inactiveExternalProviderTransport } from "../external-provider-transport";
import type {
  ExternalFlightProvider,
  ExternalFlightProviderDefinition,
  ExternalProviderCapabilities,
} from "../external-provider-types";

/**
 * A deterministic contract fixture. **Not a provider.**
 *
 * This exists so the V2.8-B contracts can be exercised end to end — request
 * construction, capability checking, response mapping, failure normalization —
 * without a network, a credential, or a real company's API. It plays the same
 * role the fixture adapters play in `verify:providers`: constructed by
 * verification, never registered in a runtime registry.
 *
 * Four things about it are deliberate:
 *
 * 1. **It is not named after any travel company.** A fixture named for a real
 *    provider becomes, over a few commits, a half-written client for that
 *    provider — and then somebody wires it up. `external-contract-fixture` can
 *    never be mistaken for an integration.
 * 2. **Its origin is `.invalid`.** RFC 2606 reserves that TLD as permanently
 *    unresolvable, so even a mistaken call against this definition cannot reach
 *    a host: the DNS lookup is guaranteed to fail. A placeholder on a real TLD
 *    is one typo-squat away from sending a request somewhere.
 * 3. **Every capability is `false` or empty.** The fixture is `unavailable`,
 *    and this stage's rule is that an inactive provider claims nothing. It also
 *    makes the fixture useless as a shortcut: any search checked against it is
 *    refused, so nobody can quietly promote it without writing real
 *    capabilities first.
 * 4. **Its transport is the inactive one.** Not "no transport" — the transport
 *    that performs zero network calls and returns a typed `notConfigured`
 *    failure. A future integration has to *replace* it, which is a visible act,
 *    rather than merely add the first one.
 */

/** RFC 2606 reserved TLD. Guaranteed never to resolve. */
export const CONTRACT_FIXTURE_ORIGIN = "https://external-contract-fixture.invalid";

export { CONTRACT_FIXTURE_PROVIDER_ID } from "./fixture-identity";

/**
 * No capability is claimed.
 *
 * This is not laziness — it is the honest declaration for a provider that is
 * not connected. Claiming `supportsRoundTrip: true` for a provider nobody has
 * ever called would be a statement about behaviour that has never been
 * observed, and `checkCapabilitySupport` would then pass a search through to a
 * provider that cannot answer it.
 */
const inertCapabilities: ExternalProviderCapabilities = Object.freeze({
  supportsOneWay: false,
  supportsRoundTrip: false,
  supportsMultiCity: false,
  supportsDirectOnly: false,
  supportsCabinClass: false,
  supportsAdults: false,
  supportsChildren: false,
  supportsInfants: false,
  supportedMarkets: Object.freeze([]) as readonly string[],
  supportedLocales: Object.freeze([]) as readonly string[],
  supportedCurrencies: Object.freeze([]) as readonly string[],
  maximumLegCount: 0,
  maximumTravellerCount: 0,
  supportsBookingLinks: false,
  supportsPartialResults: false,
});

/**
 * The fixture's definition.
 *
 * The secret reference names an environment variable that is deliberately not
 * documented in `.env.example` and is expected never to be set. Its presence
 * lets verification prove that a complete-looking declaration still resolves to
 * `unavailable` without an operator directive.
 */
export const contractFixtureDefinition: ExternalFlightProviderDefinition =
  Object.freeze({
    providerId: CONTRACT_FIXTURE_PROVIDER_ID,
    label: "GTAI external provider contract fixture (never runnable)",
    sourceAttribution: "Contract fixture — not a data source",
    capabilities: inertCapabilities,
    timeoutPolicy: Object.freeze({
      connectTimeoutMs: 2_000,
      requestTimeoutMs: 8_000,
      totalDeadlineMs: 20_000,
    }),
    retryPolicy: Object.freeze({
      maximumAttempts: 3,
      initialBackoffMs: 200,
      backoffMultiplier: 2,
      maximumBackoffMs: 2_000,
      jitterRatio: 0.2,
      retryableFailures: DEFAULT_RETRYABLE_FAILURES,
    }),
    rateLimit: Object.freeze({
      requestsPerSecond: 8,
      burst: 2,
      concurrentRequests: 4,
      queueLimit: 2,
      maximumWaitMs: 500,
      honoursRetryAfter: true,
    }),
    secretReferences: Object.freeze([
      Object.freeze({
        secretId: "contract-fixture-key",
        environmentVariable: "GTAI_CONTRACT_FIXTURE_KEY",
        placement: "header" as const,
        parameterName: "X-Contract-Fixture-Key",
        required: true,
      }),
    ]),
    allowedOrigin: CONTRACT_FIXTURE_ORIGIN,
  });

/**
 * A complete `ExternalFlightProvider` over the fixture.
 *
 * `buildRequest` describes a request that is never sent; `mapResponse`
 * interprets a response handed to it by verification; `transport` is the
 * inactive one, so even a caller that wired the whole pipeline together would
 * get a typed `notConfigured` failure rather than a network call.
 */
export const contractFixtureProvider: ExternalFlightProvider = {
  definition: contractFixtureDefinition,
  transport: inactiveExternalProviderTransport,

  buildRequest(search) {
    return buildExternalRequest({
      definition: contractFixtureDefinition,
      path: "/v1/search",
      method: "GET",
      query: buildNeutralQuery(search),
      headers: { accept: "application/json" },
      // No secret binding: nothing is resolved, so nothing is placed. A request
      // built here carries no credential because there is none to carry.
      secrets: [],
    });
  },

  mapResponse(response, search, context) {
    const body = response.body;
    const data =
      typeof body === "object" && body !== null && !Array.isArray(body)
        ? (body as Record<string, unknown>).data
        : undefined;
    const envelope =
      typeof data === "object" && data !== null && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    const rawOffers = Array.isArray(envelope.offers) ? envelope.offers : [];

    return mapExternalOffers({
      candidates: rawOffers,
      providerId: contractFixtureDefinition.providerId,
      sourceAttribution: contractFixtureDefinition.sourceAttribution,
      tripShape: search.tripShape,
      providerDeclaredPartial: envelope.hasMore === true,
      maximumOffers: 50,
      requestId: context.searchContextId,
      occurredAt: response.receivedAt,
    });
  },
};
