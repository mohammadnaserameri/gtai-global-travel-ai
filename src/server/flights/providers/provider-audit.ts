import "../../server-only";

import type {
  ProviderAuditEvent,
  ProviderAuditSink,
} from "./provider-runtime-types";

/**
 * Privacy-minimized provider auditing.
 *
 * The interesting design decision is what an event may not carry. There is no
 * origin, destination, date, traveler count, cabin, canonical Search Intent,
 * request body, response body, provider URL, affiliate parameter, cookie, IP
 * address, user agent, account identifier or payment data anywhere in
 * `ProviderAuditEvent` — not filtered out at write time, but absent from the
 * type, so a future contributor cannot add one by accident.
 *
 * The correlation key is `searchContextId`: a random per-search identifier
 * with no reversible relationship to the search. Deriving it from the route
 * and dates — even hashed — would not be anonymous, because the search space
 * is small enough to enumerate.
 *
 * V2.7 ships a **no-op sink**. Persistent logging is explicitly out of scope,
 * and an audit trail that exists before anyone has decided its retention,
 * access and deletion policy is a liability rather than an asset.
 */

/** Coarse latency buckets. An exact millisecond figure is a side channel nobody needs. */
const DURATION_BUCKET_MS = 250;
const MAX_BUCKET_MS = 30_000;

export function bucketDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs < 0) return 0;
  const bucketed = Math.round(durationMs / DURATION_BUCKET_MS) * DURATION_BUCKET_MS;
  return Math.min(bucketed, MAX_BUCKET_MS);
}

/** Maps a bucketed duration onto the three bands the client envelope may show. */
export function durationBand(durationMs: number): "fast" | "moderate" | "slow" {
  const bucketed = bucketDuration(durationMs);
  if (bucketed <= 500) return "fast";
  if (bucketed <= 2_000) return "moderate";
  return "slow";
}

/**
 * The default sink: accepts events and does nothing with them.
 *
 * Deliberately not `console.log`. Logging a search — even a minimized one —
 * to a shared runtime log is a persistence decision, and this stage has not
 * made one.
 */
export const noopAuditSink: ProviderAuditSink = {
  record() {
    // Intentionally empty. See the module comment.
  },
};

/** An in-memory sink for the deterministic verification script. Never wired into the runtime. */
export function createRecordingAuditSink(): ProviderAuditSink & {
  readonly events: readonly ProviderAuditEvent[];
} {
  const events: ProviderAuditEvent[] = [];
  return {
    events,
    record(event) {
      events.push(event);
    },
  };
}
