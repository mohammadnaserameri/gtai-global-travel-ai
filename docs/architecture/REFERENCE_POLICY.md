# GTAI — Reference Policy

This document states which products informed GTAI's design thinking, in what capacity, and where the line is. It is binding on every contributor and on any automated tool used to produce code or assets for this repository.

---

## 1. Why references are used at all

Travel search has settled conventions — a product tab row, an origin/destination pair, a date range, a traveller count, a results list sorted by a few named lenses. A traveller who has used any global travel site should not have to relearn the basics on GTAI.

References are therefore used to understand **what travellers already expect**. They are never used as a source of implementation.

## 2. Primary UX reference — Skyscanner

Used **only** as a reference for:

- familiar travel-search information architecture
- clean global navigation
- product tabs
- flight search workflow
- search control hierarchy
- responsive behaviour
- understandable result organization
- the "Best / Cheapest / Fastest" comparison concept

## 3. Secondary flight-intelligence reference — Google Flights

Used **only** as a conceptual reference for future capabilities:

- flexible date search
- date price grid
- price graph
- explore map
- price tracking
- clear flight comparison

None of these is implemented in V1.

## 4. Affiliate business architecture references — Wego, Travelpayouts, and official travel-provider affiliate ecosystems

Used **only** to understand how a compliant affiliate metasearch business is structured: provider relationships, disclosure obligations, redirect and attribution flow, and the boundary between a comparison service and a merchant of record.

## 5. Prohibited — without exception

It is prohibited to copy, reproduce, port, transcribe, adapt or closely imitate, from any reference product or any other third party:

- source code, in whole or in part
- markup or DOM structure
- CSS, class systems or design tokens
- exact page layouts or component compositions
- logos, wordmarks, brand marks or favicons
- icon sets or individual icons
- photography, illustration or any other imagery
- fonts not properly licensed for this use
- copy, marketing text, microcopy or editorial content
- trademarks, product names or branded visual identity
- proprietary data, feeds, listings or pricing
- any asset obtained by scraping a third-party site

It is equally prohibited to imply an association with, endorsement by, or partnership with any company GTAI is not actually partnered with.

## 6. Required — original GTAI implementation

Everything shipped in this repository must be original to GTAI or properly licensed:

| Area           | V1 status                                                                                |
| -------------- | ---------------------------------------------------------------------------------------- |
| Design system  | original — tokens in `src/app/globals.css`, documented in `docs/design-system/`          |
| Components     | original — `src/components/**`, no third-party UI library installed                      |
| Icons          | original — drawn on a 24×24 grid in `src/components/ui/icons.tsx`                        |
| Logo           | original placeholder — CSS gradient plus hand-drawn SVG geometry                         |
| Imagery        | none — destination cards use locally generated CSS gradients, not photography            |
| Copy           | original — authored for GTAI in `src/i18n/dictionaries/**`                               |
| Colour palette | original — derived from GTAI's own brand colour `#C78EFF`                                |
| Fonts          | Geist, an open-licensed typeface, self-hosted via `next/font`                            |
| AI workflows   | original — GTAI's structured interview concept, not modelled on any competitor's product |

## 7. The practical test

Before adding anything to this repository, it must pass all three:

1. **Provenance.** Can you name where it came from, and is GTAI entitled to use it?
2. **Substitution.** If a reference product disappeared tomorrow, would this still be defensible as GTAI's own work?
3. **Confusion.** Could a reasonable person mistake this for another company's product, or believe GTAI is affiliated with them?

If any answer is uncomfortable, it does not go in.

## 8. Summary

GTAI should feel **immediately familiar** to anyone who has searched for travel online, and must **never impersonate** the products that made those patterns familiar. Conventions are shared; implementations, assets and identity are not.
