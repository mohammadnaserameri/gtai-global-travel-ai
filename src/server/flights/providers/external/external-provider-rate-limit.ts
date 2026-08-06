import "../../../server-only";

/**
 * Rate limiting, evaluated before a request is constructed.
 *
 * The point is to not discover a provider's quota by exceeding it. Exceeding a
 * quota is not a soft failure: it typically returns `429` for every caller on
 * the account, so one runaway loop degrades the whole integration and — with a
 * shared key — everybody else's too.
 *
 * Three structural decisions:
 *
 * 1. **Caller-owned state, never a module singleton.** A module-scoped counter
 *    is invisible to tests, shared between unrelated searches, and in a
 *    serverless deployment silently per-instance — so it enforces nothing while
 *    appearing to. State is passed in and returned.
 * 2. **Sliding window, not fixed.** A fixed window permits a burst of
 *    `2 × limit` across a boundary: all of one window's allowance at its end
 *    and all of the next at its start. That is exactly the shape that trips a
 *    provider's burst protection while looking compliant on paper.
 * 3. **Nothing is dropped silently.** Every refusal is typed and carries
 *    guidance. A limiter that quietly discards a request produces a search that
 *    returns fewer results for no stated reason.
 *
 * Server-side only. A client-side limiter protects nothing: the client is the
 * thing being limited, and anyone can run a different client.
 *
 * No Redis, no persistence, no shared store. Coordinating limits across
 * instances is a real problem and a later one; pretending to solve it here with
 * process-local state would be worse than not solving it.
 */

export interface ExternalProviderRateLimit {
  /** Sustained rate. The sliding window is one second wide. */
  readonly requestsPerSecond: number;
  /** Momentary allowance above the sustained rate. */
  readonly burst: number;
  /** In-flight requests permitted at once. `1` serializes the provider. */
  readonly concurrentRequests: number;
  /** Callers allowed to wait. `0` refuses immediately rather than queueing. */
  readonly queueLimit: number;
  /** Longest a queued caller may wait before being refused. */
  readonly maximumWaitMs: number;
  /**
   * Whether a provider-supplied `Retry-After` overrides local guidance. It is
   * untrusted input and is always clamped before use.
   */
  readonly honoursRetryAfter: boolean;
}

/**
 * Limiter state.
 *
 * Deliberately carries **no** request data: no URL, no query, no credential, no
 * search intent, no traveller information. Only timestamps and counts, so the
 * state itself can be logged or inspected without leaking anything.
 */
export interface RateLimitState {
  /** Timestamps (ms) of issued requests, oldest first. */
  readonly recentRequestTimestamps: readonly number[];
  readonly inFlightRequests: number;
  readonly queuedCallers: number;
}

export const EMPTY_RATE_LIMIT_STATE: RateLimitState = Object.freeze({
  recentRequestTimestamps: Object.freeze([]) as readonly number[],
  inFlightRequests: 0,
  queuedCallers: 0,
});

/** The exact field set. Asserted by verification to contain nothing sensitive. */
export const ALLOWED_RATE_LIMIT_STATE_FIELDS: readonly string[] = [
  "recentRequestTimestamps",
  "inFlightRequests",
  "queuedCallers",
];

export type RateLimitRefusalReason =
  "rateExhausted" | "concurrencyExhausted" | "queueFull" | "waitTooLong";

export type RateLimitDecision =
  | {
      readonly admitted: true;
      /** `0` for immediate admission; positive when the caller must queue. */
      readonly waitMs: number;
      readonly remainingInWindow: number;
    }
  | {
      readonly admitted: false;
      readonly reason: RateLimitRefusalReason;
      readonly retryAfterMs: number;
    };

/** The sliding window implied by the sustained rate. */
const WINDOW_MS = 1_000;

/** The window's capacity: sustained rate plus the momentary burst allowance. */
export function windowCapacity(policy: ExternalProviderRateLimit): number {
  return policy.requestsPerSecond + policy.burst;
}

function activeTimestamps(state: RateLimitState, now: number): readonly number[] {
  const cutoff = now - WINDOW_MS;
  return state.recentRequestTimestamps.filter((timestamp) => timestamp > cutoff);
}

/**
 * Decides whether one more request may be issued.
 *
 * Order matters and is the policy. Concurrency is checked first because it is
 * the cheaper signal and the one that protects a provider from a fan-out that
 * has not yet registered in the window. Only then is the rate considered, and
 * only then is queueing offered — a caller is never queued behind a limit it
 * would have passed.
 */
export function evaluateRateLimit(
  policy: ExternalProviderRateLimit,
  state: RateLimitState,
  now: number,
): RateLimitDecision {
  if (state.inFlightRequests >= policy.concurrentRequests) {
    return {
      admitted: false,
      reason: "concurrencyExhausted",
      // No timestamp predicts when an in-flight request finishes, so this is a
      // conservative slice of the window rather than a guess dressed up as a
      // measurement.
      retryAfterMs: Math.max(1, Math.round(WINDOW_MS / 10)),
    };
  }

  const active = activeTimestamps(state, now);
  const capacity = windowCapacity(policy);

  if (active.length < capacity) {
    return {
      admitted: true,
      waitMs: 0,
      remainingInWindow: capacity - active.length - 1,
    };
  }

  const oldest = active[0] ?? now;
  const waitMs = Math.max(1, oldest + WINDOW_MS - now);

  // The window is full. Queueing is the only remaining path.
  if (policy.queueLimit <= 0) {
    return { admitted: false, reason: "rateExhausted", retryAfterMs: waitMs };
  }
  if (state.queuedCallers >= policy.queueLimit) {
    return { admitted: false, reason: "queueFull", retryAfterMs: waitMs };
  }
  if (waitMs > policy.maximumWaitMs) {
    // Refused rather than queued past the policy. A caller held beyond the
    // budget produces a request that cannot finish in time anyway, so the wait
    // would be spent to reach the same failure.
    return { admitted: false, reason: "waitTooLong", retryAfterMs: waitMs };
  }

  return { admitted: true, waitMs, remainingInWindow: 0 };
}

/** Records an issued request. Pure — returns new state rather than mutating. */
export function recordRequestIssued(
  state: RateLimitState,
  now: number,
): RateLimitState {
  return {
    recentRequestTimestamps: [...activeTimestamps(state, now), now],
    inFlightRequests: state.inFlightRequests + 1,
    queuedCallers: state.queuedCallers,
  };
}

/**
 * Records a settled request.
 *
 * The floor at zero is not defensive noise. A double-settle would drive the
 * counter negative, and a negative in-flight count makes every subsequent
 * concurrency check pass regardless of real load — invisible until a provider
 * bans the account.
 */
export function recordRequestSettled(state: RateLimitState): RateLimitState {
  return {
    recentRequestTimestamps: state.recentRequestTimestamps,
    inFlightRequests: Math.max(0, state.inFlightRequests - 1),
    queuedCallers: state.queuedCallers,
  };
}

export function recordCallerQueued(state: RateLimitState): RateLimitState {
  return { ...state, queuedCallers: state.queuedCallers + 1 };
}

export function recordCallerDequeued(state: RateLimitState): RateLimitState {
  return { ...state, queuedCallers: Math.max(0, state.queuedCallers - 1) };
}

export function isValidRateLimit(policy: ExternalProviderRateLimit): boolean {
  const positiveInt = (value: number) => Number.isInteger(value) && value > 0;
  const nonNegativeInt = (value: number) => Number.isInteger(value) && value >= 0;

  if (!positiveInt(policy.requestsPerSecond)) return false;
  if (!nonNegativeInt(policy.burst)) return false;
  if (!positiveInt(policy.concurrentRequests)) return false;
  if (!nonNegativeInt(policy.queueLimit)) return false;
  if (!nonNegativeInt(policy.maximumWaitMs)) return false;
  // Concurrency above the window capacity would let the in-flight check pass
  // while the rate check is already exhausted — a limit that never binds.
  if (policy.concurrentRequests > windowCapacity(policy)) return false;
  // A queue nobody may wait in is a queue that silently refuses.
  return !(policy.queueLimit > 0 && policy.maximumWaitMs === 0);
}
