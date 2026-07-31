# GTAI V2.5 — Flight Results Polish, Affiliate Outbound Placeholder, Provider Integration Blueprint

**Status:** **Module 07 is partially frozen** — this version freezes the Results polish, the truthful Highlight layer, the outbound _preview_ placeholder, and the provider integration blueprint/type contract. The dedicated Flight Details route, a real Provider Adapter, live inventory and a real affiliate redirect all remain **pending**; booking and payment remain permanently outside GTAI core.
**Base checkpoint:** `83937ce933ba23ce1358176b37fc9f7e4da5da8f` (V2.4 — Functional Flight Filters, frozen)
**V2.5 freeze commit:** `16606abe4dd33b41203a54c11b586f1325eab5f7`
**Corrected by:** V2.5.1 — Results Truthfulness and Provider Blueprint Corrections (see section 6b)
**Specification:** `docs/reference/06_FLIGHT_FILTERS.md` (unchanged), `docs/reference/07_PROVIDER_INTEGRATION_BLUEPRINT.md` (new)

---

## 1. Scope implemented

| Capability                                                                 | State                   |
| -------------------------------------------------------------------------- | ----------------------- |
| Result-card visual polish (highlight/demo badges, compact fare indicators) | Done                    |
| Deterministic, non-LLM "why this option" highlight layer                   | Done (corrected V2.5.1) |
| Affiliate outbound **preview** placeholder (local modal, no real redirect) | Done (corrected V2.5.1) |
| Provider integration blueprint (documentation + type scaffolding)          | Done (corrected V2.5.1) |
| Expanded deterministic verification (`verify:polish`)                      | Done                    |
| English, French, Persian, Arabic, full RTL                                 | Done                    |
| Dedicated Flight Details route                                             | Not started (pending)   |
| Real provider adapter, live inventory, real redirect                       | Not started (pending)   |
| Booking, payment                                                           | Permanently out of core |

## 2. Architecture

```
src/features/flights/
  flight-offer-highlights.ts     pure, deterministic per-offer "why this option" labels

src/features/providers/
  provider-adapter-types.ts      type-only scaffolding for a future real provider — never imported at runtime

src/components/flights/
  ResultCard.tsx                 polished: highlight badge, demo badge, compact fare/baggage badges, "Preview provider hand-off" CTA
  RouteArrow.tsx                 the shared chronological route separator (mirrors visually under RTL)
  ProviderHandoffModal.tsx       the outbound placeholder — a local ModalShell, no network call, no real link
  FlightResultsExperience.tsx    computes highlights from the filtered set, passes one per offer to ResultCard

scripts/verify-polish.ts         deterministic checks (npm run verify:polish)
```

`FlightResultsExperience.tsx` gained one new pure computation (`computeHighlights(filteredOffers)`) and one new prop passed to `ResultCard` — nothing about its Search Intent parsing, repository-fetch isolation, filter/sort application, or the V2.4 no-op navigation guard was touched. `ResultCard.tsx` gained the highlight/demo/fare badges, the "Why this option?" line, and the "Preview provider hand-off" CTA plus its modal — the existing "Review option"/"Show details" disclosure is unchanged.

## 3. Result-card polish

Every card now shows, without expanding "Show details": a highlight badge when the offer has one (`labels.highlights[kind].badge`), a "Demo offer" badge, and four compact fare/baggage badges (carry-on, checked bag, refundable, changeable) — all built from fields the card already had, so no new offer data was invented. The full expanded-detail baggage/fare text (V2.3/V2.4) is unchanged and still shown when "Show details" is opened. Price/duration/stops/departure-arrival layout, RTL mirroring, and accessibility (headings, `aria-expanded`, 44px targets) are all unchanged from V2.4.

## 4. Deterministic highlight layer

`computeHighlights` (`flight-offer-highlights.ts`) reads only `totalPrice`, `rankingMetadata` and the outbound departure time already on `FlightOffer` — never a model, a provider, or the system clock. Every category's true winner is computed exactly once, against the complete currently-displayed set — **never recomputed against whatever offers happen to remain** after a higher-priority label was assigned, which is what let V2.5's first pass hand "Better departure time" to a worse offer merely because the true winner had already been labeled "Cheapest" (corrected in V2.5.1 — see section 6a). At most one highlight per offer, in priority order **Cheapest → Fastest → Fewer stops → Better departure time → Balanced**; if a category's true winner already carries a higher-priority label, that category is simply left unawarded for this offer set — it is never handed to a runner-up. A category is only ever awarded when its true winner is unique — two offers tied on price, duration, stops, the departure tuple, or the Best score all leave that category unawarded, and the offer id is never consulted to break such a tie. Computed fresh from the currently _filtered_ set on every render, so a highlight always describes standing among what the visitor can actually see, and never depends on the array's order (verified directly — see `verify-polish.ts`). "Balanced" reuses the same transparent `bestScore` formula (price/duration/stops, no provider or commission input) that already powers Sort's "Best" option — it is not a new or different scoring model.

## 5. Affiliate outbound placeholder

`ProviderHandoffModal` opens from each card's "Preview provider hand-off" button. It renders the offer's carrier, route (as separately `<bdi dir="auto">`-isolated origin and destination around a mirroring `RouteArrow`, never one interpolated string) and price — all from already-loaded props, no fetch — inside a `ModalShell` (the same accessible, focus-trapped, body-scroll-locking dialog already used elsewhere), plus five disclosure points (`labels.outbound.points`) stating plainly: this is a demonstration hand-off, not a real redirect; the price is a demo offer, not a live fare; provider availability has not been checked; booking and payment are not handled in this build; a future version will connect real providers and affiliate redirects. Closing it (the only action available) returns to exactly the same Results page and URL — opening or closing it never navigates, never calls `fetch`/`XMLHttpRequest`, and never renders a real `<a>` link (all three confirmed by static source checks in `verify-polish.ts`, in addition to the live browser pass in section 8).

## 6. Provider integration blueprint

`docs/reference/07_PROVIDER_INTEGRATION_BLUEPRINT.md` is the forward-looking plan V3 (Provider Adapter Integration) must build against: the adapter contract, offer normalization rules, a price-freshness/timestamp model, an affiliate-tracking-parameter plan, a trusted provider handoff URL model, a privacy-safe redirect audit-logging plan, distinct failure modes, a rate-limit/cache strategy, and the compliance/disclosure and no-booking-in-core boundaries. `src/features/providers/provider-adapter-types.ts` gives that plan a typed shape (`ProviderAdapter`, `ProviderSearchResult`, `NormalizedProviderOffer`, `PriceFreshness`, `TrustedProviderConfig`, `ProviderHandoffUrlModel`, `TrustedHandoffUrlBuilder`, `ProviderHandoffAuditEntry`, `ProviderFailureReason`, …) — confirmed by `verify-polish.ts` to be imported by nothing outside itself; no runtime code path constructs, calls, or even references it.

## 6b. V2.5.1 corrections (Results Truthfulness and Provider Blueprint)

Seven corrections applied on top of the V2.5 freeze (`16606abe4dd33b41203a54c11b586f1325eab5f7`):

1. **Truthful global Highlight winners.** V2.5's first pass computed "Better departure time" and "Balanced" against the offers _remaining_ after higher-priority labels were assigned, which could hand a category to an inferior runner-up — e.g. an offer that was genuinely cheapest, fastest, fewest-stops _and_ best-departure would take "Cheapest," leaving a worse, later-departing offer falsely labeled "Better departure time." Every category's winner is now computed once against the complete displayed set; priority only decides which single label a multi-winning offer keeps, and a category whose true winner is already labeled is left **unawarded** rather than reassigned.
2. **Tie policy without id tiebreaks.** Every category requires a _unique_ winner on its user-facing metric. Offer id is no longer consulted anywhere in `computeHighlights` — it remains a Sort tiebreaker only. Tied price, duration, stops, departure tuple or Best score all leave that category unawarded rather than producing an arbitrary comparative claim.
3. **Truthful outbound copy.** The CTA/title/description changed from "View deal" / "Continue to provider (demonstration)" to **"Preview provider hand-off" / "Provider hand-off preview" / "This demonstration does not open a real partner site."** in all four locales — the placeholder previews what a hand-off would show; it does not continue to anything.
4. **Modal accessibility and bidi.** The CTA now carries `aria-haspopup="dialog"`, `aria-expanded`, and `aria-controls` pointing at the dialog's own stable id (`ModalShell` gained an optional `id`). The modal's route summary is no longer one interpolated string: origin and destination each render in their own `<bdi dir="auto">` around a shared `RouteArrow` that mirrors visually under RTL without reversing DOM chronology. `RouteArrow` was extracted from `ResultCard` so both surfaces share one implementation.
5. **Privacy-safe audit model.** `ProviderHandoffAuditEntry.searchIntentKey` → `searchContextId`: an opaque, randomly generated correlation id. The canonical Search Intent key contains route, dates and traveler counts and must never be written to an outbound commission log; a hash of it is explicitly _not_ treated as anonymous, since the search domain is small enough to brute-force.
6. **Trusted handoff URL construction.** Arbitrary `baseUrl` was removed from `ProviderHandoffUrlModel`. A hand-off now carries only `providerId`, `providerOfferReference` and tracking params; `providerId` selects a server-side, operator-configured `TrustedProviderConfig` owning the single allowlisted HTTPS origin, and a `TrustedHandoffUrlBuilder` (type only) combines them via the `URL`/`URLSearchParams` APIs, rejecting non-allowlisted hosts, `javascript:`/`data:`, protocol-relative values and embedded credentials, with re-validation immediately before navigation.
7. **Abortable, typed provider search.** `ProviderSearchRequest` gained an optional `AbortSignal`, and `ProviderAdapter.search` now returns a discriminated `ProviderSearchResult` (`{ok:true, rawOffers, completedAt}` | `{ok:false, failure}`). `ProviderFailureReason` gained `"cancelled"` (distinct from `"timeout"`) and `ProviderFailure` gained optional `retryAfterMs` for rate limiting.

Module 07's status was corrected from "frozen" to **partially frozen** across the roadmap, blueprint index, provider blueprint and this document.

## 7. Deterministic verification

`npm run verify:polish` — **51/51 checks pass**. Covers: `computeHighlights` requiring at least two offers to award anything; order-independence; the five-way priority order (an offer that is simultaneously cheapest and fastest is only ever labeled once, and "fastest" is never reassigned to a runner-up); tied dimensions never producing a false unique claim; the departure-time tiebreak (bucket rank, then earliest epoch); highlight computation never mutating the offer set; all four locales' new `demoOffer`/`highlights`/`outbound` dictionary keys present and non-empty; none of the new copy claiming real AI inference, live pricing, or a guarantee (regex-checked per locale); the outbound placeholder's source containing no `fetch`/`XMLHttpRequest`/`axios`/`window.location`/`target="_blank"` and no real `<a>` tag; the CTA carrying no external link; the provider-adapter type scaffolding being unreferenced by any runtime component; the V2.4 no-op navigation guard line still present verbatim; and the guard's underlying canonical-query-string primitive still behaving correctly (identical view-state stays a no-op, a changed one still differs).

`npm run verify:locations` (42/42), `verify:dates` (66/66), `verify:flights` (142/142) and `verify:filters` (134/134) all still pass unchanged, confirming V2.1–V2.4 behavior is fully preserved.

## 8. Browser verification

See the Final Report for this round for the exact live scenarios covered (English/Persian/Arabic desktop and mobile, the outbound placeholder, no-op safety, filters/sort, Back/Forward, and overflow checks at the required widths).

## 9. Known limitations

1. **Highlights operate on the fixed demonstration offer set** — there is still no real provider, so "Cheapest"/"Fastest"/etc. can only ever describe standing within what the local generator produced.
2. **No dedicated Flight Details route** — module 07's "Flight Details" half (a separate page for one offer) was not part of this round's analysis and remains unanalyzed.
3. **The outbound preview has one action (Close)** — it does not simulate a multi-step hand-off flow, since there is nothing real to hand off to yet.
4. **`provider-adapter-types.ts` is intentionally inert** — it exists so V3 has an agreed shape to build against, not as a preview of real behavior. `TrustedHandoffUrlBuilder` in particular is a _type_: the validation rules it documents (allowlisted origin, https-only, scheme/credential rejection, pre-navigation re-validation) are not enforced by any running code yet, because no code builds or follows a hand-off URL.
5. **The highlight priority order is a fixed design choice** (Cheapest > Fastest > Fewer stops > Better departure time > Balanced), not a configurable ranking — changing it is a product decision for a future round, not a bug.
6. **A category can legitimately go unawarded** — by design, when its true winner already holds a higher-priority label or when the metric is tied. A results page showing fewer highlights than categories is correct behavior, not a missing label.
7. **The departure-time preference is a fixed heuristic** (morning > afternoon > early morning > evening, then earliest epoch within the bucket) — it encodes an assumption about "typical daytime" travel, not a personalized preference.

## 10. Exclusions

Unchanged from the specification and explicitly out of scope for this round: a real provider API, real airline/booking assets, a real affiliate redirect, booking, payment, price alerts, the Flight Details route, saved filters, Local Storage persistence, analytics, multi-city, whole-month search.
