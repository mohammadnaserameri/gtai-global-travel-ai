# GTAI V2.5 — Flight Results Polish, Affiliate Outbound Placeholder, Provider Integration Blueprint

**Status:** Frozen locally (uncommitted at the base checkpoint below; frozen by its own commit — see the repository's own history for that SHA)
**Base checkpoint:** `83937ce933ba23ce1358176b37fc9f7e4da5da8f` (V2.4 — Functional Flight Filters, frozen)
**Specification:** `docs/reference/06_FLIGHT_FILTERS.md` (unchanged), `docs/reference/07_PROVIDER_INTEGRATION_BLUEPRINT.md` (new)

---

## 1. Scope implemented

| Capability                                                                 | State                   |
| -------------------------------------------------------------------------- | ----------------------- |
| Result-card visual polish (highlight/demo badges, compact fare indicators) | Done                    |
| Deterministic, non-LLM "why this option" highlight layer                   | Done                    |
| Affiliate outbound placeholder (local modal, no real redirect)             | Done                    |
| Provider integration blueprint (documentation + type scaffolding)          | Done                    |
| Expanded deterministic verification (`verify:polish`)                      | Done                    |
| English, French, Persian, Arabic, full RTL                                 | Done                    |
| Real provider adapter, real redirect, booking, payment                     | Not started (by design) |

## 2. Architecture

```
src/features/flights/
  flight-offer-highlights.ts     pure, deterministic per-offer "why this option" labels

src/features/providers/
  provider-adapter-types.ts      type-only scaffolding for a future real provider — never imported at runtime

src/components/flights/
  ResultCard.tsx                 polished: highlight badge, demo badge, compact fare/baggage badges, "View deal" CTA
  ProviderHandoffModal.tsx       the outbound placeholder — a local ModalShell, no network call, no real link
  FlightResultsExperience.tsx    computes highlights from the filtered set, passes one per offer to ResultCard

scripts/verify-polish.ts         deterministic checks (npm run verify:polish)
```

`FlightResultsExperience.tsx` gained one new pure computation (`computeHighlights(filteredOffers)`) and one new prop passed to `ResultCard` — nothing about its Search Intent parsing, repository-fetch isolation, filter/sort application, or the V2.4 no-op navigation guard was touched. `ResultCard.tsx` gained the highlight/demo/fare badges, the "Why this option?" line, and the "View deal" CTA plus its modal — the existing "Review option"/"Show details" disclosure is unchanged.

## 3. Result-card polish

Every card now shows, without expanding "Show details": a highlight badge when the offer has one (`labels.highlights[kind].badge`), a "Demo offer" badge, and four compact fare/baggage badges (carry-on, checked bag, refundable, changeable) — all built from fields the card already had, so no new offer data was invented. The full expanded-detail baggage/fare text (V2.3/V2.4) is unchanged and still shown when "Show details" is opened. Price/duration/stops/departure-arrival layout, RTL mirroring, and accessibility (headings, `aria-expanded`, 44px targets) are all unchanged from V2.4.

## 4. Deterministic highlight layer

`computeHighlights` (`flight-offer-highlights.ts`) reads only `totalPrice`, `rankingMetadata` and the outbound departure time already on `FlightOffer` — never a model, a provider, or the system clock. At most one highlight per offer, in priority order **Cheapest → Fastest → Fewer stops → Better departure time → Balanced**; an offer already claimed by a higher-priority label is never reconsidered for a lower one, and a dimension is only ever awarded to the offer that is _uniquely_ best on it — two offers tied for the lowest price get no "Cheapest" claim at all, rather than an arbitrary pick. Computed fresh from the currently _filtered_ set on every render, so a highlight always describes standing among what the visitor can actually see, and never depends on the array's order (verified directly — see `verify-polish.ts` check 3). "Balanced" reuses the same transparent `bestScore` formula (price/duration/stops, no provider or commission input) that already powers Sort's "Best" option — it is not a new or different scoring model.

## 5. Affiliate outbound placeholder

`ProviderHandoffModal` opens from each card's new "View deal" button. It renders the offer's carrier, route and price (from already-loaded props — no fetch) inside a `ModalShell` (the same accessible, focus-trapped, body-scroll-locking dialog already used elsewhere), plus five disclosure points (`labels.outbound.points`) stating plainly: this is a demonstration hand-off, not a real redirect; the price is a demo offer, not a live fare; provider availability has not been checked; booking and payment are not handled in this build; a future version will connect real providers and affiliate redirects. Closing it (the only action available) returns to exactly the same Results page and URL — opening or closing it never navigates, never calls `fetch`/`XMLHttpRequest`, and never renders a real `<a>` link (all three confirmed by static source checks in `verify-polish.ts`, in addition to the live browser pass in section 8).

## 6. Provider integration blueprint

`docs/reference/07_PROVIDER_INTEGRATION_BLUEPRINT.md` is the forward-looking plan V3 (Provider Adapter Integration) must build against: the adapter contract, offer normalization rules, a price-freshness/timestamp model, an affiliate-tracking-parameter plan, a provider handoff URL model, a redirect audit-logging plan, distinct failure modes, a rate-limit/cache strategy, and the compliance/disclosure and no-booking-in-core boundaries. `src/features/providers/provider-adapter-types.ts` gives that plan a typed shape (`ProviderAdapter`, `NormalizedProviderOffer`, `PriceFreshness`, `ProviderHandoffUrlModel`, `ProviderHandoffAuditEntry`, `ProviderFailureReason`, …) — confirmed by `verify-polish.ts` (check 25) to be imported by nothing outside itself; no runtime code path constructs, calls, or even references it.

## 7. Deterministic verification

`npm run verify:polish` — **51/51 checks pass**. Covers: `computeHighlights` requiring at least two offers to award anything; order-independence; the five-way priority order (an offer that is simultaneously cheapest and fastest is only ever labeled once, and "fastest" is never reassigned to a runner-up); tied dimensions never producing a false unique claim; the departure-time tiebreak (bucket rank, then earliest epoch); highlight computation never mutating the offer set; all four locales' new `demoOffer`/`highlights`/`outbound` dictionary keys present and non-empty; none of the new copy claiming real AI inference, live pricing, or a guarantee (regex-checked per locale); the outbound placeholder's source containing no `fetch`/`XMLHttpRequest`/`axios`/`window.location`/`target="_blank"` and no real `<a>` tag; the CTA carrying no external link; the provider-adapter type scaffolding being unreferenced by any runtime component; the V2.4 no-op navigation guard line still present verbatim; and the guard's underlying canonical-query-string primitive still behaving correctly (identical view-state stays a no-op, a changed one still differs).

`npm run verify:locations` (42/42), `verify:dates` (66/66), `verify:flights` (142/142) and `verify:filters` (134/134) all still pass unchanged, confirming V2.1–V2.4 behavior is fully preserved.

## 8. Browser verification

See the Final Report for this round for the exact live scenarios covered (English/Persian/Arabic desktop and mobile, the outbound placeholder, no-op safety, filters/sort, Back/Forward, and overflow checks at the required widths).

## 9. Known limitations

1. **Highlights operate on the fixed demonstration offer set** — there is still no real provider, so "Cheapest"/"Fastest"/etc. can only ever describe standing within what the local generator produced.
2. **No dedicated Flight Details route** — module 07's "Flight Details" half (a separate page for one offer) was not part of this round's analysis and remains unanalyzed.
3. **The outbound placeholder has one action (Close)** — it does not yet simulate a multi-step hand-off flow, since there is nothing real to hand off to yet.
4. **`provider-adapter-types.ts` is intentionally inert** — it exists so V3 has an agreed shape to build against, not as a preview of real behavior.
5. **The highlight priority order is a fixed design choice** (Cheapest > Fastest > Fewer stops > Better departure time > Balanced), not a configurable ranking — changing it is a product decision for a future round, not a bug.

## 10. Exclusions

Unchanged from the specification and explicitly out of scope for this round: a real provider API, real airline/booking assets, a real affiliate redirect, booking, payment, price alerts, the Flight Details route, saved filters, Local Storage persistence, analytics, multi-city, whole-month search.
