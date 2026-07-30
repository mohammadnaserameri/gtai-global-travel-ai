import type { CurrencyCode } from "@/config/currencies";
import type { FlightOffer } from "@/features/flights/flight-offer-types";
import type { FlightSearchIntent } from "@/features/flights/search-intent-types";

/**
 * Type-only scaffolding for a **future** real provider integration.
 *
 * Nothing in this file is implemented, instantiated, or imported by any
 * runtime code path — there is no adapter, no network call, and no real
 * provider anywhere in GTAI today. This module exists so the eventual V3
 * provider work has an agreed shape to build against, and so this V2.5
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
  search(
    request: ProviderSearchRequest,
  ): Promise<readonly ProviderRawOfferEnvelope[]>;
  normalize(
    raw: ProviderRawOfferEnvelope,
    currency: CurrencyCode,
  ): readonly NormalizedProviderOffer[];
}

/** Failure modes a real adapter must report distinctly — never collapsed into one generic "error". */
export type ProviderFailureReason =
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
}

/** Affiliate tracking parameters a real handoff URL would carry — never collected before a real provider exists. */
export interface AffiliateTrackingParams {
  readonly clickId: string;
  readonly campaignId: string;
  readonly subId?: string;
}

/** The shape of a future real provider handoff URL — not constructed anywhere in GTAI today. */
export interface ProviderHandoffUrlModel {
  readonly baseUrl: string;
  readonly providerOfferReference: string;
  readonly tracking: AffiliateTrackingParams;
}

/** One outbound hand-off attempt, for the redirect audit log described in the blueprint. */
export interface ProviderHandoffAuditEntry {
  readonly occurredAt: string;
  readonly providerId: string;
  readonly offerId: string;
  readonly searchIntentKey: string;
  readonly outcome: "opened" | "redirected" | "cancelled" | "failed";
}
