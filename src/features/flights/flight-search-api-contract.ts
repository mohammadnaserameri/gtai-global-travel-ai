import type { FlightOffer } from "./flight-offer-types";
import type { FlightSearchIntent } from "./search-intent-types";
import { SEARCH_PARAM, serializeSearchIntent } from "./search-intent-url";
import {
  isDevelopmentScenario,
  type DevelopmentScenario,
} from "./flight-offer-repository";

/**
 * The wire contract for the internal GTAI flight-search API.
 *
 * This module is deliberately **client-safe**: it holds types, small
 * constants and pure validators that both sides of the boundary need, and it
 * imports nothing from `src/server`. That separation is the point — the
 * browser has to be able to describe and check the envelope without being
 * able to reach, or bundle, the provider runtime that fills it.
 *
 * Two rules shape everything below:
 *
 * 1. **The request is a structured intent, not a URL.** The canonical Results
 *    query string is never the payload. The client sends the already-validated
 *    Search Intent as named fields, and the server re-validates them from
 *    scratch through the same shared validator — the client's validation is
 *    never treated as proof of anything.
 * 2. **The response is a narrow, GTAI-owned envelope.** No provider payload,
 *    provider URL, provider error text, credential or `searchContextId`
 *    crosses it. Customer-facing wording lives in the locale dictionaries;
 *    the wire carries stable machine-readable codes only.
 */

export const FLIGHT_SEARCH_API_VERSION = 1;

/** Same-origin, relative. No external host may ever appear in client source. */
export const FLIGHT_SEARCH_API_PATH = "/api/flights/search";

/**
 * A hard ceiling on an accepted request body, applied before parsing. The
 * real contract is a few hundred bytes; this only exists so a hostile or
 * broken caller cannot make the route read an unbounded stream.
 */
export const MAX_REQUEST_BODY_BYTES = 8 * 1024;

/**
 * The ceiling on the **final aggregated** `offers` array returned to the
 * browser, after cross-provider deduplication and truncation.
 *
 * This is a presentation bound: it is what a visitor can usefully be shown,
 * and it applies to the response array alone.
 */
export const MAX_RESPONSE_OFFERS = 60;

/**
 * The ceiling on what **one provider** may validly contribute, before
 * aggregation.
 *
 * A different quantity from `MAX_RESPONSE_OFFERS`, and conflating them was a
 * real defect: the client validated each `ClientProviderSummary.offerCount`
 * against the *final* ceiling, so a provider that legitimately returned 100
 * validated offers — of which aggregation kept 60 — had its truthful summary
 * rejected as malformed. The response was correct; the check was wrong.
 *
 * The fix is not to cap the reported count at 60. A summary must keep
 * reporting the provider's actual validated contribution *before*
 * deduplication and truncation, because that number is the only thing that
 * makes `offers.length <= successfulContribution` a meaningful statement about
 * where the offers came from. Falsifying it downward would make the invariant
 * trivially true and tell an operator nothing.
 *
 * The trusted provider registry validates `maximumOfferCount` against this
 * same constant, so the registry and the client agree on one bound rather than
 * each keeping a private literal.
 */
export const MAX_PROVIDER_OFFER_COUNT = 200;

/** Retry is a small counter, not an unbounded client-supplied number. */
export const MAX_RETRY_TOKEN = 1000;

/**
 * The Search Intent as it crosses the wire: exactly the canonical URL
 * parameter names from `SEARCH_PARAM`, carrying exactly the values
 * `serializeSearchIntent` would write.
 *
 * Reusing that vocabulary is intentional. It means there is one description
 * of what a search *is* in the whole system, and the server can hand the
 * fields straight to the existing strict validator rather than growing a
 * second, subtly different parser. It is emphatically not "the URL as the
 * payload": there is no query string, no view state, no `returnTo`, no
 * offer id and no locale routing here — only named, individually validated
 * intent fields.
 */
export type WireSearchIntent = Readonly<Record<string, string>>;

export interface FlightSearchApiRequest {
  readonly version: number;
  readonly searchIntent: WireSearchIntent;
  /**
   * The locale the search was issued under. It sits at the top level rather
   * than inside `searchIntent` because it is not part of the shareable URL
   * parameter contract — it comes from the route segment (`/fr/…`), and a
   * Results link means the same search in every locale. The server needs it
   * because `FlightSearchIntent` carries it, but nothing in offer generation
   * is seeded from it: the same search yields the same offer ids in all four
   * locales, which is what lets a Details deep link survive a locale switch.
   */
  readonly locale: string;
  readonly retryToken: number;
  readonly scenario: DevelopmentScenario;
}

/** Every top-level property the route will accept. Anything else is rejected outright. */
export const ALLOWED_REQUEST_KEYS: readonly string[] = [
  "version",
  "searchIntent",
  "locale",
  "retryToken",
  "scenario",
];

/** Every field name permitted inside `searchIntent`. */
export const ALLOWED_INTENT_KEYS: readonly string[] = Object.values(SEARCH_PARAM);

/**
 * Builds the request body from an already-normalized intent.
 *
 * The intent is re-serialized through the canonical serializer rather than
 * copied out of the address bar, so nothing the visitor's URL happens to
 * carry — a stale filter, a dev flag, a hand-added parameter — can ride along.
 */
export function buildFlightSearchApiRequest(
  intent: FlightSearchIntent,
  options: { readonly retryToken: number; readonly scenario: DevelopmentScenario },
): FlightSearchApiRequest {
  const searchIntent: Record<string, string> = {};
  for (const [key, value] of serializeSearchIntent(intent)) {
    searchIntent[key] = value;
  }
  return {
    version: FLIGHT_SEARCH_API_VERSION,
    searchIntent,
    locale: intent.locale,
    retryToken: options.retryToken,
    scenario: options.scenario,
  };
}

/**
 * Stable, machine-readable failure codes.
 *
 * These are the only failure vocabulary the browser ever sees. They are
 * deliberately coarse: the server's richer internal taxonomy (which
 * distinguishes authentication from configuration from a malformed provider
 * response) is operator-facing, and collapsing it here is what stops an
 * operational detail from becoming a customer-visible one.
 */
export const CLIENT_ERROR_CODES = [
  "invalidRequest",
  "unsupportedVersion",
  "searchUnavailable",
  "providerUnavailable",
] as const;

export type ClientFlightSearchErrorCode = (typeof CLIENT_ERROR_CODES)[number];

export function isClientErrorCode(
  value: unknown,
): value is ClientFlightSearchErrorCode {
  return (
    typeof value === "string" &&
    (CLIENT_ERROR_CODES as readonly string[]).includes(value)
  );
}

/**
 * What a provider contributed, at the coarsest useful resolution.
 *
 * `cancelled` is listed separately from `failed` for the same reason the
 * audit vocabulary separates them: a provider that was called off is not a
 * provider that broke. In practice a fully cancelled request never delivers a
 * body at all, so this value is rarely observed — but representing it is free,
 * and collapsing it into `failed` would be a small untruth baked into the type.
 */
export const CLIENT_PROVIDER_STATUSES = [
  "succeeded",
  "empty",
  "failed",
  "cancelled",
] as const;

export type ClientProviderStatus = (typeof CLIENT_PROVIDER_STATUSES)[number];

/**
 * The per-provider summary the browser is allowed to see.
 *
 * `durationBucket` is a coarse band rather than a measured latency: an exact
 * millisecond figure is a side channel about server behaviour, and nothing in
 * the interface needs that precision. There is no raw payload, no error text,
 * no URL, no credential and no `searchContextId` here — by construction, not
 * by convention, because those fields do not exist on this type.
 */
export interface ClientProviderSummary {
  readonly providerId: string;
  readonly status: ClientProviderStatus;
  readonly offerCount: number;
  readonly durationBucket: "fast" | "moderate" | "slow";
}

/**
 * `mode` is a standing, machine-checkable assertion that nothing on this wire
 * is live inventory. It is not decoration: the client repository rejects a
 * response that claims anything else, so a future real-provider build cannot
 * quietly reuse the demonstration client.
 */
export const RESPONSE_MODE = "demonstration";
export const LIVE_PREVIEW_RESPONSE_MODE = "livePreview";
export type FlightSearchResponseMode =
  typeof RESPONSE_MODE | typeof LIVE_PREVIEW_RESPONSE_MODE;

export type FlightSearchApiResponse =
  | {
      readonly version: 1;
      readonly status: "success" | "partial" | "empty";
      readonly mode: FlightSearchResponseMode;
      readonly offers: readonly FlightOffer[];
      readonly providerSummary: readonly ClientProviderSummary[];
    }
  | {
      readonly version: 1;
      readonly status: "error";
      readonly mode: typeof RESPONSE_MODE;
      readonly errorCode: ClientFlightSearchErrorCode;
    };

/**
 * Property names that must never appear anywhere in a response, at any depth.
 *
 * This is a belt-and-braces check on top of structural validation: structural
 * validation proves the fields we expect are well-formed, and this proves no
 * field we never want has been added. A redirect target, affiliate parameter
 * or correlation id smuggled into an offer would satisfy the former and fail
 * the latter.
 */
export const FORBIDDEN_RESPONSE_KEYS: readonly string[] = [
  "url",
  "href",
  "link",
  "redirect",
  "redirectUrl",
  "bookingUrl",
  "deeplink",
  "deepLink",
  "affiliateUrl",
  "trackingUrl",
  "clickId",
  "commission",
  "searchContextId",
  "apiKey",
  "token",
  "secret",
  "credentials",
  "rawPayload",
  "payload",
  "stack",
];

/**
 * Walks an already-parsed JSON value looking for any forbidden property name.
 *
 * Depth-limited rather than unbounded: a cyclic or pathologically nested
 * structure should fail the check, not hang it.
 */
export function containsForbiddenKey(value: unknown, depth = 0): boolean {
  if (depth > 12) return true;
  if (Array.isArray(value)) {
    return value.some((item) => containsForbiddenKey(item, depth + 1));
  }
  if (value === null || typeof value !== "object") return false;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_RESPONSE_KEYS.includes(key)) return true;
    if (containsForbiddenKey(nested, depth + 1)) return true;
  }
  return false;
}

export function isValidRetryToken(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_RETRY_TOKEN
  );
}

export { isDevelopmentScenario };
export type { DevelopmentScenario };
