# GTAI — V1 Global Foundation

**Status:** complete and verified
**Scope:** application foundation only. No provider, payment, booking, account or AI runtime exists in this release.

---

## 1. Product vision

GTAI (Global Travel AI) is a global travel metasearch platform. It compares travel offers published by third-party providers and hands the traveller to an approved partner to complete the booking.

Two things are intended to differentiate it:

1. **Familiar comparison, done properly.** Flights, stays, cars and packages compared on one consistent surface, with the trade-off behind "best", "cheapest" and "fastest" stated rather than implied.
2. **Guided planning instead of a blank prompt.** GTAI's AI path is a structured interview built from short, typed questions — not a free-text chat box the traveller has to fill in themselves.

## 2. Company and market

|                  |                             |
| ---------------- | --------------------------- |
| Company origin   | Canada                      |
| Primary market   | Canada                      |
| Reachable market | Worldwide                   |
| Default language | English                     |
| Default country  | Canada (`CA`)               |
| Default currency | CAD                         |
| Business model   | Affiliate travel metasearch |

## 3. Business model

GTAI is **not** a travel agency, a tour operator or an airline. In the eventual product:

- GTAI compares offers published by third-party providers.
- Selecting an offer may redirect the traveller to a partner website.
- The **partner** completes the booking and takes payment.
- GTAI may receive a commission on a completed booking.
- The traveller should recheck price and conditions on the partner site before paying.

GTAI does not and will not, in this architecture:

- issue tickets
- hold travel inventory
- act as merchant of record
- process customer payments
- manage cancellations or refunds as the booking provider

**Nothing of this is active in V1.** No provider is connected, no offer is displayed, no affiliate link exists anywhere in the codebase.

## 4. Reference strategy and legal design boundary

See [`REFERENCE_POLICY.md`](./REFERENCE_POLICY.md) for the full policy. In summary: Skyscanner informs _information architecture_, Google Flights informs _future flight-intelligence concepts_, and Wego/Travelpayouts inform _affiliate business architecture_. No code, layout, asset, icon, trademark or visual identity is copied from any of them. Every component, token, icon and string in this repository is original to GTAI.

## 5. Application architecture

**Stack:** Next.js 16 (App Router), React 19, TypeScript 5 (strict), Tailwind CSS 4, ESLint 9, Prettier 3. Package manager: npm. No animation library, UI framework, 3D engine, analytics tracker, payment SDK, provider SDK, auth SDK or AI SDK is installed.

**Rendering:** Server Components by default. Client Components are used only where interaction genuinely requires them:

| Client Component                                             | Why                                     |
| ------------------------------------------------------------ | --------------------------------------- |
| `Tabs`, `SearchShell`, `TripTypeSelector`                    | tab and trip-type state                 |
| `DropdownShell`, `DrawerShell`, `ModalShell`, `TooltipShell` | open/close state, focus trap, dismissal |
| `LanguageSelector`, `RegionCurrencySelector`                 | current pathname, region state          |
| `NavLink`, `MobileNav`                                       | active-route marking, drawer state      |
| `RegionProvider`                                             | session region context                  |

Everything else — header, footer, hero, every page, every content section — renders on the server.

### Source layout

```
src/
  proxy.ts                     locale normalization for every request
  app/
    globals.css                design tokens + base + utilities
    [locale]/
      layout.tsx               ROOT layout (sets <html lang dir>)
      page.tsx                 homepage
      not-found.tsx            404 boundary inside the shell
      [...unmatched]/page.tsx  claims leftover paths → notFound()
      flights|stays|cars|packages|explore|trips|ai-travel/page.tsx
  components/
    ai/        AgentPreviewCard, PlanningModeCard, QuestionPreview
    brand/     Logo
    home/      Hero, RouteVisual, GuidedAiPanel, PopularDestinations,
               ExploreSection, WhyGtai, TrustSection
    layout/    Container, SectionHeading, Header, Footer, ProductPageShell
    navigation/ NavLink, MobileNav, LanguageSelector
    region/    RegionProvider, RegionCurrencySelector
    search/    SearchShell, TripTypeSelector
    ui/        Button, IconButton, Card, Badge, Tabs, InputShell, SelectShell,
               DropdownShell, ModalShell, DrawerShell, TooltipShell, Skeleton,
               Alert, EmptyState, AffiliateDisclosure, icons
  config/      brand, navigation, locales, countries, currencies
  i18n/        get-dictionary, routing, dictionaries/{en,fr,fa,ar}.json
  lib/         region/, currency/, accessibility/, utilities/
  types/       utility types
```

### Why the root layout lives inside `[locale]`

`lang` and `dir` are attributes of `<html>`, and only the top-most layout can set them. Putting the root layout at `src/app/[locale]/layout.tsx` (with no `src/app/layout.tsx`) is what makes per-locale direction possible without a client-side DOM patch and its flash of wrong direction.

The consequence is that an unmatched URL has no layout to render a 404 inside. Two pieces close that gap:

- `src/proxy.ts` redirects any path lacking a supported locale segment, so every request arrives locale-prefixed;
- `src/app/[locale]/[...unmatched]/page.tsx` claims whatever is left under a locale and calls `notFound()`, which renders `[locale]/not-found.tsx` inside the full shell. Static routes take precedence over the catch-all, so it never shadows a real page.

## 6. Route structure

| Route                     | Type                                             | Notes                                             |
| ------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| `/`                       | redirect                                         | → `/en`                                           |
| `/<any-non-locale-path>`  | redirect                                         | → `/en/<path>`                                    |
| `/[locale]`               | SSG for `en`,`fr`,`fa`,`ar`; on-demand otherwise | homepage                                          |
| `/[locale]/flights`       | "                                                | search shell + planned capabilities + empty state |
| `/[locale]/stays`         | "                                                | "                                                 |
| `/[locale]/cars`          | "                                                | "                                                 |
| `/[locale]/packages`      | "                                                | "                                                 |
| `/[locale]/explore`       | "                                                | no search shell                                   |
| `/[locale]/trips`         | "                                                | no search shell                                   |
| `/[locale]/ai-travel`     | "                                                | guided-planning preview                           |
| `/[locale]/*` (unmatched) | dynamic                                          | HTTP 404 inside the shell                         |

`generateStaticParams` pre-renders only the four locales with authored dictionaries. Every other supported locale renders on demand and falls back to English, so adding a language is a data-only change.

## 7. Localization

- **Routing:** every URL is locale-prefixed. `src/proxy.ts` enforces it.
- **Supported locales (32):** en, fr, es, de, it, pt, nl, sv, no, da, fi, pl, cs, ro, hu, el, uk, ru, tr, ar, fa, ur, he, hi, bn, zh, ja, ko, id, ms, th, vi.
- **Authored dictionaries in V1:** English (complete) plus French, Persian and Arabic demonstrations.
- **Fallback:** `getDictionary()` deep-merges a locale's dictionary over English **key by key**, so a partial translation renders translated where it exists and English everywhere else. A missing or malformed dictionary returns English rather than failing the page.
- **Arrays are replaced, never merged** — a half-translated list would otherwise interleave two languages inside one component.
- **No hardcoded visible English** exists inside reusable components. Navigation and footer configs carry dictionary _keys_, not strings, and the key type is derived from the English dictionary so a typo is a compile error.
- **No automatic browser translation** is used or relied upon.
- Language metadata (native name, English name, direction, fallback country) lives in `src/config/locales.ts`.

**Deliberately not done:** `Accept-Language` sniffing. The language a visitor gets is the one in the URL, changed explicitly through the selector.

## 8. RTL

RTL locales: Persian, Arabic, Urdu, Hebrew.

- `<html dir="rtl">` is set by the root layout from locale metadata.
- Layout uses **logical CSS properties** throughout — `start-*`/`end-*`, `border-s`, `ms-*`, `inset-inline-*` — rather than hardcoded left/right, so mirroring is structural rather than patched per component.
- The mobile drawer anchors to the inline-end edge and therefore mirrors automatically (verified: it renders at the left edge under `dir="rtl"`).
- Tab arrow-key navigation swaps `ArrowLeft`/`ArrowRight` under RTL.
- Numerals, ISO country codes and currency codes are wrapped in `.gtai-ltr-numerals` (`direction: ltr; unicode-bidi: isolate`) so they stay readable inside RTL text.
- Persian and Arabic are the visible RTL demonstrations; Urdu and Hebrew route correctly in RTL with English fallback content.

## 9. Region and currency

`src/lib/region/resolve-region.ts` exposes four functions:

| Function                           | Behaviour                                                   |
| ---------------------------------- | ----------------------------------------------------------- |
| `resolveUserRegion(input)`         | resolves country + currency, and reports the source of each |
| `resolveDisplayCurrency(input)`    | explicit choice → country rule → USD                        |
| `getCountryCurrency(country)`      | country → ISO 4217, unknown → USD                           |
| `getLocaleFallbackCountry(locale)` | locale → plausible country, unknown → `CA`                  |

**Resolution order for country:** explicit visitor selection → locale heuristic → Canada.
**Resolution order for currency:** explicit visitor selection → country rule → USD.

Business rules (data in `src/config/countries.ts`):

| Country                             | Currency        |
| ----------------------------------- | --------------- |
| Canada                              | CAD             |
| United States                       | USD             |
| United Kingdom                      | GBP             |
| Eurozone member states (20)         | EUR             |
| Australia / New Zealand             | AUD / NZD       |
| Japan / China / India               | JPY / CNY / INR |
| South Korea / Türkiye               | KRW / TRY       |
| United Arab Emirates / Saudi Arabia | AED / SAR       |
| **Iran**                            | **USD**         |
| Anything unknown                    | USD             |

### The Iran rule

Iran resolves to **USD, never IRR**. The mapping is declared in country data with a `currencyNote` explaining why, so the rule reads as intentional rather than as a missing entry, and the region panel shows the traveller a plain-language note when Iran is selected.

### What region resolution deliberately is not

- **No IP geolocation, no GPS, no fingerprinting.** The initial country is a transparent guess from the URL's language, and the UI says so in the region panel.
- **No hidden persistence.** Region state lives in React memory for the session only — no cookie, no `localStorage`, no server record.
- **No price conversion.** Choosing a currency changes how prices will be _labelled_. Nothing is converted, because no real travel price exists.

The visitor can override the display currency manually at any time; an explicit choice outranks the country rule.

## 10. Future provider adapter architecture _(documented, not implemented)_

No provider integration exists in V1. The intended shape:

```
UI  →  Search Orchestrator  →  Provider Adapters  →  Normalized Offer  →  Ranking  →  UI
```

Planned adapters: `FlightProviderAdapter`, `StayProviderAdapter`, `CarProviderAdapter`, `ActivityProviderAdapter`, `InsuranceProviderAdapter`.

Each adapter is responsible for one supplier and normalizes its response into a single internal offer shape: provider identity, price with currency, what the price includes, cancellation terms, deep link, and a freshness timestamp.

**Intended compatibility:** official affiliate feeds, deep links, widgets, approved APIs, white-label systems, global distribution systems, aggregators and licensed partner feeds.

**Explicit constraints:**

- No unauthorized scraping, ever.
- No circumvention of provider protections, rate limits or terms.
- No dependency on a single supplier — the adapter layer exists specifically so any one provider can be replaced.
- **No provider integration is active in V1.**

## 11. Future affiliate redirect lifecycle _(documented, not implemented)_

1. Traveller selects an offer inside GTAI.
2. GTAI shows the provider identity and the affiliate relationship _before_ the traveller leaves.
3. GTAI builds an outbound link from approved partner parameters.
4. The traveller lands on the partner site.
5. The partner completes booking and payment as merchant of record.
6. The partner reports a conversion; GTAI may receive a commission.
7. GTAI never handles payment, tickets, cancellations or refunds.

None of this exists yet. There is no redirect service, no click tracking and no affiliate parameter anywhere in the code.

## 12. Future structured AI interview _(documented, not implemented)_

Three planning depths, previewed on `/[locale]/ai-travel`:

| Mode                 | Scale                      | Behaviour                            |
| -------------------- | -------------------------- | ------------------------------------ |
| Quick Match          | ~8–12 questions            | essentials only                      |
| Smart Match          | ~20–40 questions           | adaptive branching                   |
| Perfect Trip Profile | bank of ~100–200 questions | asked gradually, reused across trips |

Design rules the interview must honour:

- ask only questions relevant to what the traveller has already said;
- branch adaptively — each answer narrows what remains;
- allow optional questions to be skipped without blocking a search;
- improve progressively across trips;
- **never present a large free-text box** as the primary AI surface;
- never collect passport numbers, document scans, visa or immigration history, health data, or payment details.

Question formats: single choice, choice cards, multi-select chips, ranges, yes/no, ranking. All six are previewed on the page as **non-interactive artwork** — they are not real form controls, because a working control would imply answers that could be stored.

## 13. Future multi-agent architecture _(documented, not implemented)_

Thirteen focused agents, each with a narrow responsibility and an explainable output: Traveler Profile, Question Orchestrator, Flight, Stay, Car Rental, Activities, Budget, Visa and Transit, Risk, Trust, Package Optimizer, Explanation, Monitoring.

There is **no agent runtime, no model provider, no AI SDK and no model call** in this repository. Every agent card in the UI carries a visible "Upcoming" badge.

## 14. Security and privacy baseline

| Requirement                                    | Status in V1                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| Secrets in source                              | none — `.env.example` contains documented placeholder names only   |
| Real API credentials                           | none; no environment variable is required to build or run          |
| Analytics / trackers                           | none installed                                                     |
| Fingerprinting                                 | none                                                               |
| Third-party scripts                            | none                                                               |
| `dangerouslySetInnerHTML` / raw HTML injection | not used anywhere                                                  |
| Passport, visa, health or payment data         | never collected, no field exists                                   |
| Persistence                                    | none — no database, no cookie, no `localStorage`, no session store |
| Outbound requests at runtime                   | none                                                               |
| External links                                 | `rel="noopener noreferrer nofollow"` enforced in `ButtonLink`      |

Fonts are self-hosted by `next/font` at build time, so the running application makes no third-party request.

## 15. V1 exclusions

Not implemented, by design:

airport autocomplete · date search · flight/stay/car/package search · provider APIs · scraping · affiliate links · booking · payment · authentication · database persistence · passport or visa document collection · production AI agents · unrestricted AI free-text input · price conversion · IP geolocation · analytics · dark mode.

## 16. Known limitations

1. **Search is presentational.** Submitting announces that search is not connected; it queries nothing.
2. **Dictionaries are partial** for French, Persian and Arabic — deliberately, as demonstrations. Uncovered keys render English. The remaining 28 locales are English throughout.
3. **Region state is per-session.** A page reload returns to the locale-derived default, because nothing is persisted.
4. **The 404 page renders in English** regardless of the URL's locale — Next.js does not pass route params to a not-found boundary — and inherits the layout's document title.
5. **No canonical or `hreflang` metadata**, because GTAI has no published domain yet; `NEXT_PUBLIC_SITE_URL` is reserved for it.
6. **Light theme only.** Colours are explicit, so the UI is stable under a dark OS preference, but no dark palette is authored.
7. **`npm audit` reports advisories** in transitive development dependencies (the ESLint toolchain, PostCSS, and `sharp`'s bundled libvips). None reach runtime code, and every available "fix" downgrades Next.js to a years-old major version, so they are left as-is and tracked.
8. **No automated tests.** Verification for V1 was lint, typecheck, production build and live browser checks.

## 17. Recommended V2 scope

In priority order:

1. **Legal and trust pages** — real Privacy, Terms, Affiliate Disclosure and Cookie pages, replacing the footer placeholders.
2. **Airport and city dataset** — a licensed or open dataset behind a typed lookup, with accessible autocomplete on the existing `InputShell`.
3. **One flight provider adapter** — a single approved affiliate or API partner behind `FlightProviderAdapter`, proving the normalization contract end to end.
4. **Affiliate redirect service** — outbound link construction, disclosure-before-exit, and conversion reporting.
5. **Results and ranking UI** — best/cheapest/fastest with the trade-off stated in plain language.
6. **Persisted preferences** — consent-gated storage of region, currency and language, with a visible way to review and delete them.
7. **Structured interview engine** — Quick Match first: a typed question bank, a deterministic orchestrator, and no free-text input.
8. **Accounts and Trips** — only once there is something worth saving.
9. **Automated testing** — component tests for the design system, plus RTL and accessibility regression checks.
10. **Remaining dictionaries** — a translation pipeline for the other 28 locales.
