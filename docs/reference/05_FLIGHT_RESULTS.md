# GTAI V1.2-E — Flight Results

**Module:** 05 of 07
**Status:** Frozen — implemented in V2.3 — Functional Flight Search Intent and Results Foundation.
**Base checkpoint:** `bc1b295e9001a207b0f2e6971a7b219abc71b946` (V2.2.1 — Foundation Accessibility Polish)
**Implementation record:** `docs/implementation/V2_3_FUNCTIONAL_FLIGHT_RESULTS.md`

---

## 1. What this module covers

The journey from a submitted Flight Search to a rendered, sortable list of demonstration offers, and back to editing the search. It does **not** cover filtering, flight details as a separate route, affiliate redirect, or booking — those remain later modules.

## 2. The Search Intent

A `FlightSearchIntent` is GTAI's normalized, provider-independent description of one search:

| Field             | Type                      |
| ----------------- | ------------------------- |
| `version`         | `number`                  |
| `tripType`        | `"roundTrip" \| "oneWay"` |
| `origin`          | `LocationSnapshot`        |
| `destination`     | `LocationSnapshot`        |
| `departureDate`   | `IsoDate`                 |
| `returnDate`      | `IsoDate \| null`         |
| `travelers`       | `TravelerCounts`          |
| `cabinClass`      | cabin enum                |
| `flexibilityDays` | `0 \| 1 \| 2 \| 3`        |
| `currency`        | supported currency code   |
| `locale`          | active locale             |

`LocationSnapshot` is a frozen copy of a resolved `TravelLocation` — id, entity type, a locale-appropriate label, codes, country, time zone and coordinates. It is never a live reference into the location repository and never a provider identifier. Multi-city has no representation here; the type only has room for two trip types.

Traveler counts are `{ adults, children, infantsInSeat, infantsOnLap }`. No name, date of birth or other personal detail is collected. The rule, enforced everywhere a count is produced: every field is a finite integer, at least one adult, at most nine travelers total, never more lap infants than adults. `TravelersControl` renders every count — the summary, and each stepper value — in the active locale's own digits.

## 3. URL contract

```
/en/flights/results?v=1&trip=roundTrip&origin=city-ymq&destination=airport-lhr
  &departure=2026-09-15&return=2026-09-25&adults=1&cabin=economy&flex=0&currency=CAD
```

| Param                                 | Meaning                 | Notes                               |
| ------------------------------------- | ----------------------- | ----------------------------------- |
| `v`                                   | Intent version          | Currently `1`.                      |
| `trip`                                | `roundTrip` \| `oneWay` | `multiCity` is always rejected.     |
| `origin`                              | GTAI location id        | e.g. `city-ymq`, `airport-yul`.     |
| `destination`                         | GTAI location id        | Never `flexible-everywhere`.        |
| `departure`                           | ISO date                | Must be within today .. +12 months. |
| `return`                              | ISO date                | Round trip only; omitted otherwise. |
| `adults`                              | integer ≥ 1             | Defaults to `1` if absent.          |
| `children`, `infantSeat`, `infantLap` | integer ≥ 0             | Omitted from the URL when `0`.      |
| `cabin`                               | cabin enum              | Defaults to `economy` if absent.    |
| `flex`                                | `0`–`3`                 | Defaults to `0` if absent.          |
| `currency`                            | supported currency code | Falls back to the site default.     |

Every value is a short code, an ISO date or a small integer — never localized text, a typed query, a name, a coordinate or an account identifier. The same link means the same search regardless of which locale opens it.

Serialization omits a value that already equals its default (a zero traveler count, an absent return date), so the shortest URL that still parses back to the same intent is the one produced.

## 4. Validation

`validateSearchIntentParams` is the single authority for turning raw query fields into either a valid `FlightSearchIntent` or one specific, safe-to-render failure reason: unsupported or missing version, unsupported trip type, an unknown or Everywhere origin/destination, **overlapping origin and destination**, an invalid or out-of-range departure, a missing/invalid/too-early/out-of-range return, invalid traveler counts, an unsupported cabin, an out-of-range flexibility value, or **a duplicated known parameter**. It never throws — a malformed URL always resolves to a typed failure, never an unhandled exception.

**Location overlap** is checked by one shared function, `locationsOverlapForFlightSearch`, used identically by the form, the strict URL validator and `buildSearchIntent`. It rejects not only an identical origin/destination id, but also a City-all-airports entity paired with one of its own member airports (e.g. `city-ymq` vs `airport-yul`) and two City entities whose member-airport sets intersect — every combination that could otherwise generate a same-airport itinerary.

**A repeated known query key is never trusted.** `v`, `origin`, `departure`, `adults` and every other documented parameter must appear at most once; a duplicate of any of them invalidates the whole URL rather than silently picking one of the repeated values. The `v=1` version parameter is required, not merely validated when present.

Currency is the one field that never fails validation: an unsupported or absent value falls back to the site default silently, the same way an unsupported locale falls back to English.

`destinationIsEverywhere` is a distinct reason from every other failure. The Results page reads it separately and shows the dedicated Everywhere message rather than the generic invalid-search state.

## 5. Restoring the form

Edit search returns to `/[locale]/flights` carrying the same query string. A separate, **lenient** parser (`parseInitialFlightSearch`) restores the Flight Search form: each field is accepted or safely defaulted on its own, so one bad parameter never discards the rest of a restorable search. It never creates location data that is not already in the GTAI repository — an unresolvable id simply leaves that field empty.

## 6. Flight offers

A `FlightOffer` is provider-independent: id, currency, total and per-traveler price, one or two itineraries, a validating carrier, the operating carriers actually used, a fictional demonstration provider, baggage and fare summaries, ranking metadata, and `isDemonstration: true` on every offer. There is no `remainingSeats` field — the project has no truthful basis for one, so it is omitted rather than faked.

Carriers (Aurora Air, Maple Wings, Skyline Airways, Meridian Air) and providers (Atlas Connect, Northstar Travel, Voyage Hub) are original, clearly fictional names. No real airline branding, logo or livery is referenced.

### Generation

`DemoFlightOfferRepository` is asynchronous and abortable, and produces 12 offers per search. Generation is deterministic: a small seeded PRNG derives from the origin, destination, dates, trip type and cabin, so the same intent always regenerates byte-identical offers, while a different date or route changes the seed and therefore the result set. No network call is made and no output changes between reloads.

Distance comes from the origin and destination coordinates (great-circle). Price is a transparent demonstration formula — distance, a cabin multiplier, a round-trip factor, a small per-stop discount and a deterministic per-offer variance — never a live quote. A City-all-airports origin or destination deterministically resolves to one of its member airports per offer, and that specific airport is what the offer displays.

### Time model

Every departure and arrival is a real UTC instant (`epochMinutes`) resolved from an IANA time zone per airport (`airport-timezone.ts`), converted with `Intl.DateTimeFormat` only — no timezone library. Generation starts by converting the chosen local departure wall-clock at the origin airport into that instant; every segment and layover then advances the same UTC clock, and each displayed `{ date, time }` is derived by formatting that instant back into the _destination_ airport's own local zone. DST is handled by `Intl`, not assumed. A day-offset indicator ("+1 day", "-1 day", …) is computed by comparing the two local calendar dates directly — it is signed, so a westbound date-line-style crossing can show a **negative** offset, not just "+1".

Flight identifiers are unmistakably fictional (`DEMO-AUR-483`, never a two-letter-code-plus-digits pattern that could read as a real airline designator), and aircraft are a closed `widebody | narrowbody | regionalJet` enum rendered through the dictionary — never an English string baked into the offer data.

A round trip's outbound and inbound itineraries are chronologically continuous: the inbound departure is always after the outbound arrival plus `MIN_ROUND_TRIP_TURNAROUND_MINUTES` (60 minutes), decided purely from UTC instants. The outbound still departs on the selected departure date and the inbound on the selected return date, both in local time at their own origin airport — neither date is ever silently changed. When the naturally generated outbound timing would make that impossible on the selected return date, the generator deterministically retries with the earliest possible outbound departure before giving up; an offer index that remains impossible is skipped rather than returned, within a bounded candidate pool.

## 7. Sorting

Three real sorts — **Best** (default), **Cheapest**, **Fastest** — implemented in `flight-offer-ranking.ts`.

- **Cheapest** — ascending total price, tie-broken by duration then offer id.
- **Fastest** — ascending total duration, tie-broken by price then offer id.
- **Best** — a transparent score: price 50%, duration 30%, stops 20%, each normalized against the _current_ result set. The formula reads only price and duration/stop totals — never provider, carrier or commission — so two otherwise-identical offers from different providers always score identically.

Sorting only reorders; it never adds, drops or deduplicates an offer, and every comparator ends in an offer-id tiebreaker so the order is fully deterministic.

## 8. Page states

Invalid URL → dedicated Invalid Search message, no repository call, no result cards. Everywhere destination → the dedicated flexible-destination message with a link to Explore. Otherwise: loading (skeleton cards, one status message), then ready, empty, or error, each with its own recovery actions (Retry, Edit search, change dates/destination). The Search Intent and URL are preserved through every state — none of them clear the address bar.

## 9. Accessibility and truthfulness

Every state — loading, ready, empty, error, invalid, Everywhere — exposes exactly one `<h1>`; each offer is a semantic `<article>` with `aria-labelledby` naming the carrier and route; itineraries carry their own headings; Show details is a native button with `aria-expanded`/`aria-controls` and a 44px target; every price is followed by its currency; stop count is always text, never colour-only. A page-level disclosure states plainly that results are generated locally, schedules and prices are not live, and no booking or partner redirect exists yet — repeated once, not on every card.

All Results date formatting reuses the Date Picker's `formattingLocale()` — Persian and Arabic Results stay on the **Gregorian** calendar, matching the calendar the traveller actually picked the dates on, rather than drifting to the Persian calendar under a bare `fa` locale tag. A shared `formatLocaleNumber` renders every dynamic count (results, travelers, stops, duration, day offsets) in the locale's own digits; IATA codes and fictional flight identifiers are never localized.

Bidi isolation is scoped narrowly: `<bdi dir="auto">` wraps a localized name, `<bdi dir="ltr">` wraps a code/time/flight identifier — never the two mixed into one forced-direction string. Origin and destination stay in that reading order in the DOM; the connecting arrow mirrors under RTL (`rtl:-scale-x-100`, the same rule the Date Picker's month chevrons use) so it still visually points from origin to destination without reversing chronology in the markup.

A localized _sentence_ is never itself wrapped in `dir="ltr"` — only the mixed-direction token inside it is. The duration phrase, the "Flight …" label, the day-offset indicator, the layover sentence, the operating-carrier disclosure and the formatted price are all rendered as structured JSX (via `splitTemplateSegments`/`renderTemplate`, not one opaque interpolated string) so each embedded code, time, identifier or proper name gets its own `<bdi>` while the surrounding localized words keep their natural direction.

## 10. Exclusions

Not implemented: real flight API or provider adapter, live prices or schedules, real seat inventory, affiliate links or partner redirect, booking, payment, the full filter sidebar, price alerts, saved trips, AI ranking, multi-city, maps, analytics.

---

> This module is implemented for a first functional Results journey only. It does not authorize filters, provider integration, booking or payment.

## Partial provider coverage (V2.7)

Results receives a `coverage` value alongside its offers. When it is `partial`, at least one demonstration source did not answer, and the page says so rather than presenting a reduced list as the whole picture:

- **With offers** — a visible localized alert sits beside the standing demonstration disclosure, stating that some sources did not respond and that the options may be incomplete. Filters, Sort and Highlights continue to operate over whatever came back.
- **With no offers** — the definitive “no demonstration options were generated” state is _not_ rendered, because nobody verified that. A truthful incomplete-search state appears instead, offering Retry and Edit search.

`coverage` is presentation only: it never enters the repository request key and never appears in a Filter or Sort URL, so it cannot cause a refetch or change a shareable link.

### Response validity (V2.7)

Offers reaching Results have passed intent-aware validation, not merely a shape check: each one must answer the search that was made (route, dates, cabin, currency, trip shape) and be internally consistent (segment durations matching their own timestamps, itinerary endpoints matching their first and last segments, layovers derived from the route, totals reconciling with the parts).

Three further guarantees hold as of the boundary-integrity round. Every displayed date and time is the offer's own UTC instant **read in that airport's time zone** — a card cannot show a departure time its epoch does not support. Every airport code on a card, including connections, **exists in the GTAI location directory**; a well-formed invention like `ZZZ` is rejected rather than rendered. And every carrier and booking-provider name comes from the **shared demonstration catalog**, so a real airline or travel-agency name cannot appear on a page that calls its offers demonstrations.

The envelope carrying the offers must also be self-consistent — a `success` with no offers, an `empty` with offers, or a `partial` where nothing actually failed is rejected rather than rendered. The count is checked against what the sources claim to have supplied: the **final offer count may be lower** than the providers' combined contribution, because deduplication and the overall ceiling legitimately reduce it, but it can **never be higher**. Anything that fails becomes the ordinary translated error state; nothing is repaired into a different UI state.

## Demonstration disclosure (V2.8-A)

The standing disclosure above the result list is now rendered by the shared `DemonstrationDataNotice` (`prominent` weight) rather than a page-local alert, so Results, Details, the homepage and the public pages make one identical claim. Results keeps its own surface-specific points; the body sentence is the shared one.

The point list gained the statement the V2.7 copy lacked: **airlines and booking providers shown here are fictional demonstration identities**. Naming the itineraries as generated was not the same as naming the _brands_ as invented, and a reader scanning "Aurora Air — Provided by Northstar Travel" had no way to know both were fiction.

The notice is a `role="note"` landmark with an accessible name, carries icon, title and body so nothing depends on colour, works in RTL, is **not dismissible**, and lives outside the state that filters and sorting drive — so it survives every view-state change without a re-render dependency. It renders from already-loaded props and issues no request.

Results is `noindex, nofollow, nocache` through the shared `buildNonIndexableMetadata`, and is excluded from the sitemap structurally: the sitemap enumerates the shared list of pages meant to be public, so a generated itinerary has no route in.

## Crawl policy correction (V2.8-A round 2)

`robots.txt` no longer disallows `/*/flights/results`. That rule was removed because blocking a URL and marking it `noindex` are **alternatives, not layers**: a crawler refused the fetch never reads the `noindex` it was refused, and the URL can still be listed as a bare link discovered elsewhere. Disallowing made the exclusion less reliable.

Results remains `noindex, nofollow, nocache` with the Google-specific directives, and remains absent from the sitemap. Those are now the entire mechanism, and they work precisely because the page stays crawlable enough to state them. The page is `noindex` in every locale, authored or not.

---

## V2.8-B — no change to Results

Results is unaffected by V2.8-B. It continues to call the internal same-origin
`/api/flights/search`, receives only normalized `FlightOffer` objects, and
renders demonstration data produced by the local deterministic provider.

No external provider is connected, no raw provider payload reaches the browser,
and no booking or affiliate link is present in any offer — the normalized
external offer type has no field for one, and a provider-supplied deep link is
discarded during mapping with a recorded warning.

Filtering and sorting still add zero network requests.
