import "../../server-only";

import { containsForbiddenKey } from "../../../features/flights/flight-search-api-contract";
import { isCanonicalFlightOfferForIntent } from "../../../features/flights/flight-offer-intent-validation";
import type { FlightOffer } from "../../../features/flights/flight-offer-types";
import type { FlightSearchIntent } from "../../../features/flights/search-intent-types";
import type {
  ProviderFailureCode,
  ProviderRuntimeFailure,
  ProviderSearchOutcome,
} from "./provider-runtime-types";

/**
 * Adapter output is untrusted input.
 *
 * That holds even though V2.7's only adapter is local, deterministic and
 * written in this repository — because the boundary's value comes precisely
 * from not depending on which adapter is behind it. When a real integration
 * arrives, this file is what already stands between its payload and every
 * consumer downstream; if it only started being strict then, it would be
 * being written under exactly the pressure that makes such checks lax.
 *
 * Validation is **exact**, not partial. An outcome carries precisely the keys
 * its shape defines and nothing else, its failure code comes from a closed
 * runtime allowlist, and `retryAfterMs` is meaningful only where the contract
 * says it is. The orchestrator then uses the *validated* failure this module
 * returns rather than the original object, so an unchecked field cannot
 * survive by reference.
 *
 * V2.7's policy is **whole-response rejection**: one malformed offer fails
 * the provider, rather than being quietly dropped from an otherwise-accepted
 * batch. Item-level rejection is defensible only alongside a normalization
 * policy that reports how many items were discarded and why; without that, a
 * silently shortened list is a coverage claim nobody verified.
 */

/**
 * The runtime allowlist behind `ProviderFailureCode`.
 *
 * The type alone is erased at compile time and proves nothing about a value
 * an adapter actually returned, so the same vocabulary exists here as data.
 */
export const PROVIDER_FAILURE_CODES: readonly ProviderFailureCode[] = [
  "cancelled",
  "timeout",
  "rateLimited",
  "authentication",
  "configuration",
  "malformedResponse",
  "unavailable",
  "unknown",
];

/** Only `rateLimited` may carry a wait; a `retryAfterMs` anywhere else is a contract violation. */
const RETRY_AFTER_CODE: ProviderFailureCode = "rateLimited";

const SUCCESS_KEYS: readonly string[] = ["ok", "offers"];
const FAILURE_OUTCOME_KEYS: readonly string[] = ["ok", "failure"];
const FAILURE_CODE_ONLY_KEYS: readonly string[] = ["code"];
const FAILURE_KEYS: readonly string[] = ["code", "retryAfterMs"];

export type ProviderResponseValidation =
  | {
      readonly ok: true;
      readonly offers: readonly FlightOffer[];
      /** Present only for a well-formed failure outcome — the sanitized value the orchestrator must use. */
      readonly failure: ProviderRuntimeFailure | null;
    }
  | { readonly ok: false; readonly reason: ValidationRejectionReason };

export type ValidationRejectionReason =
  | "notAnOutcome"
  | "notAnArray"
  | "tooManyOffers"
  | "invalidOffer"
  | "duplicateOfferId"
  | "forbiddenField"
  | "unknownFailureCode"
  | "unexpectedProperty"
  | "invalidRetryAfter";

/**
 * A *plain* object: `{}` or `Object.create(null)`, nothing else.
 *
 * `typeof x === "object"` is not enough. An adapter could return an object
 * whose prototype supplies `ok`, `failure` or `code` — those read like own
 * properties through normal access but are absent from `Object.keys`, so a
 * key-count check would see an empty object while the validator's field
 * reads succeeded. Requiring a plain object with own properties closes that.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

/** Every listed key present as an own property, and no other own property. */
function hasExactOwnKeys(
  value: Record<string, unknown>,
  required: readonly string[],
): boolean {
  const own = Object.keys(value);
  if (own.length !== required.length) return false;
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function isProviderFailureCode(
  value: unknown,
): value is ProviderFailureCode {
  return (
    typeof value === "string" &&
    (PROVIDER_FAILURE_CODES as readonly string[]).includes(value)
  );
}

/**
 * Whether a provider's `retryAfterMs` is usable.
 *
 * A provider-supplied wait is untrusted like anything else: a negative,
 * fractional, infinite or absurdly large value is discarded rather than
 * honoured, so a misbehaving provider cannot stall a caller.
 */
export function isValidRetryAfterMs(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 300_000
  );
}

/**
 * Validates a raw adapter return value, before anything downstream sees it.
 *
 * `maximumOfferCount` comes from the trusted registry, never from the
 * provider and never from a request — a provider cannot raise its own ceiling
 * by returning more.
 */
export function validateProviderOutcome(
  outcome: unknown,
  maximumOfferCount: number,
  intent: FlightSearchIntent,
): ProviderResponseValidation {
  if (!isPlainObject(outcome)) return { ok: false, reason: "notAnOutcome" };
  if (!Object.prototype.hasOwnProperty.call(outcome, "ok")) {
    return { ok: false, reason: "notAnOutcome" };
  }
  if (typeof outcome.ok !== "boolean") {
    return { ok: false, reason: "notAnOutcome" };
  }

  // The negative sweep runs over the *whole* outcome first, so a redirect
  // target, credential or raw payload smuggled into a failure object is
  // caught as readily as one hidden inside an offer.
  if (containsForbiddenKey(outcome)) {
    return { ok: false, reason: "forbiddenField" };
  }

  if (outcome.ok === false) {
    if (!hasExactOwnKeys(outcome, FAILURE_OUTCOME_KEYS)) {
      return { ok: false, reason: "unexpectedProperty" };
    }
    const failure = outcome.failure;
    if (!isPlainObject(failure)) return { ok: false, reason: "notAnOutcome" };

    const carriesRetry = Object.prototype.hasOwnProperty.call(
      failure,
      "retryAfterMs",
    );
    // The two failure shapes are exact and distinct. An own
    // `retryAfterMs: undefined` is a third shape the contract does not
    // define, so it is rejected rather than treated as absence.
    const expectedKeys = carriesRetry ? FAILURE_KEYS : FAILURE_CODE_ONLY_KEYS;
    if (!hasExactOwnKeys(failure, expectedKeys)) {
      return { ok: false, reason: "unexpectedProperty" };
    }
    if (!isProviderFailureCode(failure.code)) {
      return { ok: false, reason: "unknownFailureCode" };
    }

    if (carriesRetry) {
      // A wait on a timeout or an authentication problem is not a smaller
      // version of a rate limit — it is a shape this contract does not define.
      if (failure.code !== RETRY_AFTER_CODE) {
        return { ok: false, reason: "unexpectedProperty" };
      }
      if (!isValidRetryAfterMs(failure.retryAfterMs)) {
        return { ok: false, reason: "invalidRetryAfter" };
      }
      return {
        ok: true,
        offers: [],
        failure: { code: failure.code, retryAfterMs: failure.retryAfterMs },
      };
    }

    // Rebuilt rather than passed through, so the orchestrator can only ever
    // hold fields this function actually checked.
    return { ok: true, offers: [], failure: { code: failure.code } };
  }

  if (!hasExactOwnKeys(outcome, SUCCESS_KEYS)) {
    return { ok: false, reason: "unexpectedProperty" };
  }

  const offers = outcome.offers;
  if (!Array.isArray(offers)) return { ok: false, reason: "notAnArray" };
  if (offers.length > maximumOfferCount) {
    return { ok: false, reason: "tooManyOffers" };
  }

  // Structural and domain validation: id shape, finite integer money,
  // supported currency, itinerary count, segment chronology, airport codes,
  // demonstration markers — and exact keys at every level, so no
  // provider-specific field rides in beside valid ones.
  // Intent-aware, not merely structural: an offer must answer *this* search
  // and be internally consistent, or the whole provider response is refused.
  //
  // The call is wrapped because this function must be **total**. A validator
  // that can throw hands the caller a third outcome it has no branch for: the
  // exception escapes past the failure taxonomy, past the audit event, and out
  // of the orchestrator as something no envelope describes. An unexpected
  // throw is therefore classified the same way a rejected offer is — the
  // provider's output is malformed — and nothing about the exception is
  // inspected, forwarded or surfaced. The `catch` accepts no data; it only
  // decides that this provider failed.
  for (const offer of offers) {
    let valid: boolean;
    try {
      valid = isCanonicalFlightOfferForIntent(offer, intent);
    } catch {
      return { ok: false, reason: "invalidOffer" };
    }
    if (!valid) return { ok: false, reason: "invalidOffer" };
  }

  const seen = new Set<string>();
  for (const offer of offers as readonly FlightOffer[]) {
    if (seen.has(offer.id)) return { ok: false, reason: "duplicateOfferId" };
    seen.add(offer.id);
  }

  return { ok: true, offers: offers as readonly FlightOffer[], failure: null };
}

/** Narrows an already-validated outcome for the orchestrator's own switch. */
export function isSuccessfulOutcome(
  outcome: ProviderSearchOutcome,
): outcome is Extract<ProviderSearchOutcome, { ok: true }> {
  return outcome.ok;
}
