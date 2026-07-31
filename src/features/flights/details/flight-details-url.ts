import type { FlightOffer } from "../flight-offer-types";
import { localePath } from "../../../i18n/routing";
import {
  buildResultsSearchParams,
  parseResultsViewState,
  serializationBoundsForOffers,
} from "../filters/flight-filter-url";
import type { ResultsViewState } from "../filters/flight-filter-types";

/**
 * The Flight Details URL contract.
 *
 * A Details URL is exactly a Results URL plus one path segment — the offer
 * id. It deliberately introduces **no new query parameters at all**: no
 * `returnTo`, no serialized intent, no provider reference, nothing that
 * could carry a redirect target or personal data. That is what makes "Back
 * to results" safe to reconstruct rather than trust: the return URL is
 * rebuilt from the same validated Search Intent and sanitized view-state
 * that produced the Details URL, so there is never an attacker-supplied
 * destination to follow.
 */

/**
 * The deterministic demonstration-offer id shape produced by
 * `DemoFlightOfferRepository`: the literal prefix `demo-`, an unsigned
 * base-36 hash, and a numeric offer index (e.g. `demo-1a2b3c4-0`).
 *
 * Anchored at both ends, so a value containing a slash, a dot-segment, an
 * encoded separator (`%2F`, `%2E`), whitespace, or any other character
 * simply fails to match — there is no "sanitize and continue" path here.
 */
const OFFER_ID_PATTERN = /^demo-[0-9a-z]{1,12}-\d{1,4}$/;

/** Generous relative to the real format (max ~22 chars) but a hard stop against pathological input. */
const OFFER_ID_MAX_LENGTH = 64;

/**
 * Whether a raw path segment is a syntactically valid demonstration offer id.
 *
 * Pure and repository-free by design: an invalid id must be rejected
 * *before* any offer generation happens, so a malformed link can never
 * become a reason to do work. Next.js having already percent-decoded the
 * segment is explicitly not treated as evidence that it is safe — a decoded
 * `../` is still `../`, and it still fails this test.
 */
export function isValidOfferId(rawOfferId: string | undefined | null): boolean {
  if (typeof rawOfferId !== "string") return false;
  if (rawOfferId.length === 0 || rawOfferId.length > OFFER_ID_MAX_LENGTH) {
    return false;
  }
  return OFFER_ID_PATTERN.test(rawOfferId);
}

/**
 * The Results query string for a given view-state — the single shared builder
 * both Results and Details use, so the two can never drift into two
 * incompatible parsers. Search Intent parameters are copied through verbatim
 * (never re-derived), defaults stay omitted, and CSV ordering stays canonical.
 *
 * The numeric filters have two distinct modes, decided entirely by whether an
 * offer set was supplied:
 *
 * - **Offer-aware canonical serialization** (offers present). The shared
 *   `serializationBoundsForOffers` supplies the real observed maxima, so a
 *   `maxPrice`/`maxDuration` at or above the ceiling is dropped as
 *   "unrestricted". Duration is per itinerary/direction — never the combined
 *   round-trip total, which is roughly twice as large and would let a stale
 *   value survive here while Results correctly dropped it.
 * - **Format-level serialization** (no offers). Every Details state that
 *   cannot fetch — invalid offer id, repository error, empty result, and any
 *   pre-fetch render — still has a format-valid numeric filter parsed from the
 *   URL and nothing to assess it against. The value is preserved verbatim so
 *   "Back to results" carries the visitor's whole view state, and Results
 *   performs the offer-aware sanitization once its own set resolves. This is
 *   explicitly **not** sanitized and **not** offer-aware; it is merely parsed.
 */
function canonicalResultsQuery(
  currentParams: URLSearchParams,
  viewState: ResultsViewState,
  offers: readonly FlightOffer[],
): string {
  return buildResultsSearchParams(
    currentParams,
    viewState,
    serializationBoundsForOffers(offers),
  ).toString();
}

/**
 * The Details URL for one offer, preserving the Results context it was
 * opened from. The offer id is validated before it is placed in the path —
 * an invalid id yields the plain Results URL instead, so this helper can
 * never mint a link to a malformed route.
 */
export function buildFlightDetailsUrl(
  locale: string,
  offerId: string,
  currentParams: URLSearchParams,
  viewState: ResultsViewState,
  offers: readonly FlightOffer[],
): string {
  const query = canonicalResultsQuery(currentParams, viewState, offers);
  if (!isValidOfferId(offerId)) {
    return buildResultsReturnUrl(locale, currentParams, viewState, offers);
  }
  const base = localePath(locale, `/flights/results/${offerId}`);
  return query ? `${base}?${query}` : base;
}

/**
 * The "Back to results" URL: the same canonical Results address, with the
 * offer id dropped from the path entirely. Reconstructed from validated
 * inputs rather than read from any `returnTo`-style parameter.
 */
export function buildResultsReturnUrl(
  locale: string,
  currentParams: URLSearchParams,
  viewState: ResultsViewState,
  offers: readonly FlightOffer[],
): string {
  const query = canonicalResultsQuery(currentParams, viewState, offers);
  const base = localePath(locale, "/flights/results");
  return query ? `${base}?${query}` : base;
}

/**
 * The "Clear filters and view this option" URL: keeps the Search Intent and
 * the offer id, drops only the Filter parameters, and resets Sort to the
 * default so the resulting address is fully canonical. Used only from the
 * `excludedByFilters` state.
 */
export function buildClearedFiltersDetailsUrl(
  locale: string,
  offerId: string,
  currentParams: URLSearchParams,
  offers: readonly FlightOffer[],
): string {
  return buildFlightDetailsUrl(
    locale,
    offerId,
    currentParams,
    { sort: "best", filters: EMPTY_VIEW_FILTERS },
    offers,
  );
}

const EMPTY_VIEW_FILTERS = {
  stopCategories: [],
  carrierIds: [],
  departureTimeBuckets: [],
  maxTotalPrice: null,
  maxDurationMinutes: null,
  departureAirportCodes: [],
  arrivalAirportCodes: [],
} as const;

/**
 * Reads the Results view-state out of a Details URL. Intentionally the same
 * lenient, offer-aware parser Results already uses — the Details page must
 * interpret `sort`/`stops`/`carriers`/… identically to the page it was
 * opened from, so there is exactly one implementation of that meaning.
 */
export function parseFlightDetailsContext(params: URLSearchParams): {
  readonly viewState: ResultsViewState;
} {
  return { viewState: parseResultsViewState(params) };
}
