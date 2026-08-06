import "../../../server-only";

import type { ProviderFailureCode } from "../provider-runtime-types";
import {
  isRetryableCategory,
  type ExternalFailureCategory,
} from "./external-provider-failures";
import type {
  ExternalProviderRetryPolicy,
  ExternalProviderTimeoutPolicy,
} from "./external-provider-types";

/**
 * Retry and timeout policy, as pure functions over data.
 *
 * Retry logic is usually written inline inside the thing doing the retrying,
 * which makes it impossible to test without performing the retries and easy to
 * get wrong in ways nobody notices until a provider has an outage and GTAI
 * amplifies it. Here the decision is a function of (policy, failure, attempt,
 * elapsed) and nothing else — no timers, no randomness, no clock reads.
 *
 * Jitter is a *parameter*, not an internal `Math.random()`. A policy that
 * randomizes internally cannot be asserted on, and the property worth asserting
 * is that jitter never pushes a delay outside its documented bounds.
 */

/**
 * The failure codes it is ever sane to retry.
 *
 * `authentication` and `configuration` are absent by design, and this is the
 * rule V2.7 already states: they are operator mistakes, and retrying spends a
 * traveller's wait and a provider's quota to reach the identical answer.
 * `cancelled` is absent because the caller has gone — there is nobody to
 * retry for. `malformedResponse` is absent because a provider that returned
 * unparseable output will almost certainly return it again, and retrying turns
 * one bad deploy on their side into a traffic multiplier.
 */
export const DEFAULT_RETRYABLE_FAILURES: readonly ProviderFailureCode[] = [
  "timeout",
  "rateLimited",
  "unavailable",
];

/** Absolute ceilings, so no policy can declare something unreasonable. */
export const MAX_ATTEMPTS_CEILING = 4;
export const MAX_BACKOFF_CEILING_MS = 10_000;
export const MAX_TOTAL_DEADLINE_MS = 30_000;

export interface RetryDecisionInput {
  readonly policy: ExternalProviderRetryPolicy;
  readonly failureCode: ProviderFailureCode;
  /** 1-based attempt that just failed. */
  readonly attempt: number;
  /** Milliseconds already spent across all attempts. */
  readonly elapsedMs: number;
  readonly timeoutPolicy: ExternalProviderTimeoutPolicy;
  /**
   * Provider-supplied `Retry-After` in milliseconds, already parsed. Untrusted:
   * clamped here rather than trusted as given.
   */
  readonly retryAfterMs?: number | null;
  /** Deterministic jitter source in `[0, 1)`. Injected so this stays pure. */
  readonly jitter?: number;
}

export type RetryRefusalReason =
  | "failureNotRetryable"
  | "attemptsExhausted"
  | "deadlineExceeded"
  | "callerAborted";

export type RetryDecision =
  | { readonly retry: true; readonly delayMs: number; readonly nextAttempt: number }
  | { readonly retry: false; readonly reason: RetryRefusalReason };

/**
 * Exponential backoff with bounded jitter.
 *
 * `attempt` is 1-based, so the first retry waits `initialBackoffMs` rather than
 * `initialBackoffMs * multiplier`. Off-by-one here is the difference between a
 * polite first retry and one that has already tripled the delay.
 *
 * The result is clamped to `maximumBackoffMs` **before** jitter and the jitter
 * is additive within the same ceiling, so a jittered delay can never exceed the
 * declared maximum. Multiplying after clamping — the common shortcut — lets a
 * jitter of 1.0 double a maximum that was chosen precisely as a maximum.
 */
export function computeBackoffMs(
  policy: ExternalProviderRetryPolicy,
  attempt: number,
  jitter = 0,
): number {
  if (attempt < 1) return 0;
  const exponent = Math.max(0, attempt - 1);
  const raw =
    policy.initialBackoffMs * Math.pow(policy.backoffMultiplier, exponent);
  const ceiling = Math.min(policy.maximumBackoffMs, MAX_BACKOFF_CEILING_MS);
  const base = Math.min(raw, ceiling);
  const clampedJitter = Math.min(1, Math.max(0, jitter));
  const clampedRatio = Math.min(1, Math.max(0, policy.jitterRatio));
  // Jitter shifts the delay *within* `[base * (1 - ratio), base]`, so it can
  // only ever reduce a delay below the computed one — never exceed the ceiling.
  const spread = base * clampedRatio;
  const delay = base - spread + spread * clampedJitter;
  return Math.round(Math.min(delay, ceiling));
}

/**
 * Clamps an untrusted provider-supplied `Retry-After`.
 *
 * A provider asking GTAI to wait an hour is not a reason to hold a traveller's
 * request for an hour. Anything non-finite, negative or beyond the total
 * deadline is refused rather than honoured.
 */
export function clampRetryAfterMs(
  retryAfterMs: number | null | undefined,
  timeoutPolicy: ExternalProviderTimeoutPolicy,
): number | null {
  if (retryAfterMs === null || retryAfterMs === undefined) return null;
  if (!Number.isFinite(retryAfterMs) || retryAfterMs < 0) return null;
  const ceiling = Math.min(timeoutPolicy.totalDeadlineMs, MAX_TOTAL_DEADLINE_MS);
  return Math.min(Math.round(retryAfterMs), ceiling);
}

/**
 * Decides whether to retry, and how long to wait.
 *
 * Total: every path returns a decision, and the three refusal reasons are kept
 * distinct because they mean different things to an operator. "Not retryable"
 * is a property of the failure, "attempts exhausted" is a property of the
 * policy, and "deadline exceeded" is a property of this particular request
 * having already been slow — conflating them makes a latency problem look like
 * a configuration one.
 */
export function decideRetry(input: RetryDecisionInput): RetryDecision {
  const { policy, failureCode, attempt, elapsedMs, timeoutPolicy } = input;

  if (!policy.retryableFailures.includes(failureCode)) {
    return { retry: false, reason: "failureNotRetryable" };
  }

  const attemptCeiling = Math.min(policy.maximumAttempts, MAX_ATTEMPTS_CEILING);
  if (attempt >= attemptCeiling) {
    return { retry: false, reason: "attemptsExhausted" };
  }

  const honoured = clampRetryAfterMs(input.retryAfterMs, timeoutPolicy);
  const backoff = computeBackoffMs(policy, attempt, input.jitter ?? 0);
  // A provider's own guidance wins when it is longer — it knows its quota
  // better than the local policy does — but only after clamping.
  const delayMs = honoured === null ? backoff : Math.max(backoff, honoured);

  const deadline = Math.min(timeoutPolicy.totalDeadlineMs, MAX_TOTAL_DEADLINE_MS);
  // The check includes the delay *and* room for the attempt itself. Waiting out
  // a backoff only to start a request that cannot finish wastes the remaining
  // budget and still fails.
  if (elapsedMs + delayMs + timeoutPolicy.requestTimeoutMs > deadline) {
    return { retry: false, reason: "deadlineExceeded" };
  }

  return { retry: true, delayMs, nextAttempt: attempt + 1 };
}

/** Rejects a policy that is internally inconsistent or beyond the hard ceilings. */
export function isValidRetryPolicy(policy: ExternalProviderRetryPolicy): boolean {
  if (!Number.isInteger(policy.maximumAttempts)) return false;
  if (policy.maximumAttempts < 1 || policy.maximumAttempts > MAX_ATTEMPTS_CEILING) {
    return false;
  }
  if (!Number.isFinite(policy.initialBackoffMs) || policy.initialBackoffMs < 0) {
    return false;
  }
  if (!Number.isFinite(policy.backoffMultiplier) || policy.backoffMultiplier < 1) {
    return false;
  }
  if (
    !Number.isFinite(policy.maximumBackoffMs) ||
    policy.maximumBackoffMs < policy.initialBackoffMs ||
    policy.maximumBackoffMs > MAX_BACKOFF_CEILING_MS
  ) {
    return false;
  }
  if (
    !Number.isFinite(policy.jitterRatio) ||
    policy.jitterRatio < 0 ||
    policy.jitterRatio > 1
  ) {
    return false;
  }
  if (policy.retryableFailures.length === 0) return false;
  // The structural rule, not a convention: an operator mistake must never be
  // retried at a traveller's expense.
  return !policy.retryableFailures.some(
    (code) =>
      code === "authentication" || code === "configuration" || code === "cancelled",
  );
}

export function isValidTimeoutPolicy(
  policy: ExternalProviderTimeoutPolicy,
): boolean {
  const positiveInteger = (value: number) => Number.isInteger(value) && value > 0;
  if (!positiveInteger(policy.connectTimeoutMs)) return false;
  if (!positiveInteger(policy.requestTimeoutMs)) return false;
  if (!positiveInteger(policy.totalDeadlineMs)) return false;
  if (policy.connectTimeoutMs > policy.requestTimeoutMs) return false;
  if (policy.requestTimeoutMs > policy.totalDeadlineMs) return false;
  return policy.totalDeadlineMs <= MAX_TOTAL_DEADLINE_MS;
}

/* ------------------------------------------------------------------------- */
/* Category-based retry, including abort                                     */
/* ------------------------------------------------------------------------- */

export interface CategoryRetryInput {
  readonly policy: ExternalProviderRetryPolicy;
  readonly category: ExternalFailureCategory;
  /** 1-based attempt that just failed. */
  readonly attempt: number;
  readonly elapsedMs: number;
  readonly timeoutPolicy: ExternalProviderTimeoutPolicy;
  /** The caller's signal. Checked before anything else. */
  readonly aborted: boolean;
  readonly retryAfterMs?: number | null;
  /** Deterministic jitter in `[0, 1]`. Injected so this stays pure. */
  readonly jitter?: number;
}

/**
 * Decides whether to retry, using the external category directly.
 *
 * The abort check comes **first**, before retryability, attempts or deadline.
 * A caller that has gone away must never cause another request: it would spend
 * a provider's quota on a result nobody will read, and — with a shared key —
 * on behalf of everyone else using it. No amount of "this failure is
 * retryable" outranks "there is nobody to retry for".
 *
 * Everything an operator must fix (`unauthorized`, `forbidden`,
 * `invalidRequest`, `unsupportedSearch`) is non-retryable by category, and
 * `mappingFailure` is too — a provider returning unmappable output will return
 * it again, so retrying converts one bad deploy on their side into a traffic
 * multiplier.
 */
export function decideRetryForCategory(input: CategoryRetryInput): RetryDecision {
  if (input.aborted) {
    return { retry: false, reason: "callerAborted" };
  }
  if (!isRetryableCategory(input.category)) {
    return { retry: false, reason: "failureNotRetryable" };
  }

  const attemptCeiling = Math.min(
    input.policy.maximumAttempts,
    MAX_ATTEMPTS_CEILING,
  );
  if (input.attempt >= attemptCeiling) {
    return { retry: false, reason: "attemptsExhausted" };
  }

  const honoured = clampRetryAfterMs(input.retryAfterMs, input.timeoutPolicy);
  const backoff = computeBackoffMs(input.policy, input.attempt, input.jitter ?? 0);
  const delayMs = honoured === null ? backoff : Math.max(backoff, honoured);

  const deadline = Math.min(
    input.timeoutPolicy.totalDeadlineMs,
    MAX_TOTAL_DEADLINE_MS,
  );
  // Room for the delay *and* the attempt itself. Waiting out a backoff only to
  // start a request that cannot finish spends the remaining budget and still
  // fails.
  if (input.elapsedMs + delayMs + input.timeoutPolicy.requestTimeoutMs > deadline) {
    return { retry: false, reason: "deadlineExceeded" };
  }

  return { retry: true, delayMs, nextAttempt: input.attempt + 1 };
}

/**
 * The categories no policy may ever retry.
 *
 * Asserted by verification against the category table, so the two cannot drift.
 */
export const NEVER_RETRYABLE_CATEGORIES: readonly ExternalFailureCategory[] = [
  "notConfigured",
  "unavailable",
  "unauthorized",
  "forbidden",
  "invalidRequest",
  "unsupportedSearch",
  "aborted",
  "malformedResponse",
  "partialResponse",
  "mappingFailure",
];

/** Whether an elapsed budget has been exhausted, independent of any failure. */
export function isBudgetExhausted(
  elapsedMs: number,
  timeoutPolicy: ExternalProviderTimeoutPolicy,
): boolean {
  const deadline = Math.min(timeoutPolicy.totalDeadlineMs, MAX_TOTAL_DEADLINE_MS);
  return elapsedMs >= deadline;
}
