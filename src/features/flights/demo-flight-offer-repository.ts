import type { FlightSearchIntent } from "./search-intent-types";
import { generateDemoOffers } from "./demo-offer-generation";
import {
  abortError,
  FlightOfferRepositoryError,
  type FlightOfferRepository,
  type FlightOfferSearchOptions,
  type FlightOfferSearchResult,
} from "./flight-offer-repository";

export { MIN_ROUND_TRIP_TURNAROUND_MINUTES } from "./flight-offer-policy";

export type DemoOfferScenario = "normal" | "empty" | "error";

interface DemoFlightOfferRepositoryOptions {
  /** Constant delay rather than a random one, so timing stays deterministic. */
  delayMs?: number;
  scenario?: DemoOfferScenario;
}

/**
 * The in-process demonstration repository, kept as a **compatibility wrapper**
 * around the shared generator in `demo-offer-generation.ts`.
 *
 * As of V2.7 this is no longer the runtime the Results or Details pages use:
 * both now go through `ApiFlightOfferRepository` → the internal GTAI search
 * API → the server-side provider runtime, which reaches the very same
 * `generateDemoOffers` behind a provider adapter. This class survives only so
 * the deterministic verification scripts can exercise offer generation
 * in-process without standing up an HTTP server, and so the scenario shape
 * stays comparable across both paths. There is exactly one generator; this is
 * one of two callers of it, not a second implementation.
 */
export class DemoFlightOfferRepository implements FlightOfferRepository {
  private readonly delayMs: number;
  private readonly scenario: DemoOfferScenario;

  constructor(options: DemoFlightOfferRepositoryOptions = {}) {
    this.delayMs = options.delayMs ?? 550;
    this.scenario = options.scenario ?? "normal";
  }

  private delay(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, this.delayMs);
      function onAbort() {
        clearTimeout(timer);
        reject(abortError());
      }
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  async search(
    intent: FlightSearchIntent,
    options: FlightOfferSearchOptions = {},
  ): Promise<FlightOfferSearchResult> {
    const signal = options.signal;
    await this.delay(signal);
    if (signal?.aborted) throw abortError();

    if (this.scenario === "error") {
      throw new FlightOfferRepositoryError();
    }
    // Always `complete`: this wrapper has exactly one in-process source, so
    // there is no second source that could have been missed.
    if (this.scenario === "empty") {
      return { offers: [], coverage: "complete" };
    }
    return { offers: generateDemoOffers(intent), coverage: "complete" };
  }
}
