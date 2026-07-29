# GTAI V2.1 — Functional Airport Selector

**Status:** Implemented, uncommitted
**Base checkpoint:** `afd4cdd8801bf97ac586beddc59e6f1f8b85419f`
**Blueprint:** `docs/reference/03_AIRPORT_SELECTOR.md` (V1.2-C)

---

## 1. Scope implemented

The origin and destination fields are now a working, accessible location combobox.

| Capability                                                                                  | State |
| ------------------------------------------------------------------------------------------- | ----- |
| Search by city, airport, IATA code, city code, alias, localized name                        | Done  |
| Case- and accent-insensitive matching, Persian/Arabic letter folding                        | Done  |
| Ranked results with `Best match` / `Cities and all airports` / `Airports` / `Other matches` | Done  |
| City all-airports entity ranked above its member airports for a city query                  | Done  |
| Exact IATA promoted to `Best match`                                                         | Done  |
| Everywhere (`FLEXIBLE_DESTINATION`), destination-only                                       | Done  |
| Recent locations, session-scoped, per context, with a clear action                          | Done  |
| Popular suggestions on the empty query                                                      | Done  |
| Explicit selection required — a typed query is never a location                             | Done  |
| Clear origin / Clear destination                                                            | Done  |
| Swap, disabled with an announced reason when destination is Everywhere                      | Done  |
| Desktop anchored popover · mobile modal sheet                                               | Done  |
| Combobox keyboard model, `aria-activedescendant`, grouped listbox                           | Done  |
| Loading, no-results, error and retry states                                                 | Done  |
| Form validation wired to selected entities                                                  | Done  |
| English, French, Persian, Arabic strings                                                    | Done  |
| Localized city, airport **and country** names                                               | Done  |

## 1a. Localized country names

City and airport names were localized from the start; country names were not, so an Arabic row read "دبي, United Arab Emirates". Corrected before freeze:

- `TravelLocation` gained `localizedCountryNames`, alongside `localizedNames` (the entity's own) and `localizedCityNames` (its parent city).
- `src/features/locations/country-names.ts` holds one translation table keyed by ISO 3166-1 alpha-2, covering all 11 countries in the directory in English, French, Persian and Arabic. Translating a country once, rather than per entity, keeps the data normalized.
- `resolveCountryName` implements the fallback chain **exact locale → base language → English → canonical name** in one place; result components never re-derive it.
- The city/country separator is locale-aware: `، ` for Persian, Arabic and Urdu, `, ` elsewhere.
- Localized city and country names are also folded into the search index, so "Allemagne" or "امارات" match.

Verified rendering: `DXB · Dubai, United Arab Emirates` (en) · `DXB · Dubaï, Émirats arabes unis` (fr) · `DXB · دبی، امارات متحده عربی` (fa) · `DXB · دبي، الإمارات العربية المتحدة` (ar). IATA and city codes remain LTR-isolated in both RTL locales.

## 2. Demo-data limitation

Suggestions come from `src/features/locations/demo-location-data.ts` — **15 cities and 20 airports across 11 countries**, hand-authored from common public reference knowledge. Nothing was scraped and no external API is called.

This is a demonstration directory, **not** a global airport dataset, and the product must not claim worldwide coverage. The selector surfaces a restrained note ("Location suggestions currently use GTAI's demonstration directory") at the foot of the results, where it does not interrupt searching.

Replacing it is a data-layer change only: implement `LocationRepository` against a licensed, versioned source and swap the single export in `location-repository.ts`. No UI change is required.

## 3. Architecture

```
src/features/locations/
  location-types.ts          normalized entities + repository contract
  demo-location-data.ts      the demonstration directory
  location-search.ts         folding, matching, ranking, grouping
  location-repository.ts     async abortable repository (demo implementation)
  location-presentation.ts   entity → display strings
  use-location-search.ts     request lifecycle, debounce, stale-response guard
  use-recent-locations.ts    session-scoped recents via useSyncExternalStore

src/components/search/
  airport-selector/AirportSelector.tsx      combobox orchestrator
  airport-selector/LocationPanel.tsx        popover / modal sheet
  airport-selector/LocationResultList.tsx   grouped listbox + states
  airport-selector/LocationResultItem.tsx   one option row
  SwapControl.tsx                           origin/destination exchange
  SearchShell.tsx                           form state + validation (modified)
```

Boundaries held: the selector never calls a provider, never builds a provider payload, and never submits the form. Entity ids are internal (`city-ymq`, `airport-yul`) — no provider identifier is a primary key.

**Search Intent shape** is unchanged from blueprint §20: the form now holds `origin` / `destination` as `TravelLocation | null` alongside their separate query strings.

## 4. Tests

No automated test suite exists in the repository yet, so verification was manual in a real browser.

Verified: origin and destination open/search/select · exact IATA (`yul`, `dxb`, `ika`) · all-airports ordering (`london` → LON above LHR/LGW) · local-language queries (`تهران`, `مهرآباد`, `مونترال`, `دبي`) · French, Persian and Arabic country rendering · Everywhere selection · Swap · Swap disabled with Everywhere · keyboard ArrowDown/End/Enter/Escape · `aria-activedescendant` tracking · typed-but-unselected validation · clear field · recent locations and clear-recents · sessionStorage holds ids only · mobile sheet (focus trap, scroll lock, focus restore) · desktop popover 480px inside viewport at 768–1440 · rows ≥44px · no horizontal overflow at 360/390/768/1024/1280/1440 in Arabic · all 11 routes return 200.

**Data integrity.** No duplicate entity ids and no duplicate airport codes. The Tehran group is correct and deliberate: the city code `THR` and Mehrabad's IATA `THR` legitimately coincide. A `THR` query returns Mehrabad as the exact-IATA **Best match**, the Tehran all-airports entity separately under **Cities**, and London Heathrow under **Other matches** (a genuine substring hit — "Hea**thr**ow"), with no duplicate selectable row.

Quality gates: build, typecheck, lint and format-check all pass with no suppressions.

## 5. Known limitations

1. **Country translations cover only the 11 countries in the demo directory.** A twelfth country would fall back to its canonical English name until added to `country-names.ts`.
2. **No automated tests.** Ranking and folding are pure functions and are the obvious first unit-test target.
3. **`Other matches` is rarely reached** with a directory this small; the grouping logic supports it but it is under-exercised.
4. **Repository latency is simulated** (90 ms) so loading states are reachable. Real latency will differ.
5. **No nearby-airport, geolocation or provider mapping** — all deferred by design.
6. **Recents survive only the tab session** and are not synchronised across devices; intentional, per blueprint §25.
7. The desktop popover anchors to a fixed logical edge per context rather than measuring available space; adequate at the supported widths but not a general collision strategy.

## 6. Exclusions

Not implemented, unchanged from the blueprint's scope: external airport API · production global dataset · geolocation · nearby-airport resolution · provider mapping · provider API · live availability · live prices · date picker · travellers popup · multi-city legs · flight results · authentication · database · analytics · map · affiliate redirect · booking · payment.

Submitting a valid search still produces **no results and no provider call** — the form reports truthfully that GTAI is still connecting its travel providers.

---

## Corrected in V2.2.1

- **Clear recent locations** performs its action in `onClick`, not
  `onPointerDown`, so Enter and Space activate it. Pointer-down only
  prevents the blur that would close the panel; it never runs twice.
- Clear origin / Clear destination, Clear recent, Retry and Clear search
  are 44px targets.
- The mobile field trigger is a `role="combobox"` carrying `aria-invalid`
  and `aria-describedby`, matching the desktop input. As a `role="button"`
  it could not legally expose the invalid state at all.
- `npm run verify:locations` covers directory integrity, ranking, localized
  matching, grouping, limits and Everywhere's destination-only rule.
