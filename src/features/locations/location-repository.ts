import type {
  LocationRepository,
  LocationSearchRequest,
  LocationSearchResponse,
  TravelLocation,
} from "@/features/locations/location-types";
import {
  resolveLocationIds,
  searchLocationsSync,
} from "@/features/locations/location-search";

/**
 * Raised when a repository lookup fails. The UI renders a retryable error
 * state for this rather than a raw technical message.
 */
export class LocationRepositoryError extends Error {
  constructor(message = "Location lookup failed") {
    super(message);
    this.name = "LocationRepositoryError";
  }
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

/**
 * Local, in-memory implementation backed by the demonstration directory.
 *
 * It is deliberately **asynchronous and abortable** even though the data is
 * local. That keeps the interface identical to the future networked
 * repository, so replacing this with a backed service requires no change in
 * the UI layer — and it means the loading, cancellation and error paths are
 * exercised for real today instead of being retrofitted later.
 */
export class DemoLocationRepository implements LocationRepository {
  /** Small artificial latency so the loading state is genuinely reachable. */
  private readonly latencyMs: number;

  constructor(latencyMs = 90) {
    this.latencyMs = latencyMs;
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
      }, this.latencyMs);

      function onAbort() {
        clearTimeout(timer);
        reject(abortError());
      }

      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  async search(
    request: LocationSearchRequest,
    signal?: AbortSignal,
  ): Promise<LocationSearchResponse> {
    await this.delay(signal);
    if (signal?.aborted) throw abortError();
    return searchLocationsSync(request);
  }

  async resolveByIds(ids: readonly string[]): Promise<readonly TravelLocation[]> {
    return resolveLocationIds(ids);
  }
}

/**
 * The repository the application uses.
 *
 * Swapping in a backend implementation is a one-line change here — every
 * consumer depends only on the `LocationRepository` interface.
 */
export const locationRepository: LocationRepository = new DemoLocationRepository();
