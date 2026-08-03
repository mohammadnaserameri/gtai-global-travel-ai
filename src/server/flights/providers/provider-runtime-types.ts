import type { FlightOffer } from "../../../features/flights/flight-offer-types";
import type { FlightSearchIntent } from "../../../features/flights/search-intent-types";
import type { DevelopmentScenario } from "../../../features/flights/flight-offer-repository";

/**
 * The internal vocabulary of the server-side provider runtime.
 *
 * These types never cross the wire. The client sees only the narrow envelope
 * in `flight-search-api-contract.ts`; everything here — the failure taxonomy,
 * the audit event, the per-provider outcome — is operator-facing, and keeping
 * the two vocabularies separate is what stops an operational detail (a
 * misconfigured credential, a provider's own error text) from becoming a
 * customer-visible one.
 *
 * This module is types-only, so it carries no server-only guard of its own:
 * there is nothing here to execute, and every module that *does* execute
 * imports the guard directly.
 */

/**
 * What an adapter is handed. Deliberately minimal.
 *
 * Note what is absent and why: no raw query string (the URL is not the
 * payload), no return URL (nothing a provider says may decide where a visitor
 * goes), no passenger names, no account id, no cookies, no authorization
 * header, no client-generated tracking data, and no client-chosen provider id
 * or timeout — the registry owns both of those. An adapter receives a
 * normalized search, a way to be cancelled, an opaque correlation id, and
 * nothing else.
 */
export interface ProviderSearchContext {
  readonly intent: FlightSearchIntent;
  readonly signal: AbortSignal;
  /**
   * A random, server-generated correlation id. Opaque by construction — it is
   * never derived from the route, the dates, the traveler counts or a hash of
   * the canonical intent, because a hash over a small guessable search space
   * is reversible and therefore not anonymous.
   */
  readonly searchContextId: string;
  readonly scenario: DevelopmentScenario;
}

/**
 * The failure modes an adapter must report distinctly.
 *
 * Collapsing any two of these would lose something a caller genuinely acts
 * on: `cancelled` must never be recorded as a provider fault, `timeout` must
 * never surface as `unknown`, and `authentication`/`configuration` are
 * operator problems that should never be retried at the customer's expense.
 */
export type ProviderFailureCode =
  | "cancelled"
  | "timeout"
  | "rateLimited"
  | "authentication"
  | "configuration"
  | "malformedResponse"
  | "unavailable"
  | "unknown";

export interface ProviderRuntimeFailure {
  readonly code: ProviderFailureCode;
  /**
   * Only meaningful for `rateLimited`, and only ever a validated finite
   * non-negative integer — a provider-supplied `Retry-After` is untrusted
   * input like any other.
   */
  readonly retryAfterMs?: number;
}

/**
 * A discriminated result rather than a thrown error, so a genuine zero-offer
 * response, a cancellation and every failure mode are distinct things a
 * caller can `switch` on.
 */
export type ProviderSearchOutcome =
  | { readonly ok: true; readonly offers: readonly FlightOffer[] }
  | { readonly ok: false; readonly failure: ProviderRuntimeFailure };

/**
 * The contract every adapter implements — today only the local deterministic
 * one, tomorrow (outside V2.7's scope) a real integration.
 *
 * `search` returns an outcome and does not throw for expected conditions. The
 * orchestrator still defends against a throw, because an adapter is untrusted
 * by policy.
 */
export interface FlightProviderAdapter {
  readonly providerId: string;
  search(context: ProviderSearchContext): Promise<ProviderSearchOutcome>;
}

/**
 * One provider's trusted, code-owned configuration.
 *
 * Every field here is fixed in source. None of it is read from a request, a
 * query parameter, a client payload or an environment variable, and there is
 * deliberately no `baseUrl`, no credential, no affiliate template and no
 * client-supplied timeout — an attacker who fully controls a request still
 * cannot select a provider, extend a timeout or redirect a search.
 */
export interface ProviderRegistration {
  readonly providerId: string;
  readonly enabled: boolean;
  /** Internal operator label. Never customer copy — that lives in the dictionaries. */
  readonly label: string;
  readonly adapter: FlightProviderAdapter;
  readonly timeoutMs: number;
  readonly maximumOfferCount: number;
  /** Lower runs first, and ties break on `providerId`, so aggregation order is deterministic. */
  readonly priority: number;
}

/**
 * One provider's contribution to a completed search.
 *
 * `cancelled` is a distinct status rather than a flavour of `failed`. A
 * visitor navigating away is not a provider fault, and recording it as one
 * would inflate every fault count an operator later reasons about.
 */
export interface ProviderRunOutcome {
  readonly providerId: string;
  readonly status: "succeeded" | "empty" | "failed" | "cancelled";
  readonly offers: readonly FlightOffer[];
  readonly failure: ProviderRuntimeFailure | null;
  readonly durationMs: number;
}

export interface OrchestratedSearchResult {
  /**
   * `partial` means at least one provider succeeded and at least one failed —
   * a distinction the customer-facing envelope keeps, because silently
   * presenting a reduced result set as if it were complete is a lie about
   * coverage.
   */
  readonly status: "success" | "partial" | "empty" | "failed";
  readonly offers: readonly FlightOffer[];
  readonly outcomes: readonly ProviderRunOutcome[];
  readonly searchContextId: string;
}

/**
 * A privacy-minimized audit event.
 *
 * The absent fields are the design: no origin, no destination, no dates, no
 * traveler counts, no cabin, no canonical Search Intent, no request or
 * response body, no provider URL, no affiliate parameter, no cookie, no IP,
 * no user agent, no account id, no payment data. What remains answers
 * operational questions — did this provider succeed, how long did it take,
 * how did it fail — without reconstructing anybody's trip.
 */
export interface ProviderAuditEvent {
  readonly searchContextId: string;
  readonly providerId: string;
  /**
   * `search.cancelled` is deliberately separate from `search.failed`. An
   * operator counting provider faults must not have to filter cancellations
   * back out — a caller going away says nothing about provider health, and
   * conflating the two makes every reliability figure wrong in the same
   * direction.
   */
  readonly event:
    "search.started" | "search.completed" | "search.failed" | "search.cancelled";
  readonly status: "started" | "succeeded" | "empty" | "failed" | "cancelled";
  /** Rounded to a coarse bucket, never an exact latency. */
  readonly durationBucketMs: number | null;
  readonly offerCount: number | null;
  /** Always `null` for a cancellation — there is no fault to categorize. */
  readonly failureCode: ProviderFailureCode | null;
  readonly occurredAt: string;
}

export interface ProviderAuditSink {
  record(event: ProviderAuditEvent): void;
}
