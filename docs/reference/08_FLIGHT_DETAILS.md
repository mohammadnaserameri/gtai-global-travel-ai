# GTAI V1.2-G (partial) — Flight Details

**Module:** 07 of 07 — the _Flight Details_ half. The affiliate/provider half is specified separately in `07_PROVIDER_INTEGRATION_BLUEPRINT.md`.
**Status:** Implemented in V2.6 — Functional Flight Details.
**Base checkpoint:** `c711662a6ce51b607af9d95cbd395c131fd3fbd0` (V2.5.1 — Results Truthfulness and Provider Blueprint Corrections, frozen)
**Implementation record:** `docs/implementation/V2_6_FUNCTIONAL_FLIGHT_DETAILS.md`

---

## 1. What this module covers

A dedicated, shareable page for one selected demonstration offer: its full outbound and return itineraries, every segment and connection, airport-local times with signed day offsets, the fare and baggage conditions the model actually carries, the demonstration price, a truthful highlight where one applies, and the provider hand-off _preview_. It does **not** cover a real provider, live inventory, a real redirect, booking or payment — see section 12.

## 2. Route contract

```
/{locale}/flights/results/{offerId}?{the exact Results query string}
```

The Details URL is a Results URL plus one path segment. It introduces **no new query parameters at all** — no `returnTo`, no serialized intent, no provider reference. That absence is the security property: because there is never a caller-supplied destination, "Back to results" is always _reconstructed_ from validated inputs rather than followed.

| Part          | Source                           | Validation                                       |
| ------------- | -------------------------------- | ------------------------------------------------ |
| `{locale}`    | route segment                    | existing locale routing                          |
| `{offerId}`   | route segment                    | `isValidOfferId` (section 3) — strict, pre-fetch |
| Search Intent | query (`v`, `trip`, `origin`, …) | **strict**, unchanged from V2.3                  |
| View state    | query (`sort`, `stops`, …)       | **lenient + offer-aware**, unchanged from V2.4   |

The page is `noindex, nofollow`: a locally generated demo itinerary for one specific search has nothing worth indexing, and a crawled copy could be mistaken for a real fare.

**Canonicalization.** Once the offer set is available, the raw view state is parsed, sanitized against those offers, and rebuilt into a canonical Details URL. If it differs from the current address, the page issues one `router.replace(canonicalUrl, { scroll: false })` — no history entry, no scroll jump, no refetch (the fetch key does not contain view state), and no loading flash. Unknown carriers and airport codes, duplicate CSV entries, and out-of-range numeric values are dropped; the offer id and Search Intent are never altered. Canonicalization is skipped entirely while the Search Intent is malformed or the offer id is invalid, so a broken link is never rewritten into a plausible-looking one. Because the comparison is against the already-canonical form, the replace converges after a single pass.

**Filter bounds are shared with Results, and "unknown" is a first-class state.** The maxima that decide whether `maxPrice` / `maxDuration` are "unrestricted" come from one shared helper, `serializationBoundsForOffers`, and are typed `number | null` (`ResultsSerializationBounds`):

| Bounds   | Meaning                             | Numeric filter policy                                                |
| -------- | ----------------------------------- | -------------------------------------------------------------------- |
| `number` | the complete offer set is available | offer-aware: omit a value at or above the maximum, keep one below it |
| `null`   | no offer set is available here      | format-level: keep the parsed value verbatim                         |

Duration means _maximum duration per direction_, so its domain is each itinerary's own `durationMinutes` — not the combined round-trip total, which is roughly twice as large. Using the combined figure would let a stale `maxDuration` above the true per-direction ceiling survive on Details while Results correctly dropped it: one parameter, two meanings.

The `null` case exists because the serializer's rule is `value < maximum`. A numeric zero used as a stand-in for "no offers" silently drops **every** non-negative value — which is precisely what the states that cannot fetch (invalid offer id, repository error, empty result, any pre-fetch render) would hand it. Those states now pass unknown bounds, so `?sort=cheapest&maxPrice=1000&maxDuration=600` survives intact on "Back to results", and **Results** applies the offer-aware sanitization once its own set resolves — dropping the value there if it turns out to be out of range. No sentinel is used to represent the unknown state and none is ever written into a URL: no `Infinity`, no `-Infinity`, no `Number.MAX_SAFE_INTEGER`, no literal `null`. The distinction lives in the type, so a caller cannot forget it.

## 3. Offer-ID policy

`isValidOfferId` (`flight-details-url.ts`) is the single, pure validator:

- Anchored pattern `^demo-[0-9a-z]{1,12}-\d{1,4}$` — exactly the shape `DemoFlightOfferRepository` produces.
- Hard length cap (64) before anything else.
- Rejects: empty values, overlong values, uppercase, whitespace, `/`, `..`, percent-encoded separators (`%2F`, `%2E`), full URLs, and any arbitrary external reference.
- Next.js having already percent-decoded the segment is explicitly **not** treated as evidence of safety — a decoded `../` is still `../`, and still fails.
- The id is a GTAI demonstration identifier only. It is never treated as, or forwarded as, a provider reference.

An invalid id renders the Invalid Option state **without generating offers at all**. Validity is a precondition of the fetch, not merely of the render: the repository fetch key is `null` while the id is invalid, and the fetch effect returns before constructing either the repository or an `AbortController`. Rendering the invalid branch first would not be sufficient on its own — React runs effects after rendering, so the guard has to live in the effect and in the key. Flipping a valid id to an invalid one runs the effect's cleanup and aborts any obsolete in-flight search.

## 4. Details resolution pipeline

`resolveFlightDetails` (`flight-details-resolution.ts`) runs, in order:

1. Validate locale (routing).
2. Validate offer-ID format — reject before any generation.
3. Parse and strictly validate the Search Intent.
4. Generate the same deterministic complete offer set (caller-owned fetch).
5. Parse the Results view state.
6. Sanitize that view state against the complete offer set.
7. Apply filters.
8. Apply sort.
9. Recompute highlights from the **displayed** set.
10. Resolve the path id against the complete set, then the displayed set.
11. Render the selected offer.

As of **V2.7** the offer set reaching step 4 has already passed intent-aware validation on both sides of the API boundary, so resolution can assume each offer genuinely answers this Search Intent and is internally consistent — the id it resolves against belongs to an offer whose route, dates, cabin, durations and totals all agree. An offer failing that check never arrives; its whole provider response is rejected upstream.

The boundary-integrity round extends what this page may assume. Each segment's **airport-local date and time are its own UTC epoch read in that airport's zone** — the departure clock at the origin, the arrival clock at the destination — so the timeline cannot display an instant the data does not support, and the ± day-offset badges are derived from values that have been proved consistent. Every airport shown, including every connection, **exists in the GTAI location directory**, so no segment or layover can name a code the project cannot resolve. Round trips satisfy a **single shared turnaround minimum** that the generator and the validator both read from one policy module, so an inbound leg can never appear to depart implausibly soon after the outbound arrives. And every carrier name, `DEMO-<mark>-<number>` flight number, validating carrier and booking provider comes from the **shared demonstration identity catalog**, checked as pairs — a mark belonging to another carrier is rejected — so no real airline or agency name can reach the segment cards or the provider hand-off preview.

Offers are never regenerated from Sort or Filter state; those only narrow and reorder an existing set. Steps 5–9 are literally the same functions the Results page calls, so Details always describes an offer exactly as the list it was opened from did.

**Repository-fetch isolation.** The fetch key is `serializeSearchIntent(intent) # retryToken # devScenario` — nothing else. It excludes the offer id, Sort, Filters, and every piece of Details UI state (timeline disclosure, provider preview). Opening details or toggling the preview therefore cannot regenerate offers.

As of **V2.7** the repository behind that key is `ApiFlightOfferRepository`, which posts to the internal `POST /api/flights/search` endpoint; offer generation happens in the server-side provider runtime rather than in the browser (see `docs/reference/09_PROVIDER_RUNTIME.md`). Nothing on this page changed as a result: the same normalized Search Intent produces the same deterministic offer ids, the fetch key is unchanged, the invalid-offer-id no-fetch gate now prevents a _network request_ rather than an in-process generation, and every state, canonicalization and Back-URL rule described above behaves identically.

## 5. Selected-offer states

| State                   | Meaning                                                    | Actions                                                       |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| **Invalid Search**      | Search Intent missing/invalid/duplicated                   | Edit search (only)                                            |
| **Invalid Offer ID**    | Path segment fails `isValidOfferId`                        | Return to results · Edit search                               |
| **Option Not Found**    | Format valid, but no generated offer has that id           | Return to results · Edit search                               |
| **Excluded by Filters** | Offer exists in the complete set but not the displayed set | **Clear filters and view this option** · Return · Edit search |
| **Repository Error**    | The demonstration repository failed                        | Retry · Return to results · Edit search                       |

"Excluded by filters" is deliberately distinct from "not found": one means _your filters hide it_, the other means _it does not exist_. Conflating them would tell the visitor something false.

**Clear filters and view this option** removes only the Results _filter_ parameters, preserves the Search Intent and the offer id, and resets Sort to the default so the resulting address is fully canonical. It is built by `buildClearedFiltersDetailsUrl` — never from an arbitrary return URL.

**Invalid Search offers exactly one action.** When the Search Intent itself is unusable there is no valid Results context to return to, so the state links only to the localized `/flights` search page. Offering "Return to results" beside "Edit search" would either point at the same destination under two different promises or claim a Results view that cannot be reconstructed. The other four states do have a valid Search Intent, so their "Return to flight results" action is real.

**Back to results is offer-aware where it can be, and lossless where it cannot.** In the Ready and Excluded-by-Filters states the return URL is built from the sanitized, offer-aware view state, so it matches what Results will actually show. In the states where offers are unavailable (Invalid Search, Invalid Offer ID, Repository Error, Empty result, and any pre-fetch render), it preserves the safely parsed format-level view state — including both numeric filters — and makes no offer-aware claim about it. Sort and the enum/CSV filters were already preserved this way; the numeric filters now are too.

**Partial provider coverage (V2.7).** Details receives the same `coverage` value Results does. When it is `partial`, the page shows the same localized reduced-coverage alert beside the standing disclosure — the offer itself is fully described, but whether it was the best of everything is genuinely unknown. And when the selected offer is _absent_ under partial coverage, the definitive **Option Not Found** state is not rendered: “could not be found” is a claim that only holds when every source answered. A truthful “could not be verified” state appears instead, offering Retry and Return to results. Excluded-by-Filters is unaffected — it applies when the offer is present in the returned set and hidden only by the current filters.

Every state — including loading — exposes exactly one `h1`. The repository-error heading is focused once on mount (not on every re-render) and carries `role="alert"`; the routine explanations do not.

## 6. Page hierarchy

Global header → main → Back to results → demonstration disclosure → `h1` "Flight details" → route/trip summary → outbound itinerary → return itinerary (round trip) → fare and baggage → price summary → highlight (when truthfully applicable) → provider hand-off preview → affiliate disclosure → footer. No marketing hero.

## 7. Itinerary semantics

Each direction is a `<section>` with an `h2` ("Outbound" / "Return"), a compact overview line (departure/arrival local time + code, signed day offset, total duration, direct/1 stop/N stops), and then the segment timeline under an `h3`.

The timeline is **one `<ol>`** interleaving segments and connections in real journey order — segment, layover, segment, … — so the reading order matches the trip. Connections sit between the flights they join rather than in a separate block.

Each segment shows: origin/destination airport name and IATA, local departure and arrival date/time, signed day offset, duration, the demonstration flight identifier, the fictional operating carrier, the localized demonstration aircraft category, and the cabin class.

Each layover shows: airport name, IATA code, and duration. Nothing else. There is deliberately **no** terminal, gate, check-in desk, minimum-connection-time, seat map, real flight number, live status or on-time claim — none of it exists in the model, and inventing it would be fabricated operational data.

Outbound always precedes Return in the DOM. Under RTL the layout mirrors visually while the document order stays chronological.

**Timeline disclosure.** The "Show / Hide details" toggle carries `aria-expanded` and `aria-controls` pointing at a stable region id. That region is always rendered and always keeps the same id — collapsing it sets `hidden` rather than unmounting it — so `aria-controls` never dangles. The region is `aria-labelledby` the itinerary-overview heading, which gives assistive technology the same relationship a sighted reader gets from the layout.

## 8. Time-zone truthfulness

Reuses the existing UTC + airport-local architecture unchanged:

- Chronology comparisons use stored `epochMinutes`, never wall-clock strings across zones.
- Each displayed time is the local time already derived for _that_ airport.
- Signed day offsets support −1, 0 (rendered as nothing), +1 and +2 or more, computed from the two local dates.
- Persian and Arabic stay **Gregorian**, matching the calendar the dates were chosen on.
- Codes, times and identifiers are `<bdi dir="ltr">`; localized names are `<bdi dir="auto">`; day offsets sit outside the code/time isolate.
- A single concise notice states "Times are shown in each airport's local time." No user-time-zone conversion is offered in V2.6.

## 9. Fare and baggage scope

Only fields `FlightOffer` genuinely carries: cabin class, carry-on included, checked bag included/not included, refundable/non-refundable, changes permitted/not permitted. Rendered as a definition list with text-carried meaning (icons are decorative, never the sole signal).

Explicitly **not** shown, because none of it is modelled: baggage weight or dimensions, change or cancellation fees, fare-brand names, seat-selection fees, meal inclusion, lounge access. A closing notice states this limitation outright rather than leaving the omission ambiguous.

## 10. Price scope

The demonstration total, the per-traveler amount, the chargeable traveler count and the currency — nothing more. `Intl` currency formatting; locale number formatting for counts. The chargeable count mirrors the repository's own rule (adults + children + infants in seat), so the per-traveler figure always reconciles with the total.

No tax/fee/surcharge/commission breakdown, no crossed-out price, no discount or savings percentage, no urgency or scarcity language, no live-fare wording. A closing notice says the model contains only a total and a per-traveler amount.

## 11. Highlight, provider preview, accessibility and RTL

**Highlight.** Recomputed against the currently displayed set (V2.5.1 rules: global winners, no runner-up reassignment, ties award nothing). When present, the page shows the badge, the existing "Why this option?" explanation, a concise metric sentence, and the comparison scope ("compared against the N options currently shown"). The N is rendered through the shared `formatLocaleNumber`, so it uses the same digits as every other number on the page (Persian digits under `fa`, for example) rather than raw ASCII. When absent, the section is **omitted entirely** — there is no fallback badge.

**Provider preview.** Reuses `ProviderHandoffModal` unchanged. The trigger carries `aria-haspopup="dialog"`, `aria-expanded` and `aria-controls`; the modal keeps the focus trap, Escape, outside-click close, body-scroll lock and focus restoration to the exact trigger. It changes no URL, adds no history entry, performs no external navigation and issues zero network requests. It never displays an affiliate link, tracking identifier, `searchContextId`, raw provider reference or base URL.

**Accessibility.** Exactly one `h1` per state; sections labelled by their headings; the timeline is a real ordered list; every interactive target is at least 44px with a visible focus ring; "Back to results" and "View flight details" are real `<a>` links (open-in-new-tab works); no state announces more than it should.

**RTL.** Page direction flips; DOM chronology (origin → destination, outbound → return) never reverses; timeline connectors use logical properties. **Every** route separator on the page — the header route line, the itinerary overview, the airport-name row and each segment endpoint pair — is the shared `RouteArrow`, which mirrors under RTL; there are no hardcoded arrow characters left, so an arrow can never point the wrong way. Each endpoint of those rows sits in its own `<bdi dir="auto">`, so an English fallback airport name inside a Persian or Arabic page cannot drag the row's direction with it. Only codes, times and identifiers are LTR-isolated — a localized sentence is never forced LTR (for example "Flight {number}" isolates only the number, leaving پرواز / رحلة / Vol in page direction). English fallback airport names inside Persian/Arabic pages use `dir="auto"`.

## 12. Exclusions

Not implemented and not implied: real provider API or adapter, live inventory, live prices, real airline assets or identifiers, real flight status, terminal/gate data, seat maps, fare-brand APIs, real baggage allowances, affiliate redirect, commission tracking, booking, payment, account persistence, saved options, email or PDF itineraries, social sharing, maps, carbon emissions, AI recommendations, multi-city, whole-month search. Provider integration and a real redirect remain **pending**; booking and payment remain permanently outside GTAI core.

## Demonstration disclosure (V2.8-A)

Details renders the same shared `DemonstrationDataNotice` Results does, at `prominent` weight, positioned above the flight identity and the price so it is read before either. Its point list also names the airlines and booking providers as fictional demonstration identities.

The provider hand-off preview labels each name where it appears rather than only in its bullet list: the validating carrier is captioned as a fictional demonstration airline, and the booking provider is prefixed "Demonstration provider". Those are the two strings a visitor is most likely to read as real. The preview also opens with the shared notice at `compact` weight. It still opens nothing, changes no URL and issues no request.

Details is `noindex, nofollow, nocache` through the same shared helper Results uses, so both pages state one policy rather than two similar ones.

## Crawl policy correction (V2.8-A round 2)

Details is no longer disallowed in `robots.txt`, for the same reason Results is not: a blocked URL is a URL whose `noindex` nobody fetches. The page keeps `noindex, nofollow, nocache` plus the Google-specific directives through the shared `buildNonIndexableMetadata` helper, stays out of the sitemap, and remains `noindex` in every locale including unauthored fallbacks.

---

## V2.8-B — no change to Details

Details is unaffected by V2.8-B. It resolves an offer by id from a re-run
search against the internal same-origin API, and an invalid offer id still
produces zero search requests.

One V2.8-B decision is relevant here: external offer ids are **deterministic**
(`ext-<provider>-<hash>` over provider id and provider offer reference), not
random. Details depends on an id surviving a refetch, so a random id would break
resolution the first time a live provider was connected.

---

## V2.8-C behavior

Details still resolves only the current demonstration-offer identifiers. The
inactive Duffel contract does not add provider ID resolution, raw payloads,
booking, payment, order creation, or external redirects. Invalid IDs continue to
produce zero search requests.
