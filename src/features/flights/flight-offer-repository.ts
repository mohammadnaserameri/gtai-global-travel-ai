import type { FlightSearchIntent } from "./search-intent-types";
import type { FlightOffer } from "./flight-offer-types";

export interface FlightOfferSearchResult {
  readonly offers: readonly FlightOffer[];
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
 * Provider-independent contract for anything that can turn a Search Intent
 * into offers. `DemoFlightOfferRepository` is the only implementation today;
 * a future real provider adapter would implement the same interface, so the
 * Results page never needs to know which kind it is talking to.
 */
export interface FlightOfferRepository {
  search(
    intent: FlightSearchIntent,
    signal?: AbortSignal,
  ): Promise<FlightOfferSearchResult>;
}
