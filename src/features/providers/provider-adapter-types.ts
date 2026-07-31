import type { CurrencyCode } from "@/config/currencies";
import type { FlightOffer } from "@/features/flights/flight-offer-types";
import type { FlightSearchIntent } from "@/features/flights/search-intent-types";

/**
 * Type-only scaffolding for a **future** real provider integration.
 *
 * Nothing in this file is implemented, instantiated, or imported by any
 * runtime code path — there is no adapter, no network call, and no real
 * provider anywhere in GTAI today. This module exists so the eventual V3
 * provider work has an agreed shape to build against, and so this
 * blueprint round leaves behind more than prose. See
 * `docs/reference/07_PROVIDER_INTEGRATION_BLUEPRINT.md` for the full plan
 * these types support.
 */

/** One real (or sandbox) travel provider's identity — never a display name alone. */
export interface ProviderIdentity {
  readonly providerId: string;
  readonly displayName: string;
}

/** What a provider adapter receives to run a search. Provider-agnostic — no adapter-specific field leaks in here. */
export interface ProviderSearchRequest {
  readonly intent: FlightSearchIntent;
  /** ISO-8601 instant the search was issued, for latency and audit accounting. */
  readonly requestedAt: string;
  /** Lets the caller cancel an in-flight search — the same cancellation model `FlightResultsExperience`'s own fetch effect already uses via `AbortController`. */
  readonly signal?: AbortSignal;
}

/**
 * A provider's own raw offer shape is adapter-specific and deliberately
 * **not** modeled here — only the envelope around it and the normalized
 * output (`NormalizedProviderOffer`) are part of this shared contract.
 */
export interface ProviderRawOfferEnvelope {
  readonly providerId: string;
  readonly payload: unknown;
  /** ISO-8601 instant this raw payload was received from the provider. */
  readonly fetchedAt: string;
}

/** Failure modes a real adapter must report distinctly — never collapsed into one generic "error". */
export type ProviderFailureReason =
  | "cancelled"
  | "timeout"
  | "rateLimited"
  | "invalidResponse"
  | "noAvailability"
  | "authenticationFailed"
  | "unknown";

export interface ProviderFailure {
  readonly providerId: string;
  readonly reason: ProviderFailureReason;
  readonly occurredAt: string;
  /**
   * Only meaningful when `reason` is `"rateLimited"` — how long the caller
   * should wait, in milliseconds, before retrying. `null`/absent means the
   * provider gave no guidance.
   */
  readonly retryAfterMs?: number;
}

/**
 * A discriminated result rather than a bare offer array, so a genuine
 * zero-offer response, a cancellation, and every other failure mode are
 * three different things a caller can `switch` on — never conflated into
 * one thrown error or one ambiguous empty array. `reason: "cancelled"` (via
 * `ProviderSearchRequest.signal`) is always distinguishable from
 * `reason: "timeout"` — a caller-initiated abort is never reported as if
 * the provider itself was slow.
 */
export type ProviderSearchResult =
  | {
      readonly ok: true;
      readonly rawOffers: readonly ProviderRawOfferEnvelope[];
      readonly completedAt: string;
    }
  | {
      readonly ok: false;
      readonly failure: ProviderFailure;
    };

/**
 * Every normalized offer must carry when its price was actually observed —
 * never assumed to be "now" just because the traveler is looking at it now.
 */
export interface PriceFreshness {
  /** ISO-8601 instant the provider actually quoted this price. */
  readonly observedAt: string;
  /** Provider-declared validity window, if the provider states one. */
  readonly expiresAt: string | null;
}

/** The result of normalizing one provider's raw offer into GTAI's own `FlightOffer` shape. */
export interface NormalizedProviderOffer {
  readonly offer: FlightOffer;
  readonly freshness: PriceFreshness;
  /** The provider's own id for this offer — for audit/support only, never shown to the traveler as a GTAI reference. */
  readonly providerOfferReference: string;
}

/** The provider adapter contract every future real integration must implement. */
export interface ProviderAdapter {
  readonly identity: ProviderIdentity;
  search(request: ProviderSearchRequest): Promise<ProviderSearchResult>;
  normalize(
    raw: ProviderRawOfferEnvelope,
    currency: CurrencyCode,
  ): readonly NormalizedProviderOffer[];
}

/** Affiliate tracking parameters a real handoff URL would carry — never collected before a real provider exists. */
export interface AffiliateTrackingParams {
  readonly clickId: string;
  readonly campaignId: string;
  readonly subId?: string;
}

/**
 * A server-side-only, allowlisted configuration for one provider —
 * `allowedOrigin` is operator-configured and never derived from a raw
 * provider response, a URL parameter, or anything else request-controlled.
 * Only `https:` origins may ever appear here in production.
 */
export interface TrustedProviderConfig {
  readonly providerId: string;
  readonly allowedOrigin: string;
}

/**
 * The shape of a future real provider hand-off — deliberately carries no
 * destination URL or origin of its own. `providerId` is what selects the
 * trusted, operator-configured `TrustedProviderConfig` that actually owns
 * the allowlisted origin; nothing a provider returns in a raw payload can
 * ever supply or override where a hand-off points.
 */
export interface ProviderHandoffUrlModel {
  readonly providerId: string;
  readonly providerOfferReference: string;
  readonly tracking: AffiliateTrackingParams;
}

/**
 * The future trusted URL builder's contract — not implemented anywhere in
 * this codebase yet. A real implementation must: look up `config` by
 * `model.providerId` server-side (never trust a `config` supplied by the
 * caller or embedded in provider data), build the result with the `URL` /
 * `URLSearchParams` APIs rather than string concatenation, allow only
 * `https:` in production, reject `javascript:`, `data:`, protocol-relative
 * URLs, embedded credentials, and any host other than `config.allowedOrigin`,
 * and re-validate the fully-built destination immediately before navigation
 * — not only at construction time.
 */
export type TrustedHandoffUrlBuilder = (
  model: ProviderHandoffUrlModel,
  config: TrustedProviderConfig,
) => URL;

/**
 * One outbound hand-off attempt, for the redirect audit log described in
 * the blueprint. `searchContextId` is an opaque, randomly-generated
 * correlation id — **not** the canonical Search Intent query string and
 * **not** a hash of it. A hash of a small, guessable search space (a route,
 * a date range, a traveler count) is brute-forceable back to the original
 * search, so it is not treated as anonymous here; only a value with no
 * reversible relationship to the search is acceptable in this log.
 */
export interface ProviderHandoffAuditEntry {
  readonly occurredAt: string;
  readonly providerId: string;
  readonly offerId: string;
  readonly searchContextId: string;
  readonly outcome: "opened" | "redirected" | "cancelled" | "failed";
}
