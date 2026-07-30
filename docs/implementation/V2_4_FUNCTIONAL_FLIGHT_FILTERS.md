# GTAI V2.4 — Functional Flight Filters

**Status:** Frozen locally (uncommitted at the base checkpoint below; frozen by its own commit — see the repository's own history for that SHA)
**Base checkpoint:** `5df2382668aaac0bec925995e73085f221324cc9` (V2.3 — Functional Flight Search Intent and Results Foundation, frozen)
**Specification:** `docs/reference/06_FLIGHT_FILTERS.md`

---

## 1. Scope implemented

| Capability                                                         | State |
| ------------------------------------------------------------------ | ----- |
| Provider-independent filter model, separate from Search Intent     | Done  |
| Stops, Price, Carrier, Outbound departure time, Duration, Airports | Done  |
| Desktop Filter Sidebar                                             | Done  |
| Mobile/Tablet Filter Sheet with draft state                        | Done  |
| Applied-filter chips and Clear all                                 | Done  |
| Deterministic, contextual facet counts                             | Done  |
| Sort moved into the Results view-state URL                         | Done  |
| Repository-fetch isolation from filter/sort parameters             | Done  |
| Filtered result count and filter-aware empty state                 | Done  |
| English, French, Persian, Arabic, full RTL                         | Done  |

## 2. Architecture

```
src/features/flights/filters/
  flight-filter-types.ts        FlightFilterState, ResultsViewState, enums
  flight-filter-application.ts  offer classification + the one matching predicate
  flight-filter-facets.ts       bounds, option lists, contextual facet counts
  flight-filter-url.ts          Results view-state URL contract, parse, sanitize, serialize
  flight-filter-formatting.ts   Stops/Departure-time labels, "Up to X" phrases

src/components/flights/filters/
  FlightFilters.tsx        orchestrator: bounds/facets/chips, composes the three below
  FlightFilterSidebar.tsx   Desktop, immediate commit
  FlightFilterSheet.tsx     Mobile/Tablet, draft + Cancel/Apply, built on DrawerShell
  FlightFilterGroups.tsx    the six filter groups' markup, shared by both surfaces
  FilterSection.tsx         fieldset/legend wrapper + one checkbox row
  RangeFilterControl.tsx    native range input, commit-on-release/keyup/blur

scripts/verify-filters.ts  deterministic checks (npm run verify:filters)
```

`FlightResultsExperience.tsx` was extended, not rewritten into: it still owns parsing/fetching the Search Intent, now also parses and sanitizes the Results view-state and computes `applyFilters` → `sortOffers`, then renders `<FlightFilters>` around the cards. None of the filter matching, URL parsing/serialization, facet computation or filter-specific rendering lives in that file.

`DrawerShell.tsx` gained one additive `footer?: ReactNode` prop (rendered outside the scrollable body, with safe-area padding) so the Sheet's Clear all / Cancel / Apply row stays reachable — the existing mobile navigation drawer is unaffected and unchanged otherwise.

## 3. Repository-fetch isolation

The fetch effect previously keyed on the raw query string. It now keys on a canonically re-serialized Search Intent (`serializeSearchIntent(intent).toString()`), the retry token, and the dev-only `__devScenario` value — never on `paramsString` directly. The intent object it fetches with is held in a small piece of state that only changes identity when that canonical key changes (mirroring the render-time "adjust state" pattern V2.3 already used to reset Sort on a search change), so a filter or sort commit — which only ever changes other query parameters — provably cannot retrigger the effect. Confirmed live: toggling a Stops checkbox updates the URL and the visible cards with no loading skeleton and no change in offer ids.

## 4. Filter semantics notes

- **Stops** classify by the worst-case direction (`max` of all itineraries' `stopCount`), matching the spec's round-trip example exactly.
- **Duration** checks every itinerary individually (`itinerary.durationMinutes <= max`), never the combined round-trip total — a round trip with a 3h50m outbound and a 5h50m inbound is not treated as an 9h40m single value.
- **Airports** are read from the _outbound_ itinerary only (first segment origin, last segment destination); a group exposing only one option in the current result set is omitted, and the whole Airports section disappears if both groups would be.
- **Carrier** filters strictly by `validatingCarrierId`; `provider` is never read by any filter predicate.

## 5. Facet counts

`computeFacetCounts` applies every filter dimension _except_ the one being counted, then counts by option — confirmed live: with Stops=Direct active, the Carrier and Departure-time counts narrowed to just the one surviving offer's values, while the Stops counts themselves stayed at their un-narrowed totals (1/7/4), matching the "excludes its own dimension" requirement exactly.

## 6. Corrections made while building

- **Checkbox accessible names ran the label and count together** (`Direct1`, `1 stop7`) because the label `<span>` and the count `<span>` were adjacent JSX elements with no whitespace between them, and a `<label>`'s accessible name concatenates all its text content. Fixed by adding a leading space and parenthesizing the count (`Direct (1)`), which reads correctly both visually and to assistive tech.
- **A range input's reported `.value` does not always land exactly on `max`** when `(max - min)` is not a multiple of `step` — a well-known platform behavior (the browser reaches `min + n·step` closest to `max`, though the true `max` is still reachable by dragging to the end or pressing End). `aria-valuenow`/`aria-valuetext` are computed from this component's own `local` state, not read back from the DOM, so the accessible value stays correct regardless.

## 7. Deterministic verification

`npm run verify:filters` — **134/134 checks pass** (required minimum: 60, expanded past 84 for the correction round in section 6a and past 127 for the no-op navigation guard in section 6b). Covers: default-filter pass-through; Stops classification and boundaries including the round-trip worst-case rule; Carrier OR-semantics; all four Departure-time bucket boundaries (00:00, 05:59/06:00, 11:59/12:00, 17:59/18:00, 23:59); inclusive Price and Duration maxima, including the round-trip both-directions rule; Airport OR-semantics from the outbound itinerary; AND-across-dimensions; filtering never mutating offers or changing identity; sorting after filtering for all three sort options; Best-score inputs unchanged by filtering; empty result sets; canonical URL serialize/parse round trips including sort default-omission and restoration; every lenient-validation rule (unknown stop/carrier/airport dropped, invalid/negative/non-finite numeric values defaulted, duplicated filter field ignored completely); the strict Search Intent duplicate-parameter rule confirmed still unaffected; canonical serialization order and dedup; active filter-group counting (price/duration counted once each); facet counts respecting other filters while excluding their own dimension; zero-count enable/disable eligibility; airport-section omission; City-all-airports exposing multiple options; no provider or commission field participating anywhere in filtering; draft-vs-committed facet independence; numeric sanitization against dynamically-derived bounds (below-minimum and at-or-above-maximum both default to unrestricted); range-domain step alignment producing a reachable slider maximum; canonical URL cleanup preserving Search Intent params and Sort/valid filters; range-commit-dedup simulation; and localized singular-count digit formatting.

`npm run verify:locations` (42/42), `verify:dates` (66/66) and `verify:flights` (142/142) all still pass unchanged, confirming V2.1–V2.3 behavior is fully preserved.

## 6a. Correction round (pre-freeze)

Eight corrections applied before external review, each confirmed live in the browser (section 8) in addition to deterministic coverage:

1. **Mobile draft facet counts.** The Sheet previously read committed facet counts; it now computes its own from the draft (`draftFacetCounts = computeFacetCounts(offers, draft)`), so unchecking a box in the Sheet immediately re-enables options the committed Sidebar still shows as zero-count.
2. **Complete numeric sanitization.** A `maxPrice`/`maxDuration` below the observed minimum now defaults to unrestricted, matching the existing at-or-above-maximum rule.
3. **Canonical URL cleanup.** Once the offer set is ready, the Results URL is re-derived from sanitized state and corrected via `router.replace(..., { scroll: false })` if it differs — no history entry, no scroll, no refetch, and never applied to an invalid strict Search Intent.
4. **Range domain/step alignment.** `computeRangeSliderDomain` rounds the Duration slider's `max` up to the next reachable 15-minute step so "All options" is always reachable even when the observed range isn't evenly divisible by the step; the true observed maximum is still what filtering and serialization compare against.
5. **Range touch target.** Both range inputs are now a full 44px tall (track and thumb styled independently via pseudo-elements), in both the Sidebar and the Sheet, LTR and RTL.
6. **Deduplicated range commits.** `RangeFilterControl` now tracks the last-committed value and only calls `onCommit` when the local value has actually changed, so pointerup+blur or keyup+blur never produce two commits for one value change.
7. **Scroll position preserved.** Every Results view-state navigation (checkbox/range commits, Sort, chip removal, Clear all, Mobile Apply, and the canonical cleanup above) now uses `{ scroll: false }`.
8. **Localized singular count.** `filteredCount.one` now interpolates both `{filtered}` and `{total}` through the shared number formatter in all four locales; the Arabic dictionary's hardcoded Western `1` and Persian's hardcoded `۱` were replaced with the `{filtered}` token.

## 6b. Correction round 2 (pre-freeze)

Two further corrections, both confirmed live in the browser:

1. **The Mobile Sheet now closes for real when the viewport crosses into Desktop.** Its own markup was already `lg:hidden`, but that only ever hid it visually — its React `open` state (and with it, `DrawerShell`'s body-scroll lock and focus trap) previously survived a resize unless something explicitly closed it. `FlightFilters.tsx` now tracks `useMediaQuery("(min-width: 1024px)")` and, via the same render-time "adjust state" comparison already used elsewhere in this component tree, closes the Sheet and resets its draft the moment the viewport reaches 1024px while it's open. No filter is committed, no URL changes, and resizing back down does not reopen it; reopening it always starts from the current committed filters.
2. **A no-op Results view-state commit no longer navigates.** `commitViewState` in `FlightResultsExperience.tsx` now compares the canonical next query string against the current one and returns early when they're equal — covering Mobile Apply with no changes, and any control that re-emits its own already-active value, from one shared guard rather than one per control. The Sheet still closes and focus still returns to the trigger on a no-op Apply; only the navigation itself is skipped.

## 8. Browser verification

Verified live across all four locales (`/en`, `/fr`, `/fa`, `/ar`) at 360×800, 390×844, 768×1024, 1024×768, 1280×800 and 1440×900:

Desktop Sidebar renders as an `aside` beside the result list at 1024px+ and is absent below it; the Mobile/Tablet Filters trigger shows the inverse. A Stops checkbox commits immediately, updates the URL, the visible cards, the facet counts and the filtered-count heading with no loading skeleton, and preserves scroll position. The Mobile Sheet reproduces and confirms the fix for Correction 1 directly (committed Stops=Direct leaves Aurora/Maple/Meridian at zero in the Sidebar; opening the Sheet and clearing Direct in the draft immediately restores their real counts); Cancel discards the draft with no URL change; Apply commits once. A stale/hand-edited URL (`maxPrice` and `maxDuration` below the observed minimum, an unknown carrier id, an unknown airport code) is canonicalized via `history.replaceState` (confirmed: Back skips directly to the pre-navigation entry, never landing on the stale URL) while Search Intent params and valid filters/Sort survive unchanged. The Duration range input's DOM `max` was confirmed at the computed step-aligned value (770, for an observed 425–763 range) and both range inputs measure 44px tall. Pointer, keyboard and blur commit paths were exercised directly on the Duration slider: a pointer click and a repeat click at the same position produced no duplicate `history.length` growth; two `ArrowRight` key presses produced exactly two entries for two distinct values; a subsequent blur with no further change added none. Arabic and Persian were both fully exercised at 360px (not just validated as dictionary JSON): the Sheet footer stacks Clear all/Cancel/Apply into full-width 44px rows with no overflow and no clipped text in both locales, the singular count reads "1 من 12 خيار توضيحي" in Arabic (Western digits, consistent with the rest of the Arabic UI) and "۱ از ۱۲ گزینه نمایشی" in Persian (Persian digits throughout), and the Sidebar renders correctly mirrored on the visual right in both. No horizontal overflow was found at any tested width in any locale, and no console errors were logged across the session. The Airport Selector and Date Picker on the search page were spot-checked for regressions and are unaffected.

**Correction round 2** — the breakpoint-close and no-op-navigation fixes were verified live at 768×1024 → 1024×768 in English, Persian and Arabic: opening the Sheet, checking a draft box (confirmed via the Sheet's own contextual counts), then resizing to 1024×768 leaves no `[role=dialog]` in the DOM, restores `document.body.style.overflow`, shows the Desktop Sidebar, leaves the URL and rendered offer ids unchanged, and shows no loading skeleton; resizing back to 768×1024 does not reopen the Sheet, and reopening it starts from the still-empty committed filters. The no-op guard was verified at 390×844: opening the Sheet and pressing Apply with no change closes it, returns focus to the "Filters" trigger, and leaves the URL and `history.length` byte-for-byte unchanged, while a real change through the same Sheet still produces exactly one new history entry and one URL change. On Desktop (1280×800), re-selecting the already-active Sort and blurring an untouched range input both leave the URL and `history.length` unchanged, while a real checkbox/range/Sort change still commits normally. Browser Back/Forward, Applied chips, Clear all, the filtered-empty state, and Search Intent's strict Invalid-state handling were all reconfirmed unaffected.

## 9. Known limitations

1. **Filters operate on the fixed demonstration offer set** — there is still no real provider, so a filter can only ever narrow what the local generator already produced.
2. **No saved filters or Local Storage persistence** — the URL is the only source of truth, by design.
3. **Duration and Price steps are demonstration-scale** (15 minutes, 1 currency unit) and not tied to any real fare-bucket granularity.
4. **Facet counts are recomputed on every render** from the complete offer set (memoized by offers + filters) — adequate at the current ~12-offer scale; not something intended to scale to a real provider's result size without further work.

## 10. Exclusions

Unchanged from the specification: real provider API or server-side filtering, real airline assets or filter data, an inbound-specific departure-time filter, separate outbound/inbound Stops filters, a baggage/refundable/aircraft/layover-airport filter, a price histogram, carbon emissions, fare families, the Flight Details route, affiliate redirect, booking, payment, price alerts, saved filters, Local Storage persistence, analytics, multi-city, whole-month search.
