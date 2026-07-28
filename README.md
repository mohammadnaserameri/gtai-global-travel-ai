# GTAI — Global Travel AI

Global travel metasearch, built in Canada for travellers worldwide.

> **This is the V1 Global Foundation release.** It is an application foundation, not a working travel product. No travel provider is connected, no prices are real, and nothing can be booked. See [Limitations](#limitations).

---

## What this is

GTAI compares travel offers from third-party providers and hands the traveller to an approved partner to complete the booking. GTAI is not a travel agency: it does not issue tickets, hold inventory, act as merchant of record, or process payments.

V1 delivers the foundation for that product:

- responsive application shell with desktop navigation and an accessible mobile drawer
- the GTAI design system — tokens, typed components, an original icon set and logo
- locale routing for 32 languages, with a safe English fallback
- full RTL support (Persian, Arabic, Urdu, Hebrew)
- country and display-currency architecture with deterministic rules
- homepage, six product pages, and a guided-AI preview
- a visible, accurate affiliate disclosure

## Getting started

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:3000> — it redirects to `/en`.

No environment variables are required. `.env.example` documents placeholder names for a later release and contains no secrets.

## Scripts

| Script                 | Purpose                    |
| ---------------------- | -------------------------- |
| `npm run dev`          | development server         |
| `npm run build`        | production build           |
| `npm run start`        | serve the production build |
| `npm run lint`         | ESLint                     |
| `npm run typecheck`    | `tsc --noEmit`             |
| `npm run format`       | Prettier write             |
| `npm run format:check` | Prettier check             |

## Routes

| Path                  |                                       |
| --------------------- | ------------------------------------- |
| `/`                   | redirects to `/en`                    |
| `/[locale]`           | homepage                              |
| `/[locale]/flights`   | flight comparison shell               |
| `/[locale]/stays`     | accommodation shell                   |
| `/[locale]/cars`      | car rental shell                      |
| `/[locale]/packages`  | package shell                         |
| `/[locale]/explore`   | destination discovery preview         |
| `/[locale]/trips`     | saved-trip workspace preview          |
| `/[locale]/ai-travel` | guided planning + multi-agent preview |

Any path without a supported locale prefix is redirected to the English equivalent by `src/proxy.ts`.

## Localization

32 locales route correctly. English content is complete; French, Persian and Arabic ship demonstration dictionaries. Every other locale falls back to English **key by key**, so a partial translation is never a broken page.

Try `/en`, `/fr`, `/fa` (RTL), `/ar` (RTL), and `/de` (routes correctly, English content).

## Region and currency

The display currency follows the resolved country: Canada → CAD, United Kingdom → GBP, eurozone → EUR, **Iran → USD**, anything unknown → USD. The visitor can override the currency manually at any time.

GTAI performs **no IP geolocation and no fingerprinting**. The initial country is a transparent guess from the URL's language, stated as such in the region panel. Nothing is persisted — no cookie, no `localStorage`, no server record.

## Documentation

- [`docs/architecture/V1_FOUNDATION.md`](docs/architecture/V1_FOUNDATION.md) — architecture, routing, i18n, RTL, region/currency, future provider and AI architecture, security baseline, V2 scope
- [`docs/architecture/REFERENCE_POLICY.md`](docs/architecture/REFERENCE_POLICY.md) — which products informed the UX, and the hard line on copying
- [`docs/design-system/GTAI_DESIGN_SYSTEM.md`](docs/design-system/GTAI_DESIGN_SYSTEM.md) — palette, tokens, typography, elevation, motion, accessibility, RTL and component rules

## Limitations

- Search is presentational — submitting queries nothing and says so.
- No provider API, no scraping, no affiliate link, no booking, no payment.
- No accounts, no database, no persistence of any kind.
- No AI model, agent runtime or AI SDK. The guided-planning page is a preview, and contains no free-text input by design.
- No passport, visa, health or payment data is collected anywhere.
- Light theme only; no automated test suite yet.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript 5 strict · Tailwind CSS 4 · ESLint 9 · Prettier 3. No UI framework, animation library, 3D engine, analytics tracker, or provider/payment/auth/AI SDK is installed.
