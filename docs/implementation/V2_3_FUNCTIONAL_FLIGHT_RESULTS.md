# GTAI V2.3 — Functional Flight Search Intent and Results Foundation

**Status:** Frozen locally
**Base checkpoint:** `bc1b295e9001a207b0f2e6971a7b219abc71b946` (V2.2.1 — Foundation Accessibility Polish, frozen)
**Specification:** `docs/reference/05_FLIGHT_RESULTS.md`

---

## 1. Scope implemented

| Capability                                              | State |
| ------------------------------------------------------- | ----- |
| Normalized, provider-independent Search Intent          | Done  |
| Safe, documented, shareable Results URL                 | Done  |
| Strict URL validation with a dedicated Invalid state    | Done  |
| Lenient restoration of the Flight Search form           | Done  |
| Deterministic, abortable demonstration offer repository | Done  |
| Best / Cheapest / Fastest sorting                       | Done  |
| Loading, empty, error and Everywhere states             | Done  |
| Result cards with progressive-disclosure details        | Done  |
| Functional Travelers and Cabin class selectors          | Done  |
| English, French, Persian, Arabic                        | Done  |
| RTL layout with LTR-isolated codes and times            | Done  |

## 2. Architecture

```
src/features/flights/
  search-intent-types.ts       FlightSearchIntent, LocationSnapshot, TravelerCounts
  search-intent-url.ts         param contract, parse, serialize, duplicate detection
  search-intent-validation.ts  strict + lenient parsers, buildSearchIntent, shared date policy
  location-overlap.ts          the one City/airport overlap policy
  airport-timezone.ts          IATA code -> IANA time zone resolver
  utc-timeline.ts              civil local time <-> UTC epoch minutes, via Intl only
  flight-offer-types.ts        FlightOffer, FlightItinerary, FlightSegment
  flight-offer-repository.ts   FlightOfferRepository interface, error type
  demo-flight-offer-repository.ts  deterministic generator + invariant assertions
  flight-offer-ranking.ts      Best / Cheapest / Fastest
  flight-offer-formatting.ts   duration, price, stop-count, day-offset, locale-number helpers

src/components/search/
  TravelersControl.tsx         adults/children/infants stepper popover

src/components/flights/
  FlightResultsExperience.tsx  state machine: parse → validate → fetch → render
  SearchSummary.tsx            compact route/date/traveler recap
  SortControl.tsx              Best/Cheapest/Fastest radios
  ResultCard.tsx                one offer, article + details disclosure
  ResultsLoadingSkeleton.tsx    the real loading state

src/app/[locale]/flights/results/page.tsx   the route
scripts/verify-flights.ts                   deterministic checks (npm run verify:flights)
```

Everything under `src/features/flights` is pure — no React, no browser API beyond `AbortSignal`/`DOMException`. Every cross-module import (`@/features/dates`, `@/features/locations`, `@/config/currencies`, `@/lib/currency`) was written **relative**, not aliased, matching the convention already established by `src/features/dates` and `src/features/locations`: a plain Node process (the verification script) cannot resolve the bundler-only `@/` alias, and this is the only way to keep offer generation testable outside Next.

## 3. Dependencies

**None added.** No date/PRNG/HTTP library. Determinism comes from a small local FNV-1a hash feeding a mulberry32 generator — both well-known, tiny, dependency-free algorithms implemented directly in `demo-flight-offer-repository.ts`.

## 4. Reused rather than duplicated

- `resolveLocationIds`, `TravelLocation` — the existing location repository resolves every id in a Search Intent; nothing here re-implements lookup.
- `isValidIsoDate`, `isAfter`, `createDateBounds`, `addDays` — the V2.2 date utilities, unchanged.
- `formatAmount` (`Intl.NumberFormat`) and `useRegion()`'s shared `currency` — no new currency or FX logic.
- `DropdownShell`, `IconButton`, `Card`, `Alert`, `Skeleton`, `AffiliateDisclosure`, `ButtonLink` — all pre-existing primitives; `TravelersControl` is a new composition of `DropdownShell` + `IconButton`, not a new popover implementation.
- `isValidTravelerCounts` is the **one** rule for traveler limits, called identically by the stepper UI and the URL validator — a count the form can produce is guaranteed to also parse.

## 5. Corrections made while building

- **Cabin values renamed**: `"premium"` → `"premiumEconomy"` (the only call site), so the internal enum matches the URL contract and the dictionary's `search.options.cabin` keys exactly — no translation lookup needed at the boundary.
- **React Compiler rule (`react-hooks/set-state-in-effect`)**: the initial Results state machine called `setState` synchronously at the top of two effect bodies. Fixed by (a) resetting the sort during render when the search key changes — React's documented pattern for adjusting state from a changing value — and (b) tagging every fetch result with the exact `paramsString#retryToken` it answers, so the effect's only `setState` calls are inside genuine `.then`/`.catch` callbacks and a stale result is simply ignored during render rather than needing an explicit reset.
- **`URLSearchParams` vs. Next's `searchParams` record**: Next's Server Component prop is a plain object where a repeated key becomes an array. `rawSearchIntentParamsFromRecord` reads only the first entry per key, matching `URLSearchParams.get`'s single-value contract, so a duplicated parameter can never smuggle a second value past validation on the server-side restoration path.

## 5b. External-review correction round

A pre-freeze review of the first V2.3 pass found several real defects, corrected as follows:

- **Location overlap.** Only literal id equality was rejected, so `city-ymq` → `airport-yul` (its own member airport) passed validation and could generate a same-airport itinerary. Fixed with one shared `locationsOverlapForFlightSearch`, used by the form, the strict URL validator and `buildSearchIntent`.
- **Layover selection with replacement** could pick the same hub twice in a two-stop itinerary (e.g. `FRA → FRA`). Fixed with a without-replacement draw (`pickDistinct`), which also guarantees route continuity by construction.
- **Local time was not real local time.** The first pass added elapsed minutes directly to the origin wall clock and mislabeled the result as the destination's local time — never a valid cross-timezone calculation. Rebuilt on a genuine UTC timeline: every instant is `epochMinutes`, resolved per airport from a new IATA → IANA time zone map, converted with `Intl.DateTimeFormat` only (no library). A signed day-offset formatter replaced the old boolean "+1 day" flag. **A real bug was found in the first version of this fix during verification** — the offset-correction loop compared against the original guess instead of the current estimate, so a second correction pass could partially undo the first; confirmed and fixed against independently computed Toronto/London/Tehran conversions, including a DST transition date.
- **Date bounds were incomplete.** Only departure was ever checked against the 12-month window; a return date could be arbitrarily far in the future. `buildSearchIntent` also skipped several checks it claimed to perform. One shared `validateFlightDatePair` now bounds-checks both dates identically everywhere.
- **Duplicate query parameters were silently trusted** (first value wins). The parser now uses `getAll`/array-length to detect a repeated known key and rejects the whole URL on the strict path; the lenient Edit-search path drops the field instead of guessing. The `v=1` version parameter is now required, not optional.
- **Persian and Arabic Results dates rendered in the Persian calendar** because raw `fa`/`ar` tags were passed to `Intl.DateTimeFormat` directly instead of the Date Picker's `formattingLocale()`. Fixed by reusing that one formatter everywhere a Results date is shown.
- **Carrier codes and flight numbers looked real** (`SK`, `SK123`). Replaced with an internal carrier id (`aurora`, `skyline`, …) and an unmistakably fictional identifier format (`DEMO-AUR-483`).
- **Aircraft descriptions and dynamic counts were hardcoded English** even in French/Persian/Arabic. Aircraft is now a closed enum mapped through the dictionary; a shared `formatLocaleNumber` renders every dynamic count in the locale's own digits.
- **Whole localized phrases were forced LTR**, including Persian/Arabic city names. Narrowed to `<bdi dir="ltr">` on codes/times/flight numbers and `<bdi dir="auto">` on names, with the route arrow mirroring under RTL the same way the Date Picker's chevrons already do.
- **Touch targets and heading structure**: the Travelers "Done" button was 36px; Retry and several Results actions were 36px; result cards had no accessible name and no `<h2>` to anchor the itinerary `<h3>`s under. All fixed.
- **Focus was recomputed from a new object every render**, which could refocus the invalid-search heading on unrelated re-renders. Reworked to depend on stable primitives (`paramsString`, `locale`) and recompute inside the effect, matching the pattern already used by the fetch effect.

## 5c. Second external-review correction round

A further pre-freeze review found the outbound and inbound itineraries of a round-trip offer were generated fully independently, plus several remaining localization gaps:

- **Round trips could be chronologically impossible.** The inbound itinerary's start time was drawn independently of the outbound's arrival, so a return flight could depart before the outbound had even landed (reproduced: YTO → LHR, departing 2026-07-31, returning 2026-08-01 — the inbound departed 297 minutes before the outbound arrived). Fixed with a bounded, deterministic procedure in `demo-flight-offer-repository.ts`: the naturally drawn inbound slot is kept whenever it already respects a new `MIN_ROUND_TRIP_TURNAROUND_MINUTES` (60 minutes) after the outbound's UTC arrival instant; otherwise the earliest still-valid slot on the selected return date is chosen deterministically, and if even that fails, the outbound is deterministically retried at the earliest possible departure time (`shiftItineraryStart` — a pure epoch shift, no re-drawn randomness). An offer index that remains impossible after that bounded retry is skipped rather than returned, out of a slightly larger candidate pool, so the result count stays in the documented 10–16 range without ever forcing an impossible itinerary. `assertOfferInvariants` now also checks itinerary order, the turnaround, and that each leg's local departure date matches the selected departure/return date.
- **Traveler counts allowed fractional children and infants.** `isValidTravelerCounts` only ever checked `Number.isInteger` on `adults`; `children`, `infantsInSeat` and `infantsOnLap` were only range-checked, so `1.5` or `Infinity` passed. All four fields are now required to be finite integers before any range rule is applied — `buildSearchIntent` inherits the fix automatically, since it was already the single call site.
- **`TravelersControl` rendered raw Western digits** in every locale. It now takes a `locale` prop and formats the summary and every stepper count through the shared `formatLocaleNumber`.
- **Several Result Card phrases were still forced entirely LTR** — the duration phrase, the "Flight …" label, the day-offset indicator, the layover sentence, the operating-carrier disclosure and the formatted price. A new `splitTemplateSegments`/`renderTemplate` pair renders a template as structured JSX instead of one opaque string, so only the embedded code, time, identifier or proper name gets its own `<bdi dir="ltr">`/`<bdi dir="auto">`, never the whole localized sentence.
- **A stale doc comment on `SearchShell`** still claimed there was no airport dataset, calendar picker or Results route. Corrected to describe the real functional flow.

## 6. Deterministic verification

`npm run verify:flights` — **142/142 checks pass**. In addition to the original 61 (URL round-trip, required-field/enum rejections, deterministic regeneration, pricing, itinerary counts, chronology, sorting, empty/error scenarios, City-all-airports resolution, IATA validity, the demonstration flag, no deep link/seat-availability claim), the first correction round added: location-overlap rejection in both directions plus the strict/builder paths, no-repeated-layover and no-self-segment checks re-run across the specific dates known to have triggered the old defect, UTC-instant chronology (not wall-clock strings), independently-verified Toronto/London and Tehran/Toronto conversions, a DST-transition date, date-bounds rejection at the maximum in both directions, past-date restoration being dropped, invalid builder input, duplicate-parameter rejection for origin/departure/adults, missing/unsupported version rejection, Persian Results staying Gregorian, absence of any real-looking flight number, aircraft values being the closed enum, every generated airport code resolving to a time zone, signed day-offset formatting (positive and negative), and locale-number formatting for fa/ar (114/114).

The second correction round added 28 more: the exact reproduced YTO → LHR case now respecting the minimum turnaround and preserving both selected local dates; a targeted sweep across eastbound, westbound and date-line-scale routes (including YVR ↔ NRT, roughly a 16–17 hour offset) at 1/2/5-day return gaps, confirming direct, one-stop and two-stop itineraries were all actually exercised; an **exhaustive sweep of every valid non-overlapping demo origin/destination pair** (1,150 ordered pairs, 13,800 offers) with a 1-day return gap, asserting zero chronology or turnaround violations; itinerary-order invariants; rejection of fractional/NaN/Infinity traveler counts in all four fields, standalone and through `buildSearchIntent`; and locale-number formatting for a `TravelersControl`-shaped value in all four locales.

## 7. Browser verification

Verified at 1440, 1280, 1024, 768, 390 and 360 across `/en`, `/fr`, `/fa`, `/ar`:

Round-trip and one-way submission navigating to `/flights/results` with the documented parameters, including a Tehran → Dubai one-way search independently spot-checked against the corrected UTC timeline (11:30 IKA → 14:07 DXB, consistent with IRST/Gulf Standard Time) · YMQ → YUL and YUL → YMQ both rejected in the form with the updated "same airport or city" wording · a hand-edited overlapping Results URL and a duplicated-parameter URL both render the Invalid state with no repository call · a return past the +12-month bound is rejected · Edit search does not restore a past departure date · reload and browser Back/Forward both re-validate the same URL correctly · loading, error and Everywhere each expose exactly one `<h1>`, with focus moving to the error heading automatically · Best/Cheapest/Fastest sorting with a stable result count and offer set · Show details / Hide details toggling with focus moving into the expanded region, article `aria-labelledby` resolving to a real carrier-and-route heading · Review option opening the same disclosure · no Book button, no real-looking flight number, no English aircraft label leaking into fr/fa/ar · Search Summary shows the active currency · Persian and Arabic Results dates confirmed Gregorian (matching the Date Picker) with localized city names left `auto`-direction and only codes/times LTR-isolated · Multi-city still disabled · Airport Selector and Date Picker regressions clean · no horizontal overflow at any width · 44px targets confirmed on the Travelers Done button, Retry, Show/Hide details, Review option and the sort control.

**Second correction round, re-verified live:** the exact reproduced YTO → LHR round trip (2026-07-31 / 2026-08-01) at `/en`, `/fr` and `/ar` — all 12 generated offers now show an inbound departure strictly after the outbound arrival with a real ground-time gap (e.g. Aurora Air: outbound arrives 23:44 LHR, return departs 17:45 LHR the next day), never the previously-reproduced impossible ordering · a one-stop itinerary's expanded detail in Arabic (`/ar`) shows the flight label, layover sentence, duration and day-offset each correctly split — "الرحلة" (label) + `DEMO-MPW-645` (isolated LTR) + "Maple Wings" (`auto`), "توقف: في" + "59د" (`auto`) + "FRA" (LTR), "٩س ٣٢د"-style durations in `auto`, "+١ يوم" rendered outside the time/code isolate — with no whole-sentence forced-LTR left anywhere · the formatted price (`945.00 CA$`/`‏945.00 CA$`) switched from a forced `dir="ltr"` to `dir="auto"` and reads correctly in both `/en` and `/ar` · French (`/fr`) shows correctly localized `9h 44min`/`+1 jour` · Persian (`/fa`) `TravelersControl` shows `۱ مسافر` on the trigger and updates every stepper count (`بزرگسالان … ۲`) in Persian digits after incrementing · no horizontal overflow at 360px in Arabic · Show details buttons measured at 44px in French. (Verification also surfaced and resolved an unrelated environment issue — two concurrently-running dev-server processes had corrupted the shared `.next` build cache; clearing it and running a single server resolved it before this pass, with no application code implicated.)

## 8. Known limitations

1. **Filters are not implemented.** Sorting only, per scope.
2. **No Flight Details route** — Show details expands in place; nothing routes elsewhere.
3. **No affiliate redirect or booking** — "Review option" only opens the details disclosure.
4. **Layover connections route through a fixed pool of four real hub airports** (YYZ, AMS, FRA, DXB) chosen for plausibility; this is not a schedule claim, and every card and the page-level disclosure say so.
5. **Currency is not exchanged** — the demo price formula is currency-label-agnostic; switching currency relabels the same numeric magnitude rather than converting it, consistent with the project's "no FX" rule everywhere else.
6. **No URL state for sort** — the chosen sort resets to Best on a new search and does not persist across a reload of the same URL.
7. **Traveler model excludes personal data** — no age-verification, seating or SSR data of any kind is collected, only counts.
8. **A round-trip offer index can occasionally be skipped** — if even the earliest possible outbound departure cannot leave enough ground time before the selected Return date, that specific offer index is dropped rather than returned as an impossible itinerary. Verified vanishingly rare in practice (zero occurrences across an exhaustive 1,150-pair, 13,800-offer sweep with the tightest allowed 1-day gap); the documented 10–16 result count already accounts for it.

## 9. Exclusions

Unchanged from the specification: real flight API · provider adapter · live prices or schedules · real seat inventory · affiliate links · partner redirect · booking · payment · full filter sidebar · price alerts · saved trips · AI ranking · multi-city · maps · analytics · tracking pixels.
