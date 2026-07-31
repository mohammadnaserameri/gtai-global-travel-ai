# GTAI V2.6 — Functional Flight Details

**Status:** Implemented, with the V2.6.1 pre-approval corrections and the V2.6.2 numeric view-state correction applied — frozen as `Freeze GTAI V2.6 functional flight details`
**Base checkpoint:** `c711662a6ce51b607af9d95cbd395c131fd3fbd0` (V2.5.1 — Results Truthfulness and Provider Blueprint Corrections, frozen)
**Specification:** `docs/reference/08_FLIGHT_DETAILS.md`

---

## 1. Scope implemented

| Capability                                                | State                   |
| --------------------------------------------------------- | ----------------------- |
| Dedicated, shareable Flight Details route                 | Done                    |
| Strict offer-ID validation (pre-repository)               | Done                    |
| Details / return / clear-filters URL model                | Done                    |
| 11-step resolution pipeline with five availability states | Done                    |
| Outbound + return itineraries, segment/layover timeline   | Done                    |
| Airport-local times, signed day offsets, Gregorian fa/ar  | Done                    |
| Fare and baggage (modelled fields only)                   | Done                    |
| Price summary (total + per traveler only)                 | Done                    |
| Truthful highlight, scoped to the displayed set           | Done                    |
| Provider hand-off preview (reused, no redirect)           | Done                    |
| Result-card "View flight details" primary link            | Done                    |
| English, French, Persian, Arabic, full RTL                | Done                    |
| Offer-aware canonical Details URL (`router.replace`)      | Done                    |
| Shared numeric serialization bounds (`number \| null`)    | Done                    |
| Deterministic verification (`verify:details`)             | Done — 106/106          |
| Real provider, live inventory, redirect, booking, payment | Not started (by design) |

## 2. Architecture

```
src/features/flights/details/
  flight-details-types.ts        FlightDetailsResolution union, timeline entry type
  flight-details-url.ts          isValidOfferId, buildFlightDetailsUrl,
                                 buildResultsReturnUrl, buildClearedFiltersDetailsUrl,
                                 parseFlightDetailsContext
  flight-details-resolution.ts   the 11-step pipeline
  flight-details-formatting.ts   airportName, buildItineraryTimeline,
                                 isItineraryChronological

src/components/flights/details/
  FlightDetailsExperience.tsx    orchestrator: fetch, resolve, branch, render
  FlightDetailsLoading.tsx       one h1, role=status, aria-hidden skeletons
  FlightDetailsSummary.tsx       route/date/traveler recap
  ItineraryDetails.tsx           one direction: overview + timeline
  SegmentTimeline.tsx            the <ol> of segments and connections
  FareAndBaggage.tsx             modelled fare fields only
  PriceSummary.tsx               total + per traveler only
  FlightDetailsState.tsx         shared shell for the five non-ready states

src/components/flights/
  RouteArrow.tsx                 (existing) shared, RTL-mirroring separator
  renderTemplate.tsx             extracted this round — see section 4

src/app/[locale]/flights/results/[offerId]/page.tsx
scripts/verify-details.ts
```

Nothing was duplicated: Search Intent parsing/validation, filter URL parsing, filter sanitization, offer generation, highlight computation, sort, time/duration/date/price formatting, the bidi helpers and `ProviderHandoffModal` are all the existing implementations, imported.

## 3. Result-card integration

The card's primary action is now a real internal `<a>` (`ButtonLink`) reading **"View flight details"**, carrying the current Search Intent and Results view-state — so middle-click, Cmd/Ctrl-click and "open in new tab" all work, and the target is a genuine shareable address. "Show details" remains as the cheap inline disclosure.

The provider hand-off **preview** moved _inside_ that expanded disclosure as a secondary button: it opens a demonstration explanation, not a hand-off, so it must not read as the card's main call to action. The V2.3-era "Review option" button was removed — it drove the same disclosure as "Show details", which was only defensible while there was nowhere to navigate to. There is now.

No card action says Book, Buy, Select deal, Continue or View deal.

## 4. Corrections made while building

- **A localized phrase was being forced LTR.** The segment's flight line originally wrapped `formatTemplate("Flight {number}")` in one `<bdi dir="ltr">`, which dragged the localized word (پرواز / رحلة / Vol) into left-to-right along with the identifier. Caught in the live Persian pass. Fixed by isolating _only_ the substituted identifier — which required the structured template renderer `ResultCard` already had locally. That helper was extracted to `src/components/flights/renderTemplate.tsx` and both files now share it rather than duplicating it. The layover's airport name and the operating-carrier name were given the same treatment (`dir="auto"` on the substituted value only).
- **`src/i18n/routing.ts` used an aliased import** (`@/config/locales`), which plain Node cannot resolve, so the URL helpers could not be imported by a `verify-*.ts` script. Changed to a relative import — semantically identical, and it makes those pure string helpers testable by the deterministic harness. (The rest of that chain is `import type`, erased at emit.)
- **Two test-authoring bugs in `verify-details.ts`**, both found by running it: the short field-date format carries no year, so the Gregorian assertion had to check the _month name_ instead; and the "no invented fee breakdown" regex matched this project's own explanatory comments, so comments are now stripped before the check.

## 4a. V2.6.1 pre-approval corrections

Eight corrections applied before external review, all in the existing architecture — no new dependency, no suppression, no `any`:

1. **An invalid Offer ID no longer causes offer generation.** Validity is computed once through the shared `isValidOfferId` and used as a precondition of the fetch, not only of the render: the fetch key is `null` while the id is invalid, and the effect returns before constructing the repository or an `AbortController`. Rendering the invalid branch first was not sufficient on its own, because React runs effects after rendering. `offerIdIsValid` is an effect dependency, so a valid → invalid transition aborts any obsolete in-flight search. The key's _value_ is still only Search Intent + retry token + dev scenario — the id gates whether a key exists, never what it contains.
2. **Details now uses the shared filter bounds.** The Details-local `boundsFor` helper was deleted in favour of the shared observed maxima. The old helper measured Duration with `rankingMetadata.totalDurationMinutes` — the combined round-trip total (max 1264 on the reference search) — while the filter actually means maximum duration _per direction_ (max 758). A stale `maxDuration=858` therefore survived on Details while Results correctly dropped it. Both pages now sanitize it to `null` and omit it from the Details and Back URLs. (The empty-offer fallback introduced here used numeric zeroes; see section 4b.)
3. **The Details URL is canonicalized once offers are known.** After the offers resolve, the raw view state is parsed, sanitized against them and rebuilt; if it differs from the current address the page issues one `router.replace(canonicalUrl, { scroll: false })`. No history entry, no scroll, no refetch (view state is absent from the fetch key), no loading flash, and neither the offer id nor the Search Intent changes. Malformed Search Intent and invalid offer ids are never canonicalized, so a broken link is not rewritten into a plausible one. Because the comparison target is the canonical form itself, it converges in one pass.
4. **Back to results is offer-aware where offers exist.** Ready and Excluded-by-Filters build the return URL from the sanitized view state; the states without offers preserve only safely parsed format-level view state and make no offer-aware claim.
5. **The last hardcoded arrow is gone.** `ItineraryDetails`'s airport-name row now uses the shared `RouteArrow` inside an inline-flex row, with origin and destination each in their own `<bdi dir="auto">`.
6. **The timeline toggle has an explicit controlled region.** A stable `timelineRegionId` is referenced by `aria-controls`; the region always renders with that id, is `aria-labelledby` the overview heading, and is `hidden` rather than unmounted when collapsed, so the relationship never dangles.
7. **The highlight comparison count is localized** through `formatLocaleNumber`, so `fa` shows ۱۲ rather than 12.
8. **Invalid Search offers one truthful action.** When the Search Intent is unusable there is no Results view to return to, so the state links only to the localized `/flights`. The previous second button pointed at the same place under a different promise.

`verify:details` check 42 was also corrected: it now asserts that the **provider preview performs no navigation**, instead of prohibiting all `router.replace` usage — which would have banned the legitimate canonicalization in correction 3.

## 4b. V2.6.2 — format-level numeric preservation

The V2.6.1 empty-offer fallback (`priceMax: 0, durationMax: 0`) was wrong in a way the shared serializer made silent. Its numeric rule is `value < maximum`, so a zero maximum drops **every** non-negative value — and the callers passing it are exactly the Details states that cannot fetch: invalid offer id, repository error, empty result. Opening `?sort=cheapest&maxPrice=1000&maxDuration=600` on a malformed offer link and pressing "Back to results" therefore returned a Results URL with Sort intact and both numeric filters silently gone.

The fix is in the shared serializer, not in a Details-local branch:

```ts
interface ResultsSerializationBounds {
  readonly priceMax: number | null;
  readonly durationMax: number | null;
}
```

`number` means the complete offer set is available and offer-aware omission applies. `null` means the caller has no offer set to assess the value against — the value is format-valid but not yet assessable, so it is preserved and **Results** performs the offer-aware sanitization once its own set resolves. One private predicate, `serializesNumericFilter(value, max)`, expresses the whole rule for both Price and Duration: `null` value → omit; unknown maximum → serialize; known maximum → serialize only below it. `appendResultsViewStateParams` and `buildResultsSearchParams` both take the new type.

Deriving the bounds is also shared now: `serializationBoundsForOffers(offers)` returns unknown bounds for an empty set and the observed `priceBounds`/`durationBounds` maxima otherwise. Both Results call sites and the Details URL builder use it, so `flight-details-url.ts` no longer performs any bounds arithmetic of its own and the two pages cannot drift. Nothing fabricates a maximum: no `Infinity`, no `-Infinity`, no `Number.MAX_SAFE_INTEGER`, no large sentinel, and no sentinel string ever reaches a URL.

Results is unaffected: it reaches both call sites with a resolved repository set, and in the empty case `sanitizeFiltersAgainstOffers` has already reduced both numeric filters to `null`, so the serialized output is identical either way.

## 5. Deterministic verification

`npm run verify:details` — **106/106 checks pass** (61 at V2.6, 28 for the V2.6.1 corrections, 17 for V2.6.2). `npm run verify:filters` — **149/149** (134 plus 15 for the shared bounds model). Covers all 56 required areas: offer-ID acceptance and rejection (empty, overlong, encoded separator, traversal, uppercase, full URL, null); Details URL preserving Search Intent, Sort and Filters; default view state omitted; return URL free of the offer id; no `returnTo`-style parameter; duplicated strict Search Intent still invalid; deterministic regeneration; deterministic resolution; not-found vs excluded-by-filters distinguished; clearing filters making the offer resolvable while keeping its id; Sort not altering identity; the fetch key excluding offer id, Sort and Filters; one-way vs round-trip itinerary counts; outbound before return; UTC chronology; per-airport local times; timeline interleaving; signed day offsets at −1, 0, +1 and +2; Persian and Arabic staying Gregorian; codes unlocalized; highlight matching the displayed set; single-offer no-highlight; no duplicate highlight kind; fare reading only modelled fields; no invented fee/weight/brand; price integrity and traveler-count consistency; no router navigation, external navigation, provider-adapter import or network call anywhere in the feature; internal back URL; no sensitive URL value; no raw technical error text; canonical ordering independent of incoming parameter order; resolution independent of input array order; dependencies unchanged; the V2.4 and V2.5.1 suites still wired; and no Book/Buy/Select-deal copy or `target="_blank"` in any Details component.

The V2.6.1 additions cover: the null fetch key and the effect's explicit preconditions for an invalid id; the id gating the key without entering its value (asserted by parsing the template literal's `${…}` interpolations, since "offerId" also appears in the guard's name); Price and Duration defaults equalling the shared bounds; the per-direction vs. combined duration distinction and the stale-`maxDuration` reproduction; the empty-offer bounds fallback; canonical Details URLs being fixed points under re-canonicalization; unknown carriers, unknown airports, duplicate CSV entries and out-of-range numerics being dropped; malformed Search Intent and invalid ids never being canonicalized; the offer id and Search Intent surviving canonicalization unchanged; offer-aware vs. format-level Back URLs per state; `RouteArrow` used for every route separator with no arrow literals left in `ItineraryDetails`; the timeline region's stable id, `aria-controls`, `aria-labelledby` and `hidden`-when-collapsed behaviour; the highlight count going through `formatLocaleNumber` in all four locales; and Invalid Search rendering exactly one action pointing at the localized `/flights`.

The V2.6.2 additions cover, in `verify:filters`: `serializationBoundsForOffers` reporting the shared maxima for a real set and unknown bounds for an empty one; a concrete maximum still omitting a value at it and preserving one below it, for both Price and Duration; an unknown maximum preserving both values; the same values being dropped once the maxima are known (proving the two modes genuinely differ); unknown bounds plus `null` values emitting nothing; no sentinel string in the output; plain digit values for both filters; and canonical parameter order, canonical CSV order and default omission all unchanged under both modes. And in `verify:details`: the invalid-offer-id return URL preserving `maxPrice`, `maxDuration` and Sort while carrying no offer id; a malformed id falling back to the Results URL with both filters intact; the empty/error-state Details URL preserving both filters and the offer id; no sentinel in any unavailable-bounds URL; an unset filter still emitting nothing; the Details module holding no bounds arithmetic of its own; the ready state still dropping stale values and still keeping restrictive ones in both the Details and Back URLs; every Search Intent parameter identical under both modes; and the provider-preview and repository-key guarantees unaffected.

`verify:locations` (42/42), `verify:dates` (66/66), `verify:flights` (142/142), `verify:filters` (134/134) and `verify:polish` (88/88) all still pass unchanged.

## 6. Browser verification

Verified live against the dev server. English: Results → "View flight details" navigates to the correct offer with Sort and Filters preserved in the URL; the page shows one `h1`, all sections in the specified order, outbound before return, and a back link that restores `sort=cheapest` + `stops=oneStop` exactly. Multi-stop offer: 8 timeline items with 3 connections interleaved correctly, each layover showing only airport + IATA + duration, `+1 day` offsets present, and no terminal/gate/seat-map text anywhere. Provider preview: correct `aria-haspopup`/`aria-expanded`/`aria-controls` (id matches the dialog), 44px target, focus enters the dialog, Escape closes it, focus returns to the exact trigger, body scroll restores, and the URL, history length and network-request count are all unchanged (0 new requests). States: not-found, invalid-offer-ID (rendered without any repository call) and excluded-by-filters all render one `h1` with the right recovery actions, and "Clear filters and view this option" keeps the offer id while dropping only `stops`. Persian and Arabic: `dir="rtl"`, one `h1`, Gregorian months, times/codes `dir="ltr"`, airport names and durations `dir="auto"`, English fallback airport names correctly `dir="auto"` inside RTL pages, and the flight line proven to isolate only `DEMO-SKY-789`. French: fully localized with no English leakage. Widths 360/390/768/1024/1280/1440 — zero horizontal overflow at every one, minimum interactive target 44px at 360px. Zero console errors throughout.

**V2.6.1 pass.** Invalid id (`not-a-real-offer`): the invalid heading renders with no loading indicator at any point and offers "Return to flight results" + "Edit search" (two genuinely different destinations, both valid because the Search Intent is). Canonicalization: loading `…&sort=cheapest&stops=direct,direct&carriers=NOPE,ZZZAIR&maxPrice=999999&maxDuration=858&fromAirports=QQQ&departTime=nonsense` settled at `…&sort=cheapest&stops=direct` — the duplicate collapsed, the unknown carriers, unknown airport and unparseable bucket dropped, and both out-of-range numerics removed, including the `maxDuration=858` that the old combined-total bounds would have kept. History length rose by exactly one (the navigation) and was still unchanged three seconds later, so there is no replace loop and no extra entry. Browser Back returned to the Details page and Forward returned to Results, with no bounce. Back-to-results from a filtered Details page restored "1 of 12" with `sort=cheapest&stops=direct` intact. Timeline toggle: `aria-controls` resolves to a region that keeps the same id, keeps `aria-labelledby="Itinerary overview"`, and gains `hidden` when collapsed. Persian: the highlight scope reads "در مقایسه با ۱۲ گزینه‌ای…" with Persian digits, every route separator (including the new airport-name row, `فرودگاه بین‌المللی مونترآل-ترودو → London Heathrow Airport`) computes `scale: -1 1` and is `aria-hidden`. Invalid Search state: exactly one action, "Edit search" → `/en/flights` with no query, and the URL is left uncanonicalized. Repository error + Retry, empty scenario and not-found all behave as specified. Widths 360/390/768/1024/1280/1440 re-swept with zero overflow, zero over-wide elements and zero sub-44px targets in English and Persian, and at 360/768/1440 in Arabic and French. Console clean on every fresh load (the only errors in the buffer were stale hot-reload artifacts from editing an effect's dependency array while a page was live, and they did not recur after a marker-verified reload).

**V2.6.2 pass.** Invalid offer id with `sort=cheapest&maxPrice=1000&maxDuration=600`: the invalid heading renders with no loading state and the "Return to flight results" href carries all three; following it lands on Results showing "1 of 12" with the "Up to CA$1,000.00" chip applied — the whole view state survives the round trip. The complementary case with `maxPrice=5000&maxDuration=900` (both out of range) is preserved identically on Details and then dropped by Results' own canonicalization once its offers resolve, which is exactly the intended division of responsibility. Repository-error and empty scenarios both preserve `sort`, `maxPrice` and `maxDuration` with no sentinel anywhere in the href. Ready state with `maxPrice=1000&maxDuration=900&carriers=BOGUS`: the stale duration and unknown carrier are replaced away, the restrictive price is kept, the offer id is untouched, the Back URL is canonical, and history length is unchanged across three seconds — one navigation, no loop. Results → Details → browser Back → Forward all preserve `maxPrice=1000`. Excluded-by-filters keeps `stops=oneStop` alongside `maxPrice=1000` in canonical order, while "Clear filters and view this option" drops every filter and Sort but keeps the offer id. Provider preview: URL, history and dialog anchors unchanged, focus trapped. Six-width sweep (360/390/768/1024/1280/1440) in English and Persian with the numeric filter in the URL, plus Arabic and French at 360/768/1440 — zero overflow, zero over-wide elements, zero sub-44px targets, and the filter present in the address bar at every step. No console errors were produced during the entire pass.

## 7. Known limitations

1. **Details describes the fixed demonstration offer set** — no real provider, so every schedule, price and identifier remains locally generated.
2. **No user time-zone conversion** — times are airport-local only, by design for V2.6.
3. **Fare and price scope is intentionally narrow** — the model carries no fee breakdown, baggage allowance or fare brand, so none is shown.
4. **The provider preview has one action (Close)** — there is nothing real to hand off to.
5. **The Details page re-fetches the offer set on direct load** (a shared link starts from the loading state rather than a cached list) — correct, since the URL is the only source of truth, but it means a deep link always pays the demonstration repository's delay.
6. **Verification breadth vs. locale:** the six-width sweep was run exhaustively in English and Persian (and, at V2.6, in Arabic); Arabic and French were re-swept at 360/768/1440 in the V2.6.1 pass, plus full content/bidi checks in all four locales.
7. **The "no fetch on an invalid id" guarantee is asserted at source level, not by browser timing.** In the browser the invalid state is observed to render with no loading indicator, but that alone cannot distinguish "never fetched" from "fetched and discarded". The actual guarantee — a `null` fetch key and an effect that returns before constructing the repository — is asserted deterministically by `verify:details`, which reads the component source.

## 8. Exclusions

Unchanged from the specification: real provider API or adapter, live inventory, live price, real airline assets, real flight status, terminal/gate data, seat maps, fare-brand APIs, real baggage allowances, affiliate redirect, commission tracking, booking, payment, account persistence, saved options, email/PDF itinerary, social sharing, maps, carbon emissions, AI recommendation, multi-city, whole-month search.
