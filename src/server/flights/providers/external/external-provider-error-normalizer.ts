import "../../../server-only";

import {
  buildExternalFailure,
  type ExternalFailureCategory,
  type NormalizedExternalFailure,
} from "./external-provider-failures";
import { statusClassOf } from "./external-provider-redaction";
import type { ExternalProviderSearchResponse } from "./external-provider-types";

/**
 * Turning a provider's arbitrary error into GTAI's fixed failure taxonomy.
 *
 * Every provider expresses failure differently — some with status codes, some
 * with a `200` wrapping an error envelope, some with a bare HTML page from a
 * proxy they do not control. This module is the only place that translates, so
 * there is exactly one table to review rather than one branch per adapter.
 *
 * The distinctions that matter most:
 *
 * - `401` → `unauthorized` and `403` → `forbidden` are kept **apart**. Both
 *   stop the request, but one means the key is wrong and the other means the
 *   key is right and lacks an entitlement. An operator fixes those differently,
 *   and collapsing them costs an afternoon every time it happens.
 * - `400`/`422` → `invalidRequest` is GTAI's own bug, not the provider's.
 *   Categorizing it as `unavailable` would hide a defect behind an outage.
 * - Nothing here is retryable by accident: retryability is a property of the
 *   category, decided once in the failures module.
 */

/** A `Retry-After` may be seconds or an HTTP date. Both are untrusted. */
export function parseRetryAfterMs(
  headerValue: string | undefined,
  now: number,
): number | null {
  if (headerValue === undefined) return null;
  const trimmed = headerValue.trim();
  if (trimmed.length === 0) return null;

  // Delta-seconds form.
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number.parseInt(trimmed, 10);
    if (!Number.isSafeInteger(seconds) || seconds < 0) return null;
    return seconds * 1_000;
  }

  // HTTP-date form. A date in the past yields 0, never a negative delay.
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, parsed - now);
}

/**
 * Maps an HTTP status onto an external category.
 *
 * `408` and `504` are timeouts rather than generic unavailability: they mean
 * something took too long, which is retryable on a different schedule from a
 * provider being down. `404`/`410` are `invalidRequest` because GTAI asked for
 * an endpoint that is not there — a configuration mistake on this side.
 */
export function categoryForStatus(statusCode: number): ExternalFailureCategory {
  if (!Number.isInteger(statusCode)) return "unknown";
  if (statusCode >= 200 && statusCode < 300) return "unknown";
  if (statusCode === 401) return "unauthorized";
  if (statusCode === 403) return "forbidden";
  if (statusCode === 408 || statusCode === 504) return "timeout";
  if (statusCode === 429) return "rateLimited";
  if (statusCode === 400 || statusCode === 422) return "invalidRequest";
  if (statusCode === 404 || statusCode === 410) return "invalidRequest";
  if (statusCode >= 500) return "upstreamUnavailable";
  if (statusCode >= 400) return "unknown";
  return "unknown";
}

/**
 * Maps a thrown transport error onto a category.
 *
 * `AbortError` is the case worth being careful with: the same exception is
 * raised whether the caller navigated away or a timeout fired, and the two must
 * not be conflated — V2.7 keeps cancellations out of the fault counts for
 * exactly this reason. The distinction is not recoverable from the error, so
 * the caller supplies it and this function refuses to guess.
 */
export function categoryForCause(
  cause: unknown,
  abortReason: "cancelled" | "timedOut" | "none" = "none",
): ExternalFailureCategory {
  if (abortReason === "cancelled") return "aborted";
  if (abortReason === "timedOut") return "timeout";

  if (cause instanceof Error) {
    if (cause.name === "AbortError") {
      // Genuinely ambiguous with no reason supplied. `timeout` is the safer
      // default: it is operational, whereas guessing `aborted` would erase a
      // real provider problem from the fault counts an operator relies on.
      return "timeout";
    }
    if (cause.name === "TimeoutError") return "timeout";
    // A `TypeError` from a transport is characteristically a DNS/TLS/connection
    // failure — the request never reached an application.
    if (cause.name === "TypeError") return "networkFailure";
  }
  return "unknown";
}

export interface NormalizeFailureInput {
  readonly response: ExternalProviderSearchResponse | null;
  readonly cause?: unknown;
  readonly abortReason?: "cancelled" | "timedOut" | "none";
  readonly providerId: string;
  readonly requestId: string;
  readonly now: number;
}

/**
 * The single entry point producing a normalized failure.
 *
 * Note what this function does **not** do: it never reads the response body.
 * A provider's error text routinely echoes back the request — which is the
 * traveller's search — and often the request URL, which may carry a credential
 * in its query string. The category comes from the status and the cause, and
 * the message comes from GTAI's own fixed vocabulary. There is no path by
 * which provider-authored text becomes something GTAI writes down.
 */
export function normalizeExternalFailure(
  input: NormalizeFailureInput,
): NormalizedExternalFailure {
  const { response, cause, abortReason = "none", now } = input;

  const category =
    abortReason !== "none" || response === null
      ? categoryForCause(cause, abortReason)
      : categoryForStatus(response.statusCode);

  const retryAfterMs =
    category === "rateLimited" && response !== null
      ? parseRetryAfterMs(
          response.headers["retry-after"] ?? response.headers["Retry-After"],
          now,
        )
      : null;

  return buildExternalFailure({
    category,
    providerId: input.providerId,
    requestId: input.requestId,
    occurredAt: new Date(now).toISOString(),
    retryAfterMs,
    statusCode: response?.statusCode ?? null,
  });
}

/** Operator-facing one-line summary. Carries a status *class*, never a body. */
export function describeFailure(failure: NormalizedExternalFailure): string {
  const status =
    failure.statusCode === null ? "no-response" : statusClassOf(failure.statusCode);
  return `${failure.category} (${status})`;
}
