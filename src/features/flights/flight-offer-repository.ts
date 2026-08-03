import type { FlightSearchIntent } from "./search-intent-types";
import type { FlightOffer } from "./flight-offer-types";

/**
 * Whether every source that should have answered actually did.
 *
 * This is not a detail the interface may quietly drop. A result assembled
 * from some of the intended sources looks exactly like a complete one once
 * the offers are in a list — same cards, same filters, same "12 options"
 * count — so without carrying the distinction, an incomplete search would be
 * presented as an authoritative answer. `partial` is what lets the pages say
 * "this may not be everything" instead.
 */
export type FlightOfferCoverage = "complete" | "partial";

export interface FlightOfferSearchResult {
  readonly offers: readonly FlightOffer[];
  readonly coverage: FlightOfferCoverage;
}

/**
 * Raised when offer generation cannot complete. The Results page renders a
 * generic, translated message for this — never the raw error text — and
 * offers Retry and Edit search without losing the Search Intent.
 */
export class FlightOfferRepositoryError extends Error {
  constructor(message = "Flight offer preparation failed") {
    super(message);
    this.name = "FlightOfferRepositoryError";
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

/**
 * The controlled, allowlisted development scenarios a caller may request.
 *
 * This is the **only** vocabulary either side of the boundary accepts — it is
 * not a free-form provider error-injection string, and nothing outside this
 * union can reach the server runtime. `"normal"` is the absence of a
 * scenario; the other three exist so the loading, empty and error states can
 * be exercised without a real failure.
 */
export const DEVELOPMENT_SCENARIOS = ["normal", "empty", "error", "slow"] as const;

export type DevelopmentScenario = (typeof DEVELOPMENT_SCENARIOS)[number];

export function isDevelopmentScenario(
  value: unknown,
): value is DevelopmentScenario {
  return (
    typeof value === "string" &&
    (DEVELOPMENT_SCENARIOS as readonly string[]).includes(value)
  );
}

/**
 * Everything that may vary one search request from another.
 *
 * These three fields, together with the normalized Search Intent, are the
 * complete request identity. Sort, Filters, the selected offer id, card
 * expansion, provider-preview state, URL canonicalization and scroll position
 * are all deliberately absent — none of them can reach a repository, so none
 * of them can cause a second search.
 */
export interface FlightOfferSearchOptions {
  readonly signal?: AbortSignal;
  /** Bumped by Retry to authorize exactly one new request without changing the URL. */
  readonly retryToken?: number;
  readonly scenario?: DevelopmentScenario;
}

/**
 * Provider-independent contract for anything that can turn a Search Intent
 * into offers.
 *
 * As of V2.7 the runtime implementation is `ApiFlightOfferRepository`, which
 * posts to the internal GTAI search API; the server side of that boundary is
 * where the provider runtime lives. `DemoFlightOfferRepository` remains as an
 * in-process wrapper for deterministic verification. The pages never know
 * which kind they are talking to.
 */
export interface FlightOfferRepository {
  search(
    intent: FlightSearchIntent,
    options?: FlightOfferSearchOptions,
  ): Promise<FlightOfferSearchResult>;
}
