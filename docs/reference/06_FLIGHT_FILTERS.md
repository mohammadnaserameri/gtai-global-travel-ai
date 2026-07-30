# GTAI V1.2-F (partial) — Flight Filters

**Module:** 06 of 07 — Sorting was already specified alongside Results (`05_FLIGHT_RESULTS.md`); this document covers the Filters half.
**Status:** Implemented in V2.4 — Functional Flight Filters.
**Base checkpoint:** `5df2382668aaac0bec925995e73085f221324cc9` (V2.3 — Functional Flight Search Intent and Results Foundation, frozen)
**Implementation record:** `docs/implementation/V2_4_FUNCTIONAL_FLIGHT_FILTERS.md`

---

## 1. What this module covers

Filtering the already-generated V2.3 demonstration offer set by stops, price, carrier, outbound departure time, per-direction duration, and departure/arrival airport — with a Desktop Sidebar, a Mobile/Tablet Sheet, applied-filter chips, deterministic facet counts, and Sort moved into the same URL-driven view-state. It does **not** cover a filter that regenerates or refetches offers, a new provider dimension, or anything listed in section 10.

## 2. Filter model

`FlightFilterState` (`src/features/flights/filters/flight-filter-types.ts`) is provider-independent and entirely separate from `FlightSearchIntent`:

| Field                   | Type                                                          | Empty means                   |
| ----------------------- | ------------------------------------------------------------- | ----------------------------- |
| `stopCategories`        | `("direct" \| "oneStop" \| "twoPlusStops")[]`                 | no Stops restriction          |
| `carrierIds`            | `string[]`                                                    | all carriers                  |
| `departureTimeBuckets`  | `("earlyMorning" \| "morning" \| "afternoon" \| "evening")[]` | all departure times           |
| `maxTotalPrice`         | `number \| null`                                              | unrestricted (= observed max) |
| `maxDurationMinutes`    | `number \| null`                                              | unrestricted (= observed max) |
| `departureAirportCodes` | `string[]`                                                    | all departure airports        |
| `arrivalAirportCodes`   | `string[]`                                                    | all arrival airports          |

`ResultsViewState` pairs `filters` with `sort` (the existing `SortOption` from `flight-offer-ranking.ts`). The Search Intent identifies the requested trip; the view-state only ever controls how the already-fetched result set is displayed. They are never merged into one payload, and one is never inferred from the other.

## 3. Repository-fetch isolation

`FlightResultsExperience`'s fetch effect depends on a canonical re-serialization of the validated Search Intent (`serializeSearchIntent(intent).toString()`) plus the retry token and the dev-only `__devScenario` escape hatch — never on the raw query string. A filter or sort change only ever adds or changes other query parameters, so this key never changes, and the effect never re-runs. Filtering and sorting happen entirely in memory, in render, against the offers already in state: `applyFilters` → `sortOffers`, both pure and synchronous.

## 4. Filter semantics

- **Stops.** An offer's category is `max(itinerary.stopCount)` across all its itineraries — a direct outbound with a one-stop inbound is "1 stop". Multiple categories combine with OR; no selection means no restriction.
- **Price.** Maximum total price, inclusive, against the same `totalPrice` already shown on the card, in the Search Intent's currency. No FX conversion, no minimum, no histogram, no savings claim.
- **Carrier.** Filters by `validatingCarrierId` — the fictional internal id (`aurora`, `maple`, `skyline`, `meridian`), displayed with the same carrier name already used on the card. Provider never participates.
- **Outbound departure time.** Four buckets from the outbound itinerary's first segment, in that airport's local time: Early morning 00:00–05:59, Morning 06:00–11:59, Afternoon 12:00–17:59, Evening 18:00–23:59. The Return leg is not separately filterable in V2.4 — the section is labelled "Outbound departure time", never just "Flight time".
- **Duration.** Maximum duration per direction, inclusive. A one-way offer's single itinerary must qualify; a round trip's outbound **and** inbound must each individually qualify — the combined total is never compared.
- **Airports.** Two independent groups, built from the outbound itinerary only: Departure (first segment origin) and Arrival (last segment destination). Most useful for a City-all-airports search (e.g. Toronto exposing both YYZ and YTZ). A group with only one observed option is omitted; if both groups have only one option, the whole Airports section is omitted.

All six matching predicates live in `flight-filter-application.ts`; every dimension combines with the others via AND, values within one dimension via OR.

## 5. Filter application order

1. Parse and validate the Search Intent (unchanged from V2.3).
2. Fetch/generate the complete demonstration offer set (unchanged).
3. Parse `ResultsViewState` from the URL (`flight-filter-url.ts`).
4. Sanitize filter values against the complete offer set (`sanitizeFiltersAgainstOffers`) — this is also what protects a stale filter left over from a different search.
5. `applyFilters` — removes non-matching offers only; never touches identity, price, itinerary data or ranking metadata.
6. `sortOffers` on the filtered set.
7. Render the count, chips and cards.

## 6. Facet-count policy

Checkbox-style dimensions (Stops, Carriers, Departure time, both Airport groups) show a contextual count: computed by applying every _other_ active filter dimension except the one being counted (`computeFacetCounts`). A selected option with a zero count stays enabled (it must remain removable); an unselected zero-count option is disable-eligible. Price and Duration are ranges, not checkboxes, and have no facet counts — only bounds read fresh from the complete offer set (`priceBounds`, `durationBounds`). Facet computation is a pure, memoized function of the complete offers and the active filters; it never queries or regenerates the repository.

## 7. URL contract

A second, independent parameter set from the Search Intent's own (`search-intent-url.ts`):

```
&sort=cheapest&stops=direct,oneStop&carriers=aurora,maple
&departTime=morning,evening&maxPrice=850&maxDuration=480
&fromAirports=YYZ,YTZ&toAirports=LHR,LGW
```

| Param          | Meaning                               | Canonical form                            |
| -------------- | ------------------------------------- | ----------------------------------------- |
| `sort`         | `best` \| `cheapest` \| `fastest`     | omitted when `best`                       |
| `stops`        | comma list of stop categories         | fixed enum order, omitted when empty      |
| `carriers`     | comma list of carrier ids             | alphabetical, deduped, omitted when empty |
| `departTime`   | comma list of departure-time buckets  | fixed chronological order                 |
| `maxPrice`     | integer                               | omitted when it equals the observed max   |
| `maxDuration`  | integer minutes                       | omitted when it equals the observed max   |
| `fromAirports` | comma list of departure airport codes | alphabetical                              |
| `toAirports`   | comma list of arrival airport codes   | alphabetical                              |

Never localized text, never a coordinate, never a sensitive value. `buildResultsSearchParams` rebuilds the whole query string on every commit: every Search Intent parameter is copied over **exactly** (never re-derived), `__devScenario` is preserved only because it already exists outside the documented contract, and any other stray parameter — including a previous, now-stale filter key — is dropped.

## 8. Filter URL validation

Parsing is lenient and never invalidates an otherwise-valid Search Intent — the two parsers are entirely separate, and the strict Search Intent parser is unchanged from V2.3:

- invalid `sort` → `best`; unknown stop/time value → dropped; unknown carrier/airport → dropped once the offer set is known
- invalid, negative or non-finite `maxPrice`/`maxDuration` → treated as the default (unrestricted)
- a **duplicated** known filter parameter is ignored completely for that field (never "first value wins") — the field is simply treated as absent
- a duplicated **Search Intent** parameter is still rejected as invalid, exactly as V2.3 requires

## 9. Desktop, Mobile and accessibility

**Desktop Sidebar** (`FlightFilterSidebar.tsx`, ~1024px and up): an `aside` landmark beside the result list, `fieldset`/`legend` per group, sticky below the header without overlapping the footer. Checkbox changes commit to the URL immediately; range controls show local movement while dragging and commit once on pointer-up, key-up or blur — never on every intermediate tick.

**Mobile/Tablet Sheet** (`FlightFilterSheet.tsx`, below that breakpoint): reuses the existing `DrawerShell` (the same focus-trap/dismissable/body-scroll-lock pattern already used for the mobile navigation drawer), extended with an optional footer slot for Clear all / Cancel / Apply so those actions stay reachable while the filter groups scroll independently. The Sheet owns a local **draft** copy of the filters; Cancel discards it with no URL or visible change; Apply sanitizes the draft, commits the URL once, closes the Sheet and restores focus to the Filters trigger. Clear all inside the Sheet clears the draft only — the user must still Apply or Cancel. The trigger shows `Filters` or `Filters (N)`, N being the count of active filter _groups_ (max 7), never the number of individual checked values, and never counting Sort.

**Applied-filter chips** render above the result list whenever at least one filter is active: one chip per selected value (or the one active price/duration value), each with a real remove control, plus a single Clear all action — never a link under 44px.

**Accessibility**: every checkbox has a real associated label (including its count, parenthesized so the accessible name reads naturally, e.g. "Direct (1)"); sliders expose `aria-valuemin`/`max`/`now` and a localized `aria-valuetext` ("Up to CAD 850", or "All options" at the unrestricted end); the Sheet is `role="dialog" aria-modal="true"`; the trigger carries `aria-haspopup`/`aria-expanded`; every interactive control (checkbox row, chip remove, Clear all, Apply, Cancel, Filters trigger) is at least 44×44px. A Desktop checkbox change never moves focus to the Results heading — only a genuine repository-state transition does that.

## 10. RTL

The Sidebar's grid column order is physical in source (`[16rem 1fr]`) but CSS Grid places the first track at the inline-start, so it renders correctly on the visual right under `dir="rtl"` with no extra rule — confirmed live in Arabic. Fictional carrier names render in `<bdi dir="auto">`; airport codes in `<bdi dir="ltr">`; the active-filter count and every facet count use the shared locale-number formatter; no whole localized phrase is forced into one direction.

## 11. Correction round (pre-freeze)

- **Mobile facets use the draft.** The Sheet's facet counts are computed from the _draft_ filters (`computeFacetCounts(offers, draft)`), not the committed ones — the Desktop Sidebar's counts stay committed-derived. This keeps the two surfaces' counts independently correct: editing the draft recalculates the Sheet immediately, while Cancel/Apply is the only thing that can change what the Sidebar sees.
- **Numeric bounds outside the observed range are defaulted.** `sanitizeFiltersAgainstOffers` now treats a `maxPrice`/`maxDuration` value below the observed minimum the same as one at or above the observed maximum: both default to unrestricted (`null`), never a filter that could match nothing in the current offer set.
- **Results URLs are canonicalized once offers are ready.** After the complete offer set loads, the Results view-state is re-parsed, sanitized, and rebuilt; if that canonical query string differs from the current one, the URL is corrected via `router.replace(..., { scroll: false })` — no history entry, no scroll, no refetch. A malformed strict Search Intent is never "cleaned up" this way; that stays the Invalid Search state.
- **Range domains stay step-aligned.** Duration keeps its 15-minute step, but the slider's own `max` is rounded up to the next reachable step (`computeRangeSliderDomain`) so the "All options" end is always reachable even when the observed range isn't evenly divisible by the step. Filtering and URL serialization still compare against the true observed maximum, never the slider's rounded one.
- **Filter/Sort navigation preserves scroll position.** Every Results view-state change — Desktop checkbox/range commits, Sort, chip removal, Clear all, Mobile Apply, and the automatic canonicalization above — navigates with `{ scroll: false }`.
- **The Mobile Sheet closes for real when the viewport crosses into Desktop.** Its markup was already `lg:hidden`, but that only hid it visually — its `open` state, body-scroll lock and focus trap could all survive a resize. A `useMediaQuery("(min-width: 1024px)")` check now closes the Sheet (discarding its draft) the moment the viewport reaches the Desktop breakpoint while it's open; resizing back down does not reopen it, and reopening it always starts from the current committed filters.
- **A no-op Results view-state commit never navigates.** `commitViewState` compares the canonical next query string against the current one before calling `router.push`; an identical commit (e.g. Mobile Apply with no changes, or re-selecting the already-active Sort) closes the Sheet and restores focus as usual but adds no history entry and triggers no route work.

## 12. Exclusions

Not implemented, and not implied by this module: a real provider API or server-side filtering, an inbound-specific departure-time filter, separate outbound/inbound Stops filters, a baggage/refundable/aircraft/layover-airport filter, a price histogram, carbon emissions, fare families, saved filters, Local Storage persistence, or analytics. See `docs/implementation/V2_4_FUNCTIONAL_FLIGHT_FILTERS.md` for the complete list and current test coverage.
