# GTAI V2.8-A — Partner Review Readiness

**Stage:** Implemented locally, uncommitted, pending review.
**Base checkpoint:** `aff8e5929bc63383724b23ecd39c29ad985dd604` (V2.7 — Functional Provider Runtime, frozen).
**Public site:** `https://gtai-global-travel-ai.vercel.app`
**Reference:** `docs/reference/09_PROVIDER_RUNTIME.md`, `05_FLIGHT_RESULTS.md`, `08_FLIGHT_DETAILS.md`

---

## 1. Why this stage exists

V2.7 built a real server boundary behind a deliberately fake inventory. Everything in the pipeline — registry, adapter contract, cancellation, validation, normalization, audit — is genuine; the offers are locally generated fiction.

That is a defensible engineering position and an indefensible _public_ one, because the website did not say so plainly enough. The homepage promised comparison "across trusted travel providers". The metadata described comparing fares. The footer said booking "is completed by our partners". None of that was true, and a travel-data or affiliate partner evaluating GTAI would have found the gap between the copy and the code within minutes.

Public truthfulness therefore has to come _before_ live-provider onboarding, not after it. A partner's first question is what the site currently claims, and the only good answer is one they can verify themselves. V2.8-A makes the public site say exactly what the product does.

## 2. Current state, stated plainly

- Flight itineraries, airlines, booking providers and prices are **fictional demonstration data** generated locally.
- **No live travel provider is connected.** None is named anywhere in the product, the source or the documentation's public-facing copy.
- **No booking, payment, affiliate link or outbound redirect exists.** The provider hand-off is a local modal that opens nothing.
- Live availability and booking are **not yet enabled**; integrations are described only as "being prepared".

## 3. Public company profile

`src/config/public-company-profile.ts` is the single source for every fact GTAI states about itself: legal entity `GROUPE AMERI INC.`, product `GTAI — Global Travel AI`, location `Quebec, Canada`, the public contact address, and the canonical origin. The Footer, all five public pages, the sitemap, `robots.ts` and the metadata helpers read from it.

Restating a company name in six places creates six places that can disagree, and an inconsistency is exactly what a reviewer would treat as reason to doubt the rest. What the module deliberately omits matters as much: no street address, no telephone number, no registration number, no financial detail, no credential, nothing about any commercial application. It imports nothing, reads no environment variable, and contains no secret — the base URL is a literal, because a canonical URL derived from deployment configuration silently breaks in preview builds.

`PUBLIC_DOCUMENTS_LAST_UPDATED` (currently `2026-08-04`) is one constant rendered by every policy page, so "Last updated" cannot say one thing on Terms and another on Privacy. It is fixed rather than `new Date()`: a revision date is a fact about the document, not about the day it is viewed.

## 4. Truthfulness corrections

Copy audited across the homepage, search form, Results, Details, provider preview, header, footer, empty/error/loading states and metadata. Corrected:

| Was                                                                             | Now                                                                                                |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| "Compare … across trusted travel providers" (hero, metadata ×5)                 | Comparison stated without implying connected providers; flight results named as demonstration data |
| "One search, many providers"                                                    | "One search, one comparison surface" — integrations "being prepared"                               |
| "You always see which provider supplies an offer and who completes the booking" | Every offer names its provider, "and today every one of them is a demonstration provider"          |
| Footer: "Booking and payment are completed by our partners"                     | "Booking and payment are not available on GTAI"                                                    |
| Affiliate points in present tense ("Selecting an offer may redirect you…")      | Split into what happens today (nothing) and what would happen if approved integrations activate    |
| "Transparent affiliate model — **Available now**"                               | Marked **planned**; "No commission is earned today"                                                |

The product vision is preserved throughout — the planned capabilities are still described, just as planned rather than present.

## 5. Disclosure architecture

`DemonstrationDataNotice` (`src/components/ui/DemonstrationDataNotice.tsx`) carries the claim once, in three weights:

- `compact` — one line inside the provider preview.
- `standard` — homepage, beneath the search surface; About.
- `prominent` — Results above the list, Details above the flight identity and price, Terms above the clauses.

Weight changes emphasis; it never changes the claim. The component is a `role="note"` landmark with an accessible name, carries an icon _and_ a title _and_ body text so nothing depends on colour, works in RTL through logical properties, and is **not dismissible** — a disclosure a visitor can close is absent for everyone who closed it, and the data is fictional on every view. It renders from already-loaded props and issues no request. Because it sits outside the state filters and sorting drive, it survives every view-state change.

The flight surfaces pass their own surface-specific points into the shared body, so Results and Details keep their precise wording while making the same underlying statement. Both now also name the identities as fictional, which the V2.7 copy did not: "Airlines and booking providers shown here are fictional demonstration identities." The provider preview labels the carrier and the provider individually, right where each name appears.

## 6. Partner-integration status

A restrained element on About and a short homepage card. It states that the product and provider runtime are under development, that live integrations require commercial and technical approval, and that results stay demonstration-only until an approved integration is activated. It names no company, no endpoint, no environment variable, no registry internal and no commercial process.

## 7. Public pages

Five localized routes under the existing locale architecture, all built from one `PublicPageShell` and one set of structured dictionary content — no per-language page implementations.

| Route                            | Content                                                                                                                                                                                                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/[locale]/about`                | What GTAI is, who builds it, what the current version does, integration status, what it does not do                                                                                                                                                                                                |
| `/[locale]/contact`              | Product, legal entity, location, email, `mailto:` link. No form, no backend, no collection                                                                                                                                                                                                         |
| `/[locale]/privacy`              | Written against what the code does: no account, no booking/payment data, search parameters to GTAI's own route, privacy-minimized server records, infrastructure providers may process technical data, no analytics intentionally enabled, no cookie banner because no non-essential cookie is set |
| `/[locale]/terms`                | Demonstration content, not an offer, not bookable; GTAI is not an airline/OTA/agent/processor; availability, acceptable use, IP, general law                                                                                                                                                       |
| `/[locale]/affiliate-disclosure` | "Today" (no links, no commission) separated from "Planned" (approved partners, compensation, price integrity, placement disclosure)                                                                                                                                                                |

Privacy claims no compliance certification, does not claim infrastructure logs are absent, and does not say data is never processed. Terms and the Disclosure both state they are not independently reviewed legal advice.

## 8. Footer and navigation

The Footer's legal group now links to all five pages through `PUBLIC_PAGE_PATHS`, so Footer, sitemap and routes cannot describe different sets. The duplicated `about`/`contact` placeholders were removed from the Company and Support groups. The legal entity and location are visible in the footer bar.

**The 44 px defect is fixed.** Footer group links rendered at `min-h-9` (36 px) — the one accessibility item carried openly through the V2.7 reports. They are now `min-h-11` with vertical padding _on the link_, not the row: padding on the `<li>` grows the layout without growing the target. Measured in-browser: zero sub-44 px interactive targets in the footer, at every width, in every locale.

Header navigation is unchanged — legal and company pages stay in the Footer, so the primary nav is not crowded and no layout shift is introduced.

## 9. Metadata and discoverability

`src/lib/seo/public-metadata.ts` provides three helpers. `buildPublicMetadata` sets localized title and description, a canonical URL, `hreflang` alternates for the four authored locales, Open Graph, a `summary` Twitter card and explicit `index, follow`. No image is declared — GTAI has no authored social card, and pointing at a missing file produces a broken preview rather than none.

`buildNonIndexableMetadata` gives Results and Details `noindex, nofollow, nocache` plus the Google-specific directives, because `noindex` alone still permits a cached snippet. Both pages now use the same helper, so they state one policy.

`sitemap.ts` enumerates the shared `PUBLIC_PAGE_KEYS` for each authored locale — 24 URLs, verified. Results and Details cannot enter it: the file iterates the list of pages meant to be public, so a generated itinerary has no route in even if one is added to the app later. `robots.ts` allows everything except `/api/` and `/*/flights/results`, and points at the sitemap.

A minimal Organization + WebSite JSON-LD graph ships in the layout. Every field is provable from this repository. Deliberately absent: `sameAs` (no confirmed social profile), `aggregateRating`, `Offer`, `Review`, any price.

## 10. Security and external-link policy

V2.8-A introduces no travel-provider request, no affiliate link, no booking or payment path, no API-key placeholder, no environment variable, no analytics, tag manager or chat widget, and no newsletter collection. The only outbound affordance is the `mailto:` contact link.

Verified against the **built** client bundle (21 assets): zero matches for provider hostnames, credential patterns, analytics scripts or payment SDKs — and no email address at all, since the contact page is server-rendered. In the browser, 44 resources loaded, all same-origin, zero console errors.

All V2.7 API and boundary protections are unchanged and re-asserted by `verify:providers` (294/294) and by regression checks 51–60 in the new script.

## 11. Verification

`npm run verify:partner-readiness` — **74/74**, against a required minimum of 60. Checks cover truthfulness (sweeping all four dictionaries, not English alone), the public profile, routes and localization completeness, the Footer contract, SEO and structured data, security and privacy, and V2.7 regression.

The six truthfulness rules were confirmed non-vacuous by injecting deliberate violations — "live fares from Skyscanner", "book now", "guaranteed lowest price", "live availability from our approved partners" — into the English dictionary. All six fired; the dictionary was then restored.

Existing gates: locations 42/42, dates 66/66, flights 142/142, filters 149/149, polish 88/88, details 106/106, providers 294/294. Build, typecheck, lint and format-check all clean.

## 12. The V2.8-A / V2.8-B boundary

V2.8-A is **presentation and truthfulness only**. It changes what the site says, not what it does. The provider runtime, the internal API, the validation boundary and the demonstration generator are untouched.

V2.8-B — whenever an approved integration exists — is where the behaviour changes: a real adapter behind the existing registry, live offers replacing generated ones, and a compliant referral hand-off. When that happens, the disclosure architecture built here is what has to change with it: the demonstration notice must be conditional on the data's actual source rather than unconditional, the Affiliate Disclosure's "Today" section must move to describing real relationships, and Results and Details become candidates for indexing only if their content stops being generated.

Nothing in V2.8-A presumes that stage will happen, and nothing here should be read as evidence that any partner has agreed to it.

## 13. Known limitations

1. **The demonstration notice is unconditional.** It is correct today because all data is fictional; it will need a data-source condition in V2.8-B rather than a copy edit.
2. **Only four of the 32 supported locales have authored content.** The other 28 route correctly and fall back to English, and are deliberately excluded from the sitemap so they are not submitted as distinct localized pages.
3. **Legal copy is not lawyer-reviewed**, and both Terms and Privacy say so.
4. **`ButtonLink` retains a dormant `external` branch** from an earlier version. No call site uses it, which verification asserts separately; it was left in place rather than removed as unrelated scope.
5. **No social card image exists**, so Open Graph declares none.

---

## 14. Round-2 corrections (pre-freeze)

Six defects found on review of the first V2.8-A pass. Each was the site describing itself slightly wrong rather than the code misbehaving — which is exactly the class this release exists to eliminate.

### 14.1 robots.txt no longer blocks the pages that must publish `noindex`

The first pass disallowed `/*/flights/results` **and** set `noindex` on those pages, describing the two as complementary layers. They are not. A crawler refused the fetch never reads the directive it was refused, and the bare URL can still be listed from links found elsewhere — so blocking made the exclusion _less_ reliable, not more.

`robots.txt` now allows normal crawling and disallows only `/api/`, which publishes no HTML and no directive at all. Results and Details keep `noindex, nofollow, nocache` plus the Google-specific directives, and stay absent from the sitemap. That is the whole mechanism, and it works because a crawler can read it. The check that certified the old disallow was replaced by two: one asserting `/api/` is disallowed and the sitemap published, one asserting Results and Details are **not** disallowed.

### 14.2 Privacy copy now matches the runtime

Three factual defects, corrected in all four dictionaries:

- **Audit persistence.** The copy said GTAI "records a privacy-minimized summary of each search". The runtime builds that shape and hands it to `noopAuditSink`, whose `record()` is empty — the orchestrator default is `options.auditSink ?? noopAuditSink`. The copy now says the shape is built, that the default sink does not persist it, that GTAI operates no persistent application-level search audit log **in this release**, that this says nothing about hosting or infrastructure logs, and that persistent auditing would need a retention and access policy first.
- **Request metadata.** "Nothing else about you is attached to the request" was categorically false — normal web delivery carries an IP address, a User-Agent and headers. The copy now states what GTAI does not _intentionally_ attach (account identifier, passenger identity, passport, payment) and acknowledges the technical fields infrastructure providers may process.
- **Browser storage.** The Airport Selector stores recent location identifiers in `sessionStorage` (`use-recent-locations.ts` — entity ids only, never `localStorage`), and Privacy said nothing about it. A new section in every locale explains that it is tab-scoped browser storage, not a cookie, that it normally disappears with the tab, and that GTAI does not use it as an analytics identifier. The URL statement now also notes that a URL can remain in browser history and that a shared link exposes the search it describes.

### 14.3 Homepage metadata uses the shared architecture

The homepage returned only a title and description. It now calls `buildPublicMetadata` with `path: "/"`, so it gets a canonical (`/en`, `/fr`, `/fa`, `/ar`), the four authored `hreflang` alternates plus `x-default` to English, Open Graph type/site name/title/description/url, a `summary` Twitter card and explicit `index, follow` — from the same helper the five public pages use, not a second implementation.

### 14.4 Requested locale and content locale are now separate

GTAI routes 32 locales and authors 4. The other 28 rendered English text while declaring `lang="de"`, self-canonicalizing to `/de/...` and staying indexable — a page that misstated its own language and duplicated the English one under a different URL.

`hasAuthoredDictionary(locale)` and `resolveContentLocale(locale)` in `config/locales.ts` make the distinction explicit:

| Concept              | Drives                                                                | `/de/about` |
| -------------------- | --------------------------------------------------------------------- | ----------- |
| **Requested locale** | URL, locale selector, region/currency heuristic, internal routing     | `de`        |
| **Content locale**   | `<html lang>`, `<html dir>`, dictionary, metadata language, canonical | `en`        |

For an unauthored locale the page is `noindex, follow, nocache` — followed, because its links are real — canonicalizes to the English equivalent, and lists only authored translations as alternates. The layout applies the same default so unauthored _product_ pages are covered too. Results and Details stay `noindex` in every locale.

Verified live: `/de/about`, `/ur/privacy` and `/ja/terms` all render `lang="en" dir="ltr"`, `noindex, follow, nocache`, canonical `/en/...`. `/fa/privacy` and `/ar/terms` remain `lang="fa"` / `lang="ar"`, `dir="rtl"`, self-canonical and indexable.

The 32-locale architecture is unchanged, and the region/currency heuristic still uses the requested locale.

### 14.5 Remaining present-tense claims

| Key                                               | Was                                               | Now                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `affiliate.title`                                 | "How GTAI makes money"                            | "Planned affiliate model — how GTAI may earn revenue later"                                                 |
| `trust.items[2].description`                      | Commission links "are labelled where they appear" | "If commission-earning links are introduced, they will be labelled… None exist today."                      |
| `footer.buildNotice`                              | "GTAI compares travel offers."                    | "GTAI currently demonstrates travel comparison with fictional data. Booking and payment are not available." |
| `pages.{flights,stays,cars,packages}.description` | "GTAI compares X across approved providers"       | "is being built to compare…" plus "No X provider is connected yet."                                         |

Applied in all four locales. The Persian product descriptions and the English `stays` description were the specific defects named; the French and Arabic equivalents were audited and corrected in the same pass.

### 14.6 Verification tests semantics, per locale

`verify:partner-readiness` is now **114 checks**, up from 74. The English-only regexes of the first pass could not have caught a false claim in French, Persian or Arabic, so the new checks name the exact reviewed key and the exact localized marker, and report _which locales_ failed rather than a bare boolean.

All six reintroduced defects were confirmed to fire: restoring the robots disallow, the persistent-audit claim, the categorical request wording, the removed `sessionStorage` section, the present-tense affiliate title and product description, and the Persian trust item produced 10 failures across 10 distinct checks.

One check was found weak during that exercise and strengthened. Check 85 asserted `publicUrl(localePath(defaultLocale, path))` appeared _anywhere_ in the SEO module, which the `x-default` alternate also satisfies — so it passed even with the canonical branch deleted. It now anchors on the `const canonical = authored …` ternary specifically, and was re-proved to fail when that branch is removed.

### 14.7 `.env.example` — accurate reporting

The previous report said "no API-key placeholder exists". That was true of `src/`, which is what the check scanned, but the repository does track `.env.example`. The accurate statement, now asserted by three checks:

- **no real key exists** — every `NAME=` line has an empty value;
- **no key is required** — every line in the file is commented out, so no variable is even active;
- **no key is exposed to the client** — no documented `NEXT_PUBLIC_*` name is read anywhere;
- **documented empty future placeholders remain unused** — no documented name appears in any `process.env.*` read in the application.

---

## 15. Round-3 corrections (final pre-freeze)

Six consistency defects. None changed behaviour; all six were the site or its own documentation stating something that was not quite true.

### 15.1 Legal revision date

`PUBLIC_DOCUMENTS_LAST_UPDATED` is now `2026-08-04`, matching the date the documents were actually revised. It remains one fixed shared ISO literal — never `new Date()` — rendered by Privacy, Terms and the Affiliate Disclosure through `PublicPageShell`. The stale verification expectation and the documentation reference were updated with it.

### 15.2 Locale counts now match the code

The repository defines **32** supported URL locales, **4** authored dictionaries (`en`, `fr`, `ar`, `fa`) and therefore **28** English fallbacks. Comments and documents said 33 and 29. Corrected in `config/locales.ts`, the locale layout, this document and the V1.2 blueprint. No locale was added or removed — the counts were simply wrong. Four deterministic checks now derive the numbers from `localeCodes` and `hasAuthoredDictionary` rather than restating them, so the same drift cannot recur silently.

### 15.3 Current public capabilities

The remaining copy still described a complete multi-product live comparison. Corrected in all four authored locales:

| Key                             | Was                                                                | Now                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hero.subtitle`                 | "Compare flights, stays, cars and packages in one search."         | "Explore GTAI's flight-comparison experience with locally generated demonstration results. Stay, car and package integrations are planned."             |
| `reassurance.label`             | "What comparing with GTAI gives you"                               | "What GTAI does today"                                                                                                                                  |
| `reassurance.items[0]`          | "instead of checking every site yourself"                          | "One demonstration comparison surface… running on locally generated demonstration data"                                                                 |
| `reassurance.items[1]`          | "the provider that **supplies** it"                                | "each of those identities is fictional and shown for demonstration. No external provider supplies data here."                                           |
| `destinations.title`            | "Where travellers are heading"                                     | "Sample destinations to explore"                                                                                                                        |
| `destinations.description`      | "Live trends will follow…"                                         | "Illustrative destinations… not live popularity or trend data"                                                                                          |
| `pages.*.emptyDescription`      | "GTAI is still connecting its X providers."                        | "No live provider results are available. This product category is not connected in the current release…" (Flights instead names its demonstration data) |
| `footer.tagline`                | "Global travel comparison, built in Canada…"                       | "A multilingual travel-comparison platform being built in Canada…"                                                                                      |
| `why.title` / `why.description` | "GTAI **combines** metasearch comparison with structured planning" | "is being built to combine… Most of that capability is still planned."                                                                                  |

"Still connecting its providers" was the subtlest of these: it implies an approved connection already in progress, which is not true of any product category. The visible `Coming soon` status labels were left intact.

### 15.4 JSON-LD contact type

The Organization graph described the public mailbox as `customer support`. It is not a support desk — it handles general, partnership and technical inquiries — so the type is now `general inquiries`. No telephone number, street address or support-level claim was added.

### 15.5 One contact source

`config/brand.ts` still carried an unused `contactPlaceholder: "hello@example.invalid"`. It had no call site, and an unused second email constant is a second answer to "how do people reach GTAI". Removed rather than replaced. `publicCompanyProfile.contactEmail` is now the only email in `src/config`, asserted by a check that scans every configuration file and requires exactly one distinct address.

### 15.6 `.env.example`

The tracked example still described V1 and claimed GTAI "has no published domain yet", which stopped being true when the Vercel origin was published. Comments now state the V2.8-A facts: no environment variable is required, the canonical origin is a literal in the shared profile, no provider is connected, the local demonstration adapter needs no credential, no key is exposed to the browser, there is no server-side persistence, recent locations use tab-scoped `sessionStorage`, and every placeholder remains commented, empty and unread. The obsolete `NEXT_PUBLIC_SITE_URL` placeholder was dropped — the origin is deliberately not an environment variable. No variable was activated and no new `process.env` read was introduced.

### 15.7 Verification

`verify:partner-readiness` is now **148 checks**, up from 114. The 33 new checks cover the revision date, the three locale counts derived from code, the seven corrected copy areas across all four locales explicitly, the JSON-LD contact type, the single-contact-source invariant and `.env.example` accuracy.

The JSON-LD checks assert against the real source of `buildOrganizationJsonLd` rather than importing it: the verification harness compiles to CommonJS and runs under plain Node, where the `@/` path alias does not resolve. Asserting on source is the technique the rest of the script already uses, and it avoids restating the implementation as its own expectation.

---

## 16. Round-4 corrections (freeze)

Six defects, all of the same kind as round 3: the site describing a state of affairs that is close to true but not true. Two of them also had a structural cause, and those were fixed at the structure rather than at the copy.

### 16.1 The unavailable-search notice

`search.notice` read "GTAI is still connecting its travel providers. You will be able to run this search soon." Both halves were wrong. Nothing is being connected — no provider is approved, connected or supplying data — and nobody can promise "soon" for something that depends on an approval that has not been sought and granted. It now reads, in each authored locale:

> This product category is not connected in the current release. Any future provider integration would require commercial and technical approval before activation.

The string is rendered immediately after `search.submitDisabledHint` inside a single `Alert` live region, so the two are read consecutively by a screen reader as well as visually. Verification asserts that property directly — both strings are complete sentences, neither contains the other, and the component still emits them adjacent.

### 16.2 Approval is a prerequisite, not a status

Copy across the reassurance strip, the four product descriptions and the four empty states qualified providers as **approved** ("compare fares across approved providers") and announced that "approved provider integrations are being prepared". Read plainly, that says an approval exists. None does.

The policy the copy now follows: approval is a future prerequisite. Providers are described without the qualifier, and any mention of approval is tied to a future activation that has not happened. The Affiliate Disclosure's forward-looking language was deliberately **not** removed — "GTAI may later work with approved affiliate or referral partners" is a conditional about the future, which is exactly the shape the rest of the copy now takes, and a check guards it against over-correction in a later pass.

The Explore empty state had the same problem in a different form: "Destination discovery opens once GTAI's travel partners are connected" presupposes partners who exist and are merely unwired. It now says discovery would open only if integrations are approved and connected, and that none is today.

### 16.3 General applicable-law language

The Terms designated the law of Quebec as governing. Naming a governing law is a jurisdictional position, and this one had not been reviewed by a lawyer — the same page says so two paragraphs later. The section now states that the terms are subject to applicable law and that nothing in them limits any mandatory consumer protection that applies to the reader. No court, venue or exclusive-forum clause appears anywhere on the site.

Quebec survives where it is a plain fact rather than a legal claim: `publicCompanyProfile.publicLocation`, the footer, About, Contact, and the `addressRegion` of the Organization graph. Verification asserts both halves — absent from the Terms, present as the location.

### 16.4 Complete metadata on the static product pages

The seven product routes (`flights`, `stays`, `cars`, `packages`, `explore`, `trips`, `ai-travel`) returned a bare `{ title, description }`. They therefore had no canonical URL, no `hreflang` alternates and no robots directive — which meant every unauthored locale self-canonicalized. `/ur/flights` was an indexable page of English text claiming to be a distinct Urdu URL, thirty-two times over per route.

All seven now build metadata through the same `buildPublicMetadata` the information pages use, so one policy covers every public page. Paths come from a new `PRODUCT_PAGE_PATHS` constant.

That constant is deliberately **separate** from `PUBLIC_PAGE_PATHS` rather than an extension of it. The two lists need the same canonical and indexing policy but differ on one point: sitemap inclusion. A sitemap entry is a request to index, and the sitemap is meant to be the set of pages describing the company — not the set describing capabilities that do not exist yet. Keeping the lists distinct is what lets verification state "the sitemap is exactly the 24 information URLs" as a checkable fact rather than an accident of which array something was appended to. The sitemap is unchanged at 24 URLs and contains no product path.

### 16.5 Direction on a fallback product page

The product routes passed `getDirection(locale)` — the **requested** locale — to `ProductPageShell`. For an unauthored RTL locale the result was English prose laid out right-to-left: `/ur/flights` rendered `dir="rtl"` around an English search form.

They now resolve the content locale first, matching the split the layout and the information pages already used: content locale drives `lang`, `dir` and the dictionary; requested locale drives the URL, the language selector and the region/currency heuristic. Verified in the production build:

|             | `lang` | `dir` | RTL containers | robots            | canonical   | selector | currency |
| ----------- | ------ | ----- | -------------- | ----------------- | ----------- | -------- | -------- |
| `/ur/stays` | `en`   | `ltr` | 0              | `noindex, follow` | `/en/stays` | اردو     | ₨        |
| `/fa/stays` | `fa`   | `rtl` | present        | `index, follow`   | `/fa/stays` | فارسی    | —        |

`ur` is the case worth naming: supported, RTL, unauthored. Requested and content direction genuinely disagree there, so it is the locale that proves the correction does something.

### 16.6 The footer placeholder notice

`footer.placeholderNotice` said "Some destinations below are not published yet." The footer lists pages, not destinations, and the notice sits beside link labels rendered as plain text. It now says so.

### 16.7 Verification

`verify:partner-readiness` is now **174 checks**, up from 148. The 26 new checks cover all six corrections, and every copy assertion runs per-locale and reports the failing locale codes rather than passing on English alone.

Each new check was proved non-vacuous by reintroducing the defect it exists to catch and confirming it — and only it, plus the checks that genuinely overlap — failed. Two authoring defects surfaced during that pass and were fixed:

- A French noun change (`fournisseur` → `loueur` in the car empty state) was scope creep beyond the correction and broke an existing round-3 check. Reverted to the shared noun.
- The new Explore check asserted `plannedMarker`, a marker set written for "being built / not connected" copy that does not fit a conditional sentence. Rewritten to assert what the sentence actually claims: that no integration exists today.

---

## 17. Final indexing policy (freeze)

Round 4 gave the seven product routes complete metadata, which made all of them
indexable on authored locales. That was correct as metadata and wrong as policy:
six of the seven describe capabilities GTAI has not built. A search result for
"compare car rental" that lands a traveller on a page saying no supplier is
connected wastes their time, and a site that does that repeatedly earns a
reputation it then has to undo. Being honest on the page is necessary; it is not
a reason to compete for the query.

### 17.1 The policy

| Route                                                | Authored locale              | Unauthored locale          | In sitemap |
| ---------------------------------------------------- | ---------------------------- | -------------------------- | ---------- |
| Homepage                                             | `index, follow`              | `noindex, follow, nocache` | yes        |
| Flights                                              | `index, follow`              | `noindex, follow, nocache` | no         |
| About, Contact, Privacy, Terms, Affiliate Disclosure | `index, follow`              | `noindex, follow, nocache` | yes        |
| Stays, Cars, Packages, Explore, Trips, AI Travel     | `noindex, follow, nocache`   | `noindex, follow, nocache` | no         |
| Results, Details                                     | `noindex, nofollow, nocache` | same                       | no         |

Flights is the one product route that earns indexing: it has a working public
demonstration search, results, filters, sorting and details. A visitor who
arrives there can do the thing the page describes.

Three distinct reasons produce `noindex`, and conflating them would be a mistake:

1. **Unauthored locale** — the page is English text under a non-English URL. It
   is a duplicate of the English page, so it canonicalizes there.
2. **Planned route** — nothing behind it in any language. Still `follow`,
   because its links are real and lead to pages worth crawling.
3. **Results and Details** — query-specific generated demonstration content.
   These are also `nofollow`, because the links on them lead to more generated
   itineraries. This is the one case that is a quarantine.

`robots.txt` continues to allow all of these paths. That is not an oversight: a
crawler refused the fetch never reads the `noindex` it was refused, and the bare
URL can still surface. Blocking and `noindex` are alternatives, not layers.

### 17.2 One builder, one flag

`buildPublicMetadata` gained an optional `indexable` parameter defaulting to
`true`, and computes:

```ts
const indexed = authored && indexable;
```

A page must clear both conditions. Everything else — canonical URL, `hreflang`
alternates, `x-default`, Open Graph, Twitter — is computed identically for every
public page, indexed or not, because those are all still true and useful for a
page that simply should not rank. The six planned routes therefore publish
complete, truthful metadata and a `noindex` directive at the same time.

This is a flag rather than a second builder deliberately. A parallel
`buildPlannedPageMetadata` would have duplicated canonical and alternate logic,
and the next canonical-URL correction would have had to be made twice — with
nothing to catch it if it were made once.

`buildNonIndexableMetadata` is unchanged and still serves Results and Details.
Its `follow: false` is the reason it stays separate: that is a genuinely
different policy, not a variation on this one.

### 17.3 The sitemap did not change

Still exactly **24** URLs — four authored locales × (homepage + five information
pages). No product or planning route was added, Flights included. A sitemap
entry is a request to index; the sitemap is the set of pages describing the
company, which is what a partner or a traveller searching for GTAI is looking
for.

Flights is indexable but absent from the sitemap. That is intentional and not a
contradiction: `index` says "you may rank this if you find it", the sitemap says
"please go find this". Flights is linked from every page's navigation, so
discovery is not the problem the sitemap would be solving.

### 17.4 Verification

`verify:partner-readiness` is now **195 checks**, up from 174. The 20 new checks
establish the policy from three real sources rather than restating it: the
locale table for which locales are authored, each route's own source for whether
it opts out, and the shared builder's source for how the two combine. Check 177b
guards that last link — without it, the derived predicate the other checks use
would be an assumption about the implementation rather than a reading of it.

Both links were proved non-vacuous independently:

- Removing the `indexable: false` opt-out from Cars failed check 164 alone.
- Changing the builder to `const indexed = authored` — so the opt-out silently
  did nothing — failed check 177b alone. This is the failure mode that matters:
  the six route-level checks would still have passed, because they read route
  source. 177b is what makes them mean anything.

One stale expectation surfaced: check 37 pinned the literal expression
`authored ? { index: true, follow: true }`. It now asserts the renamed
expression and additionally that none of the five information pages opts out of
indexing — the opt-out must not spread to the pages GTAI most wants found.
