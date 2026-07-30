# GTAI V1.2-G (partial) — Provider Integration Blueprint

**Module:** 07 of 07 — Flight Details and Affiliate Redirect.
**Status:** Blueprint only. The outbound placeholder it describes the _destination_ for is implemented in V2.5; a real provider adapter is **not** implemented anywhere in this codebase.
**Base checkpoint:** `83937ce933ba23ce1358176b37fc9f7e4da5da8f` (V2.4 — Functional Flight Filters, frozen)
**Type scaffolding:** `src/features/providers/provider-adapter-types.ts` — type-only, never imported by a runtime code path
**Implementation record:** `docs/implementation/V2_5_FLIGHT_RESULTS_POLISH_AND_OUTBOUND_BLUEPRINT.md`

---

## 1. Purpose

This document is the forward-looking plan for connecting a **real** flight provider to GTAI — what V3 (Provider Adapter Integration, per `docs/product/ROADMAP.md`) must build. It is documentation and type scaffolding only: no adapter exists, no provider is contacted, and nothing described here changes GTAI's behavior today. The V2.5 outbound placeholder (`ProviderHandoffModal`) is the UI destination this plan eventually replaces with a real hand-off.

## 2. Provider adapter contract

A real integration implements `ProviderAdapter` (`provider-adapter-types.ts`): an `identity` (a provider id and display name — never a bare display name, so audit logs and disclosures can always name the actual provider), a `search(request)` returning raw provider envelopes, and a `normalize(raw, currency)` turning one provider's raw payload into GTAI's own `FlightOffer` shape. GTAI's ranking, filtering and card rendering all already operate on `FlightOffer` — a real adapter's entire job is producing that shape correctly and honestly; nothing downstream needs to change.

## 3. Offer normalization

`normalize` is the only place a provider's raw payload is ever read. It must produce a `FlightOffer` with `isDemonstration: false` and populate every field this codebase already treats as load-bearing: `rankingMetadata` (duration/stop totals used by Sort — never a provider's own "recommended" ordering), `validatingCarrierId`/`validatingCarrierName` (real IATA carrier data, replacing the fictional `aurora`/`maple`/`skyline`/`meridian` ids), and `baggage`/`fare` (read from the provider's actual fare rules, never defaulted to "included" or "refundable" for a better-looking card).

## 4. Price freshness and timestamp model

Every normalized offer carries a `PriceFreshness`: `observedAt` (the instant the provider actually quoted this price) and `expiresAt` (the provider's own stated validity window, or `null` if the provider doesn't declare one). The Results UI must render an explicit "price checked at HH:MM" or "may have changed" notice once real prices exist — the current demonstration disclosure ("prices are not live") is retired only when this timestamp is real and shown, never removed first.

## 5. Affiliate tracking parameter plan

A real hand-off carries `AffiliateTrackingParams` (`clickId`, `campaignId`, optional `subId`) as part of the `ProviderHandoffUrlModel`. These identify the referral for commission accounting only — they must never carry traveler-identifying data (name, email, payment details), and must never be logged anywhere the traveler's search history could be reconstructed from them. `clickId` is generated per hand-off attempt, not per session, so one click cannot be correlated across multiple offers.

## 6. Provider handoff URL model

`ProviderHandoffUrlModel` is `{ baseUrl, providerOfferReference, tracking }`. The `providerOfferReference` is the provider's own id for the specific offer (from `NormalizedProviderOffer.providerOfferReference`) — GTAI never invents or rewrites a provider's reference. The real hand-off, when built, replaces `ProviderHandoffModal`'s "Close"-only interstitial with a real outbound link built from this model, opened the same way the current placeholder is reached (from the card's CTA), so the UI entry point does not need to change — only what it does once opened.

## 7. Redirect audit logging plan

Every real hand-off attempt logs a `ProviderHandoffAuditEntry`: `occurredAt`, `providerId`, `offerId`, `searchIntentKey` (the same canonical key `FlightResultsExperience` already computes for repository-fetch isolation — reused, not reinvented), and an `outcome` of `opened | redirected | cancelled | failed`. This is what makes "GTAI may earn a commission" (already stated in `dictionary.affiliate`) auditable rather than just a disclosure sentence.

## 8. Failure modes

A real adapter must distinguish `timeout`, `rateLimited`, `invalidResponse`, `noAvailability`, `authenticationFailed`, and `unknown` (`ProviderFailureReason`) — never collapse all of these into one generic error state. `rateLimited` and `timeout` are retryable with backoff; `noAvailability` is not an error at all and should present as an empty/partial result, not the Results page's existing error state; `authenticationFailed` and `invalidResponse` are configuration problems that must alert GTAI's own operators, not the traveler.

## 9. Rate limit and cache strategy

Real providers will rate-limit per-key search volume. The plan: cache a provider's raw response per `(providerId, normalized search key, short TTL)` so repeated identical searches (a page reload, a shared link, a filter/sort change — none of which should ever refetch per the existing repository-fetch isolation this codebase already guarantees for the demonstration repository) don't re-hit the provider. The TTL must be short enough that `PriceFreshness.observedAt` stays meaningfully recent, and any cache hit must still carry its true original `observedAt`, never a rewritten "now."

## 10. Compliance and disclosure boundary

Every provider relationship requires: an official API agreement or an approved affiliate program (per `docs/product/ROADMAP.md` project rule 6 — no unauthorized scraping, no circumvention of provider protections), a real, provider-specific version of the existing `affiliate` disclosure copy (naming the actual provider, not "a partner site"), and continued honesty about what GTAI does and doesn't do — GTAI compares and refers; it is never the merchant of record.

## 11. No booking or payment in GTAI core — explicit boundary

GTAI's own codebase will **never** collect payment details, hold a booking record, or complete a purchase. A real integration only ever hands the traveler off to the provider's own site to finish the transaction there. `ProviderHandoffModal`'s current placeholder copy ("Booking and payment are not handled in this build") is the honest statement of where that boundary sits today; the real version states the same boundary permanently, not just "not yet."

## 12. Status

Real providers remain **pending** (V3 — Provider Adapter Integration, not started). Nothing in this document is wired into the running application; `provider-adapter-types.ts` is imported by nothing outside itself.
