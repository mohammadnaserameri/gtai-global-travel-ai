# GTAI Product Roadmap

Versioned delivery plan for GTAI (Global Travel AI). Each version is a single bounded objective with its own acceptance criteria and its own verified Git checkpoint.

This roadmap is the authority on **what version we are in and what is allowed next**. It does not restate requirements that belong in a blueprint.

---

## 1. Version status

### V1 — Global Foundation

|        |                                            |
| ------ | ------------------------------------------ |
| Status | **Frozen**                                 |
| Commit | `78b983c4aee6062b8faaf149bf3f79d5f3adcfe2` |

Application architecture, routing, responsive shell, GTAI design system, localization for 32 locales, RTL foundation, country and currency architecture, homepage foundation, placeholder product pages, guided AI preview, documentation and the security baseline.

### V1.1 — Homepage Metasearch Alignment

|        |                                            |
| ------ | ------------------------------------------ |
| Status | **Frozen**                                 |
| Commit | `f5f6d8c2dda05919188f4bc1714559c690197c28` |

Homepage restructured so the standard travel search experience is the dominant above-the-fold element. Compact hero, single-row desktop search layout, non-wrapping product tabs, comparison reassurance row, removal of customer-facing implementation wording, and complete demonstration translations for the changed sections.

### V1.2 — Reference UX Blueprint

|        |                 |
| ------ | --------------- |
| Status | **In progress** |
| Commit | —               |

Documentation-only version. Produces the approved UX blueprints that later implementation versions must follow.

| Sub-version | Module                                | Status                                                                                                                                                                                   | Commit                                     |
| ----------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| V1.2-A      | Home Search Experience                | **Frozen**                                                                                                                                                                               | `feb07a7283c0951cc64e1a801c71993fcbd2d865` |
| V1.2-B      | Flight Search Form                    | **Frozen**                                                                                                                                                                               | `87a00a84b9e75fbf30b99e2ee210c2d3f17f7c7d` |
| V1.2-C      | Airport Selector                      | **Frozen** — implemented in V2.1                                                                                                                                                         | `afd4cdd8801bf97ac586beddc59e6f1f8b85419f` |
| V1.2-D      | Date Picker and Flexible Dates        | **Frozen** — implemented in V2.2                                                                                                                                                         | `973e28a0dca7e2e58c47efd0314632ec60b1b643` |
| V1.2-E      | Flight Results                        | **Frozen** — implemented in V2.3 (results foundation)                                                                                                                                    | `5df2382668aaac0bec925995e73085f221324cc9` |
| V1.2-F      | Filters and Sorting                   | **Frozen locally** — implemented in V2.4                                                                                                                                                 | —                                          |
| V1.2-G      | Flight Details and Affiliate Redirect | **Frozen locally** — outbound placeholder implemented and provider integration blueprint documented in V2.5; the Flight Details route, real redirect, booking and payment remain pending | —                                          |

---

## 2. Future versions

High-level intent only. Detailed requirements are deliberately **not** defined here — each version gets its own approved blueprint before any implementation begins.

| Version | Title                               | Status                                                                                                                                                                                                                                                                                                                                                                |
| ------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2      | Functional Flight Search Foundation | **In progress** — V2.1 Airport Selector, V2.2 Date Picker, V2.2.1 accessibility polish, V2.3 Search Intent and Results foundation, V2.4 Functional Flight Filters, and V2.5 Flight Results Polish, Affiliate Outbound Placeholder and Provider Integration Blueprint all frozen locally. Real providers, real affiliate redirects and booking/payment remain pending. |
| V3      | Provider Adapter Integration        | Planned                                                                                                                                                                                                                                                                                                                                                               |
| V4      | Affiliate Redirect and Attribution  | Planned                                                                                                                                                                                                                                                                                                                                                               |
| V5      | Guided AI Travel Assessment         | Planned                                                                                                                                                                                                                                                                                                                                                               |
| V6      | AI Result Intelligence              | Planned                                                                                                                                                                                                                                                                                                                                                               |
| V7      | Stays                               | Planned                                                                                                                                                                                                                                                                                                                                                               |
| V8      | Cars                                | Planned                                                                                                                                                                                                                                                                                                                                                               |
| V9      | Packages                            | Planned                                                                                                                                                                                                                                                                                                                                                               |
| V10     | Trust, Risk and Monitoring          | Planned                                                                                                                                                                                                                                                                                                                                                               |

> **Version numbering may be refined after each approved blueprint.** A blueprint can reveal that a version is too large, too small, or ordered wrongly. Renumbering is expected and is not a failure — but it must be recorded here, and a frozen version is never renumbered retroactively.

---

## 3. Project rules

These rules govern every version and every contributor, human or automated.

### Process

1. **Analyze before implementation.** Understanding precedes code.
2. **One bounded objective per version.** A version that does two things is two versions.
3. **Every version requires explicit acceptance criteria**, written before work starts.
4. **No production implementation before its blueprint is approved.**
5. **Every frozen version must have a verified local Git checkpoint**, recorded in section 1 with its commit SHA.

### Provider and data

6. **No provider integration without official permission**, an approved API, an affiliate relationship or a licensed feed.
7. **No unauthorized scraping**, and no circumvention of provider protections, rate limits or terms.

### AI

8. **No unrestricted AI free-text trip planning as the primary GTAI AI workflow.**
9. **AI planning is structured, adaptive and multi-agent.**

### Product

10. **Standard travel search remains the primary entry path.** AI enhances it; AI never replaces it or stands in front of it.

---

## 4. Version lifecycle

```mermaid
flowchart LR
  A[Analysis] --> B[Blueprint drafted]
  B --> C{Blueprint approved?}
  C -- No --> B
  C -- Yes --> D[Implementation authorized]
  D --> E[Verification]
  E --> F{Acceptance criteria met?}
  F -- No --> D
  F -- Yes --> G[Git checkpoint / Frozen]
  G --> H[Next version]
```

A version may only move from **Blueprint** to **Implementation authorized** through explicit approval. An implementation agent that has not been given an approved blueprint has no authority to design product behaviour.

---

## 5. Related documentation

| Document                                                                   | Purpose                                                                                                                 |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `docs/reference/V1_2_REFERENCE_UX_BLUEPRINT.md`                            | Master index and global principles for the V1.2 blueprint modules                                                       |
| `docs/reference/01_HOME_SEARCH_EXPERIENCE.md`                              | Frozen V1.2-A Home Search Experience blueprint                                                                          |
| `docs/reference/02_FLIGHT_SEARCH_FORM.md`                                  | Frozen V1.2-B Flight Search Form blueprint                                                                              |
| `docs/reference/03_AIRPORT_SELECTOR.md`                                    | Frozen V1.2-C Airport Selector blueprint                                                                                |
| `docs/reference/04_DATE_PICKER_AND_FLEXIBLE_DATES.md`                      | Frozen V1.2-D Date Picker blueprint                                                                                     |
| `docs/reference/05_FLIGHT_RESULTS.md`                                      | V1.2-E Flight Results blueprint, implemented through V2.3                                                               |
| `docs/reference/06_FLIGHT_FILTERS.md`                                      | V1.2-F Flight Filters blueprint (Filters half; Sorting specified in `05`), implemented through V2.4                     |
| `docs/reference/07_PROVIDER_INTEGRATION_BLUEPRINT.md`                      | V1.2-G forward-looking provider adapter blueprint; the outbound placeholder it targets is implemented in V2.5           |
| `docs/implementation/V2_1_FUNCTIONAL_AIRPORT_SELECTOR.md`                  | V2.1 implementation record for the Airport Selector                                                                     |
| `docs/implementation/V2_2_FUNCTIONAL_DATE_PICKER.md`                       | V2.2 implementation record for the Date Picker, frozen `973e28a0…`; V2.2.1 accessibility corrections frozen `bc1b295e…` |
| `docs/implementation/V2_3_FUNCTIONAL_FLIGHT_RESULTS.md`                    | V2.3 implementation record for the Search Intent and Results foundation, frozen `5df23826…`                             |
| `docs/implementation/V2_4_FUNCTIONAL_FLIGHT_FILTERS.md`                    | V2.4 implementation record for Flight Filters, frozen `83937ce9…`                                                       |
| `docs/implementation/V2_5_FLIGHT_RESULTS_POLISH_AND_OUTBOUND_BLUEPRINT.md` | V2.5 implementation record for Results Polish, the outbound placeholder and the provider blueprint, frozen locally      |
| `docs/architecture/V1_FOUNDATION.md`                                       | V1 architecture, routing, localization, region and currency rules                                                       |
| `docs/architecture/REFERENCE_POLICY.md`                                    | Which products inform GTAI's UX, and the hard line on copying                                                           |
| `docs/design-system/GTAI_DESIGN_SYSTEM.md`                                 | Palette, tokens, typography, elevation, motion, accessibility, RTL rules                                                |
