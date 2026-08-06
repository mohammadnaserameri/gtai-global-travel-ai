# GTAI V1.2-G (partial) — Provider Integration Blueprint

**Module:** 07 of 07 — Flight Details and Affiliate Redirect.
**Status:** **Partially frozen.** Frozen: this blueprint and its type contract, plus the outbound _preview_ placeholder it describes the destination for (implemented in V2.5, corrected in V2.5.1 — frozen at `c711662a6ce51b607af9d95cbd395c131fd3fbd0`). The dedicated Flight Details route, which hosts a second copy of that preview, is implemented in V2.6 (`docs/reference/08_FLIGHT_DETAILS.md`). Pending: a real Provider Adapter, live inventory, and a real affiliate redirect. Booking and payment remain permanently outside GTAI core (section 11). A real provider adapter is **not** implemented anywhere in this codebase.
**Base checkpoints:** `83937ce933ba23ce1358176b37fc9f7e4da5da8f` (V2.4 — Functional Flight Filters, frozen) → `16606abe4dd33b41203a54c11b586f1325eab5f7` (V2.5 — Results Polish and Outbound Blueprint, frozen); corrected in V2.5.1.
**Type scaffolding:** `src/features/providers/provider-adapter-types.ts` — type-only, never imported by a runtime code path
**Superseded in part by V2.7:** the _runtime_ shape this document anticipated now exists as a working local implementation — see `docs/reference/09_PROVIDER_RUNTIME.md`. A trusted server-side registry, an adapter contract, orchestration with cancellation and per-provider timeouts, provider-output validation, canonical normalization, a typed failure taxonomy and a privacy-minimized audit model are all implemented and under deterministic test, driven by a **local deterministic adapter**. What remains pending here is unchanged and is the genuinely external part: a real provider API, credentials, live inventory, and a real affiliate redirect.
**Implementation record:** `docs/implementation/V2_5_FLIGHT_RESULTS_POLISH_AND_OUTBOUND_BLUEPRINT.md`

---

## 1. Purpose

This document is the forward-looking plan for connecting a **real** flight provider to GTAI — what V3 (Provider Adapter Integration, per `docs/product/ROADMAP.md`) must build. It is documentation and type scaffolding only: no adapter exists, no provider is contacted, and nothing described here changes GTAI's behavior today. The V2.5 outbound placeholder (`ProviderHandoffModal`) is the UI destination this plan eventually replaces with a real hand-off.

## 2. Provider adapter contract

A real integration implements `ProviderAdapter` (`provider-adapter-types.ts`): an `identity` (a provider id and display name — never a bare display name, so audit logs and disclosures can always name the actual provider), a `search(request)` returning a typed `ProviderSearchResult`, and a `normalize(raw, currency)` turning one provider's raw payload into GTAI's own `FlightOffer` shape. GTAI's ranking, filtering and card rendering all already operate on `FlightOffer` — a real adapter's entire job is producing that shape correctly and honestly; nothing downstream needs to change.

**Cancellation.** `ProviderSearchRequest` carries an optional `signal: AbortSignal`. A superseded search (the visitor edited their search before the previous one resolved) must be cancelled through that signal, exactly as `FlightResultsExperience`'s existing demonstration-repository fetch effect already does with `AbortController` — the adapter contract deliberately reuses that model rather than inventing a second one.

**Typed results, not thrown errors.** `search` resolves to a discriminated `ProviderSearchResult` — `{ ok: true, rawOffers, completedAt }` or `{ ok: false, failure }` — so a caller `switch`es on an explicit outcome instead of catching an untyped exception. A genuinely empty result, a cancellation, and a provider outage are three distinct, individually-handleable states, never one ambiguous empty array.

## 3. Offer normalization

`normalize` is the only place a provider's raw payload is ever read. It must produce a `FlightOffer` with `isDemonstration: false` and populate every field this codebase already treats as load-bearing: `rankingMetadata` (duration/stop totals used by Sort — never a provider's own "recommended" ordering), `validatingCarrierId`/`validatingCarrierName` (real IATA carrier data, replacing the fictional `aurora`/`maple`/`skyline`/`meridian` ids), and `baggage`/`fare` (read from the provider's actual fare rules, never defaulted to "included" or "refundable" for a better-looking card).

## 4. Price freshness and timestamp model

Every normalized offer carries a `PriceFreshness`: `observedAt` (the instant the provider actually quoted this price) and `expiresAt` (the provider's own stated validity window, or `null` if the provider doesn't declare one). The Results UI must render an explicit "price checked at HH:MM" or "may have changed" notice once real prices exist — the current demonstration disclosure ("prices are not live") is retired only when this timestamp is real and shown, never removed first.

## 5. Affiliate tracking parameter plan

A real hand-off carries `AffiliateTrackingParams` (`clickId`, `campaignId`, optional `subId`) as part of the `ProviderHandoffUrlModel`. These identify the referral for commission accounting only — they must never carry traveler-identifying data (name, email, payment details), and must never be logged anywhere the traveler's search history could be reconstructed from them. `clickId` is generated per hand-off attempt, not per session, so one click cannot be correlated across multiple offers.

## 6. Provider handoff URL model — trusted construction only

`ProviderHandoffUrlModel` is `{ providerId, providerOfferReference, tracking }`. It deliberately carries **no destination URL and no origin of its own**. An earlier draft of this blueprint modeled the destination as a `baseUrl: string` on the shared model; that was wrong, because it would let a value that ultimately originates in a raw provider response choose an unrestricted redirect origin — an open-redirect primitive baked straight into the contract. It has been removed.

Instead:

- `providerId` selects a **server-side, operator-configured** `TrustedProviderConfig`, which owns the single allowlisted origin for that provider. Only `https:` origins may be configured in production.
- A raw provider payload can never supply, extend, or override that origin. Provider data contributes only the opaque `providerOfferReference` (the provider's own id for the specific offer — GTAI never invents or rewrites it) and nothing that influences _where_ the hand-off points.
- A trusted URL builder (`TrustedHandoffUrlBuilder`) combines the model with the looked-up config. It must build the result with the `URL` / `URLSearchParams` APIs — never string concatenation — and must reject anything that is not the allowlisted host: other hosts, `javascript:`, `data:`, protocol-relative (`//host`) values, and URLs carrying embedded credentials.
- The fully-built destination is re-validated **immediately before navigation**, not only at construction time, so a value that passed construction can never be mutated into something else in between.

The real hand-off, when built, replaces `ProviderHandoffModal`'s preview-only interstitial with a real outbound link built this way, reached from the same card CTA — so the UI entry point does not change, only what it does once opened. No URL builder and no redirect exist in this codebase today; `TrustedHandoffUrlBuilder` is a type, not an implementation.

## 7. Redirect audit logging plan — privacy-safe correlation

Every real hand-off attempt logs a `ProviderHandoffAuditEntry`: `occurredAt`, `providerId`, `offerId`, `searchContextId`, and an `outcome` of `opened | redirected | cancelled | failed`.

`searchContextId` is a **randomly generated opaque identifier**, minted per search context. An earlier draft proposed writing the canonical Search Intent key here; that was wrong. That key contains the route, the travel dates and the traveler counts — writing it into an outbound commission log puts a traveler's itinerary directly into an operational log line. Hashing it is **not** an adequate substitute either: the search domain (a few thousand routes × a bounded date window × small traveler counts) is small enough to brute-force a hash back to the original search, so a hash of the canonical intent must not be treated as anonymous.

Requirements for this log:

- `searchContextId` is randomly/securely generated, never reversibly derived from origin, destination, dates or traveler counts.
- The canonical Search Intent query string never appears in an audit entry.
- No passenger identity and no payment information ever appears — GTAI holds neither (see section 11).
- Short, documented retention, and an access-controlled operational log rather than general application logging.
- Correlation back to a search happens only where genuinely required for support or commission auditing, through a separately access-controlled mapping — not by making the log line itself self-describing.

## 8. Failure modes

A real adapter must distinguish `cancelled`, `timeout`, `rateLimited`, `invalidResponse`, `noAvailability`, `authenticationFailed`, and `unknown` (`ProviderFailureReason`) — never collapse all of these into one generic error state. `cancelled` (a caller-initiated abort via `ProviderSearchRequest.signal`) is explicitly distinct from `timeout` — a search the visitor themselves superseded must never be reported as a provider being slow. `rateLimited` and `timeout` are retryable with backoff, and `rateLimited` may carry an optional `retryAfterMs` when the provider states one. `noAvailability` is not an error at all and should present as an empty/partial result, not the Results page's existing error state. `authenticationFailed` and `invalidResponse` are configuration problems that must alert GTAI's own operators. No raw technical failure detail is ever intended for customer display — the traveler sees GTAI's own localized state, never a provider's error text.

## 9. Rate limit and cache strategy

Real providers will rate-limit per-key search volume. The plan: cache a provider's raw response per `(providerId, normalized search key, short TTL)` so repeated identical searches (a page reload, a shared link, a filter/sort change — none of which should ever refetch per the existing repository-fetch isolation this codebase already guarantees for the demonstration repository) don't re-hit the provider. The TTL must be short enough that `PriceFreshness.observedAt` stays meaningfully recent, and any cache hit must still carry its true original `observedAt`, never a rewritten "now."

## 10. Compliance and disclosure boundary

Every provider relationship requires: an official API agreement or an approved affiliate program (per `docs/product/ROADMAP.md` project rule 6 — no unauthorized scraping, no circumvention of provider protections), a real, provider-specific version of the existing `affiliate` disclosure copy (naming the actual provider, not "a partner site"), and continued honesty about what GTAI does and doesn't do — GTAI compares and refers; it is never the merchant of record.

## 11. No booking or payment in GTAI core — explicit boundary

GTAI's own codebase will **never** collect payment details, hold a booking record, or complete a purchase. A real integration only ever hands the traveler off to the provider's own site to finish the transaction there. `ProviderHandoffModal`'s current placeholder copy ("Booking and payment are not handled in this build") is the honest statement of where that boundary sits today; the real version states the same boundary permanently, not just "not yet."

## 12. Status — partially frozen

Module 07 as a whole is **not** implemented. What is frozen, and what is not:

| Area                                                      | Status                                           |
| --------------------------------------------------------- | ------------------------------------------------ |
| This blueprint and its type contract                      | **Frozen** (V2.5, corrected in V2.5.1)           |
| Outbound **preview** placeholder (`ProviderHandoffModal`) | **Frozen** (V2.5, corrected in V2.5.1)           |
| Dedicated Flight Details route                            | **Implemented in V2.6** — `08_FLIGHT_DETAILS.md` |
| Real Provider Adapter                                     | Pending — V3, not started                        |
| Live inventory / real prices                              | Pending                                          |
| Real affiliate redirect                                   | Pending — V4                                     |
| Booking and payment                                       | Permanently outside GTAI core (section 11)       |

Nothing in this document is wired into the running application; `provider-adapter-types.ts` is imported by nothing outside itself, and no `TrustedHandoffUrlBuilder`, adapter or redirect exists.

---

## Status after V2.8-B

The blueprint's type scaffolding has been **superseded** by a working contract
layer under `src/server/flights/providers/external/`. That layer is exercised
by 305 deterministic checks rather than existing only as prose and unreferenced
types.

What has not changed: no provider is connected, no credential exists, no
external call is made, and no booking, payment or affiliate redirection is
implemented anywhere in GTAI.

The security and privacy positions this blueprint described are now enforced in
code:

- **Credentials** are opaque holders that redact on every stringification path,
  with a single greppable `revealSecret` call site.
- **Redaction** is allowlist-based, so it fails closed on an unrecognized field
  rather than publishing it.
- **Audit** records cannot carry a trip: the identifying fields are absent from
  the type, not filtered at write time.
- **Outbound URLs** are built with `URL`/`URLSearchParams` against an
  operator-configured allowlisted origin, and the _finished_ URL is re-validated
  against that origin.

### Deployment and environment

V2.8-B requires **no environment variable**. `.env.example` remains fully
commented and documents no active provider credential.

When a provider is eventually configured, its credential is named by an
`ExternalProviderSecretReference` — a server-side variable name only. A
`NEXT_PUBLIC_*` name is refused structurally, because Next.js inlines that
prefix into the browser bundle: such a value is already published, and resolving
it would launder a public string into something the code treats as confidential.

Setting those variables moves a provider to `configured` and no further.
Activation additionally requires an explicit server-side operator directive.
