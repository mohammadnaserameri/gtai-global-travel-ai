/**
 * Deterministic checks for GTAI V2.8-A — Partner Review Readiness.
 *
 * The question this script exists to answer is narrow and unusual: *is the
 * public website honest about what it currently does?* That is not something
 * type-checking or a build can establish, because every untruthful claim this
 * release corrects was a perfectly valid string.
 *
 * So the checks below read real source, the real dictionaries and the real
 * shared contracts, and assert properties of them — a route file exists, a
 * constant holds a specific value, a phrase does *not* appear in public copy.
 * Where a rule is about absence, the sweep runs over every locale rather than
 * English alone, because a claim removed from one dictionary and left in three
 * is still published to most of the world.
 *
 *   npm run verify:partner-readiness
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  dictionaryLocales,
  getDirection,
  hasAuthoredDictionary,
  localeCodes,
  resolveContentLocale,
} from "../src/config/locales";
import {
  NON_INDEXABLE_PATH_SEGMENTS,
  PUBLIC_DOCUMENTS_LAST_UPDATED,
  PRODUCT_PAGE_KEYS,
  PRODUCT_PAGE_PATHS,
  PUBLIC_PAGE_KEYS,
  PUBLIC_PAGE_PATHS,
  publicCompanyProfile,
  publicContactMailto,
  publicUrl,
} from "../src/config/public-company-profile";
import { localePath } from "../src/i18n/routing";
import enDict from "../src/i18n/dictionaries/en.json";
import frDict from "../src/i18n/dictionaries/fr.json";
import faDict from "../src/i18n/dictionaries/fa.json";
import arDict from "../src/i18n/dictionaries/ar.json";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}

function ok(name: string, condition: boolean): void {
  check(name, condition, true);
}

const repoRoot = process.cwd();
const readSource = (relativePath: string): string =>
  readFileSync(join(repoRoot, relativePath), "utf8");
const exists = (relativePath: string): boolean =>
  existsSync(join(repoRoot, relativePath));

/** Every `.ts`/`.tsx` file under a directory, recursively. */
function collectSourceFiles(relativeDir: string): string[] {
  const absolute = join(repoRoot, relativeDir);
  if (!existsSync(absolute)) return [];
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) found.push(full);
    }
  };
  walk(absolute);
  return found;
}

/**
 * Comment text is not shipped copy, and several checks below forbid phrases
 * that the code's own comments legitimately quote while explaining why they
 * are forbidden. Every claim assertion therefore runs over stripped source.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** A source file with its comments removed. */
const readCode = (relativePath: string): string =>
  stripComments(readSource(relativePath));

/**
 * Excluded from the "no forbidden name appears in source" sweeps, for the
 * obvious reason: this script has to name what it forbids in order to search
 * for it. `verify-providers.ts` is excluded from the travel-brand sweep for
 * the same reason — V2.7 deliberately keeps real airline and agency names
 * there as adversarial fixtures that must be *rejected*.
 */
const SELF_REFERENTIAL: readonly string[] = [
  join("scripts", "verify-partner-readiness.ts"),
  join("scripts", "verify-providers.ts"),
  // V2.8-B's suite asserts that no travel company is named anywhere in the
  // external provider layer, which it can only do by naming them itself.
  join("scripts", "verify-provider-integration-readiness.ts"),
];
const isSelfReferential = (file: string): boolean =>
  SELF_REFERENTIAL.some((suffix) => file.endsWith(suffix));

type Dict = typeof enDict;
const DICTIONARIES: readonly (readonly [string, Dict])[] = [
  ["en", enDict],
  ["fr", frDict as unknown as Dict],
  ["fa", faDict as unknown as Dict],
  ["ar", arDict as unknown as Dict],
];

/** Every string value anywhere in a dictionary — the whole of a locale's visible copy. */
function allStrings(value: unknown, into: string[] = []): string[] {
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) for (const item of value) allStrings(item, into);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value)) allStrings(item, into);
  }
  return into;
}

const ALL_COPY: readonly { locale: string; text: string }[] = DICTIONARIES.flatMap(
  ([locale, dict]) => allStrings(dict).map((text) => ({ locale, text })),
);

/**
 * Copy matching a pattern, reported with its locale so a failure is actionable.
 *
 * `exempt` runs against the **full** string, and the truncation for the failure
 * message happens afterwards. Filtering the truncated form was a real defect in
 * an earlier draft of this script: a sentence like "demonstration data, not
 * live fares" had its "not" cut off by the 90-character slice, so the exemption
 * never matched and the corrected copy was reported as a violation.
 */
function copyMatching(pattern: RegExp, exempt?: RegExp): string[] {
  return ALL_COPY.filter(
    (entry) =>
      pattern.test(entry.text) &&
      !(exempt !== undefined && exempt.test(entry.text)),
  ).map((entry) => `${entry.locale}: ${entry.text.slice(0, 90)}`);
}

function main(): void {
  const publicPageRoutes: Record<string, string> = {
    about: "src/app/[locale]/about/page.tsx",
    contact: "src/app/[locale]/contact/page.tsx",
    privacy: "src/app/[locale]/privacy/page.tsx",
    terms: "src/app/[locale]/terms/page.tsx",
    affiliateDisclosure: "src/app/[locale]/affiliate-disclosure/page.tsx",
  };

  const homeSource = readSource("src/app/[locale]/page.tsx");
  const resultsExperience = readSource(
    "src/components/flights/FlightResultsExperience.tsx",
  );
  const detailsExperience = readSource(
    "src/components/flights/details/FlightDetailsExperience.tsx",
  );
  const handoffModal = readSource(
    "src/components/flights/ProviderHandoffModal.tsx",
  );
  const footerSource = readSource("src/components/layout/Footer.tsx");
  const footerCode = readCode("src/components/layout/Footer.tsx");
  const navigationSource = readSource("src/config/navigation.ts");
  const sitemapSource = readSource("src/app/sitemap.ts");
  const profileSource = readSource("src/config/public-company-profile.ts");
  const seoSource = readSource("src/lib/seo/public-metadata.ts");
  const seoCode = readCode("src/lib/seo/public-metadata.ts");

  // === TRUTHFULNESS =============================================================
  ok(
    "1. the homepage renders the shared demonstration disclosure",
    /DemonstrationDataNotice/.test(homeSource) &&
      /demonstrationNotice/.test(homeSource),
  );
  ok(
    "2. Results renders the shared demonstration disclosure",
    /<DemonstrationDataNotice/.test(resultsExperience) &&
      /labels\.disclosure\.points/.test(resultsExperience),
  );
  ok(
    "3. Details renders the shared demonstration disclosure",
    /<DemonstrationDataNotice/.test(detailsExperience) &&
      /labels\.disclosure\.points/.test(detailsExperience),
  );
  ok(
    "4. the provider preview labels its provider and carrier as demonstration identities",
    /demonstrationProvider/.test(handoffModal) &&
      /carrierNote/.test(handoffModal) &&
      DICTIONARIES.every(
        ([, dict]) =>
          dict.flightResults.outbound.demonstrationProvider.length > 0 &&
          dict.flightResults.outbound.carrierNote.length > 0,
      ),
  );
  // A present-tense claim of live fares. `will`/`would`/`may` phrasing is
  // future tense and permitted; the pattern targets the assertive form only.
  check(
    "5. no public copy claims live fares",
    copyMatching(
      /\b(live|real[- ]time)\s+(fares?|prices?)\b/i,
      // Denials are the point of this release, not violations of it. Each
      // alternative is the exact negating phrasing used in one locale.
      /\bnot\s+(a\s+)?live\b|\bnot\s+(a\s+)?real\b|\bne sont (ni|pas)\b|\bni tarifs? réels?\b/i,
    ),
    [],
  );
  check(
    "6. no public copy claims live availability",
    copyMatching(/\blive availability\b/i, /\bnot\b|\bnot yet\b|\bno\b/i),
    [],
  );
  check(
    "7. no public copy claims an approved or existing provider partnership",
    copyMatching(
      /\b(our|approved|official)\s+(partners?|partnership)\b|\bpartnered with\b|\bin partnership with\b/i,
    ),
    [],
  );
  check("8. no public copy names Skyscanner", copyMatching(/skyscanner/i), []);
  ok(
    "8b. no source file mentions Skyscanner",
    [...collectSourceFiles("src"), ...collectSourceFiles("scripts")]
      .filter((file) => !isSelfReferential(file))
      .every((file) => !/skyscanner/i.test(readFileSync(file, "utf8"))),
  );
  check(
    "9. no public copy claims booking or payment is enabled here",
    copyMatching(/\bbook (now|this|your)\b|\bcomplete your (booking|payment)\b/i),
    [],
  );
  check(
    "10. no guaranteed-cheapest or lowest-price claim exists",
    copyMatching(
      /\b(guarantee[ds]?|lowest|best) price\b|\bcheapest guarantee\b|\bprice match\b/i,
    ),
    [],
  );

  // === PUBLIC PROFILE ===========================================================
  ok(
    "11. one shared public profile module exists",
    exists("src/config/public-company-profile.ts"),
  );
  check(
    "12. legal company name",
    publicCompanyProfile.legalName,
    "GROUPE AMERI INC.",
  );
  check(
    "13. public location",
    publicCompanyProfile.publicLocation,
    "Quebec, Canada",
  );
  check(
    "14. public website is the production domain",
    publicCompanyProfile.websiteUrl,
    "https://gtai-global-travel-ai.vercel.app",
  );
  ok(
    "15. no street address is published",
    // A street address is a number followed by a road-type word. The profile
    // carries province and country only.
    !/\d+\s+\w+\s+(street|st\.|avenue|ave|road|rd|boulevard|blvd|rue|chemin)/i.test(
      profileSource,
    ) && copyMatching(/\d+\s+(rue|street|avenue|boulevard)\b/i).length === 0,
  );
  ok(
    "16. no telephone number is published",
    (() => {
      // ISO dates are removed first: `2026-08-03` is digits and separators and
      // would otherwise read as a phone number to any loose pattern.
      const withoutDates = stripComments(profileSource).replace(
        /\d{4}-\d{2}-\d{2}/g,
        "",
      );
      return (
        !/\+?\d[\d\s().-]{8,}\d/.test(withoutDates) &&
        copyMatching(/\+\d[\d\s().-]{8,}\d/).length === 0
      );
    })(),
  );
  check(
    "16b. the public contact email",
    publicCompanyProfile.contactEmail,
    "mohammad.naserameri@gmail.com",
  );
  check(
    "16c. the mailto target is built from it",
    publicContactMailto,
    "mailto:mohammad.naserameri@gmail.com",
  );

  // === PUBLIC PAGES =============================================================
  for (const [index, key] of PUBLIC_PAGE_KEYS.entries()) {
    ok(`${17 + index}. the ${key} route exists`, exists(publicPageRoutes[key]));
  }
  ok(
    "22. every public route lives under the locale segment and uses the shared paths",
    PUBLIC_PAGE_KEYS.every((key) => publicPageRoutes[key].includes("[locale]")) &&
      PUBLIC_PAGE_KEYS.every((key) =>
        /PUBLIC_PAGE_PATHS/.test(readSource(publicPageRoutes[key])),
      ),
  );
  ok(
    "23. all four dictionaries carry the navigation labels for every public page",
    DICTIONARIES.every(([, dict]) =>
      PUBLIC_PAGE_KEYS.every((key) => {
        const nav = dict.nav as unknown as Record<string, string>;
        return typeof nav[key] === "string" && nav[key].length > 0;
      }),
    ),
  );
  ok(
    "24. all four dictionaries carry the demonstration and partner-status copy",
    DICTIONARIES.every(([, dict]) => {
      const notice = dict.demonstrationNotice;
      const status = dict.partnerStatus;
      return (
        notice.title.length > 0 &&
        notice.compact.length > 0 &&
        notice.body.length > 0 &&
        notice.points.length >= 3 &&
        status.title.length > 0 &&
        status.description.length > 0 &&
        status.points.length >= 3 &&
        status.homeTitle.length > 0 &&
        status.homeDescription.length > 0
      );
    }),
  );
  ok(
    "24b. all four dictionaries carry every public page's content",
    DICTIONARIES.every(([, dict]) => {
      const p = dict.publicPages;
      return (
        p.about.sections.length >= 4 &&
        p.contact.topics.length >= 3 &&
        p.privacy.sections.length >= 7 &&
        p.terms.sections.length >= 6 &&
        p.affiliateDisclosure.current.length >= 3 &&
        p.affiliateDisclosure.future.length >= 5
      );
    }),
  );
  ok(
    "25. no placeholder or untranslated marker remains in any dictionary",
    ALL_COPY.every(
      (entry) =>
        !/\b(TODO|TBD|FIXME|Lorem ipsum|XXX|PLACEHOLDER)\b/i.test(entry.text) &&
        !/\{\{|\}\}/.test(entry.text),
    ),
  );
  ok(
    "25b. the non-English dictionaries are genuinely translated, not English copies",
    DICTIONARIES.filter(([locale]) => locale !== "en").every(([, dict]) => {
      // Compared on a paragraph that is long enough that an accidental match
      // could not be coincidental.
      return dict.publicPages.privacy.intro !== enDict.publicPages.privacy.intro;
    }),
  );

  // === FOOTER ===================================================================
  const legalGroup = enDict.footer.groups.legal.links as unknown as Record<
    string,
    string
  >;
  ok(
    "26. the footer publishes all five required links",
    PUBLIC_PAGE_KEYS.every((key) => typeof legalGroup[key] === "string"),
  );
  ok(
    "27. every footer target meets the 44 px contract",
    // `min-h-11` is 2.75rem = 44px in this project's scale. The previous
    // `min-h-9` (36px) must be gone from the footer entirely.
    /min-h-11/.test(footerCode) && !/min-h-9/.test(footerCode),
  );
  ok(
    "28. footer links are internal localized paths built through localePath",
    /localePath\(locale, link\.path\)/.test(footerSource) &&
      /PUBLIC_PAGE_PATHS/.test(navigationSource),
  );
  ok(
    "29. the legal company name is visible in the footer",
    /publicCompanyProfile\.legalName/.test(footerSource),
  );
  ok(
    "30. the footer declares no duplicate interactive destination",
    (() => {
      // Only the footer's own declaration. `primaryNav` legitimately repeats
      // product paths that the footer's Travel group also lists; those are two
      // different navigations, not duplicate links within one.
      const block = navigationSource.slice(
        navigationSource.indexOf("export const footerGroups"),
      );
      const paths = [
        ...block.matchAll(/path:\s*(?:"([^"]+)"|PUBLIC_PAGE_PATHS\.(\w+))/g),
      ]
        .map(
          (m) => m[1] ?? PUBLIC_PAGE_PATHS[m[2] as keyof typeof PUBLIC_PAGE_PATHS],
        )
        .filter((p): p is string => typeof p === "string");
      return paths.length >= 10 && new Set(paths).size === paths.length;
    })(),
  );

  // === SEO ======================================================================
  ok(
    "31. the sitemap enumerates the shared public page list",
    /PUBLIC_PAGE_KEYS/.test(sitemapSource) &&
      /PUBLIC_PAGE_PATHS/.test(sitemapSource),
  );
  ok(
    "31b. the sitemap covers every authored locale's homepage and public pages",
    /dictionaryLocales/.test(sitemapSource) && dictionaryLocales.length === 4,
  );
  ok(
    "32. the sitemap cannot contain Results",
    !/flights\/results/.test(sitemapSource) && !/flights/.test(sitemapSource),
  );
  ok(
    "33. the sitemap cannot contain Details",
    !/offerId/.test(sitemapSource) && !/demo-/.test(sitemapSource),
  );
  ok("34. a robots configuration exists", exists("src/app/robots.ts"));
  ok(
    "34b. robots disallows /api/ and publishes the sitemap",
    (() => {
      const robots = readCode("src/app/robots.ts");
      return /disallow:\s*\["\/api\/"\]/.test(robots) && /sitemap:/.test(robots);
    })(),
  );
  ok(
    "34c. robots does NOT disallow Results or Details",
    (() => {
      // The rule this replaced was wrong. Blocking a URL in robots.txt and
      // marking it `noindex` are alternatives, not layers: a crawler refused
      // the fetch never reads the directive it was refused, and the bare URL
      // can still be listed. These pages must stay crawlable to be excludable.
      const robots = readCode("src/app/robots.ts");
      return (
        !/flights\/results/.test(robots) &&
        !/offerId/.test(robots) &&
        !NON_INDEXABLE_PATH_SEGMENTS.some((segment) => robots.includes(segment))
      );
    })(),
  );
  ok(
    "35. Results declares noindex through the shared helper",
    /buildNonIndexableMetadata/.test(
      readSource("src/app/[locale]/flights/results/page.tsx"),
    ),
  );
  ok(
    "36. Details declares noindex through the shared helper",
    /buildNonIndexableMetadata/.test(
      readSource("src/app/[locale]/flights/results/[offerId]/page.tsx"),
    ),
  );
  ok(
    "36b. the non-indexable helper actually sets index and follow to false",
    /index:\s*false/.test(seoSource) && /follow:\s*false/.test(seoSource),
  );
  ok(
    "37. public pages are explicitly indexable",
    /indexed\s*\?\s*\{\s*index:\s*true,\s*follow:\s*true\s*\}/.test(seoCode) &&
      PUBLIC_PAGE_KEYS.every(
        (key) =>
          /buildPublicMetadata/.test(readSource(publicPageRoutes[key])) &&
          // None of the five information pages opts out of indexing. They are
          // the pages GTAI most wants found, and the opt-out added for the
          // planned product routes must not spread to them.
          !/indexable:\s*false/.test(readCode(publicPageRoutes[key])),
      ),
  );
  check(
    "38. the canonical public base URL",
    publicUrl(localePath("en", PUBLIC_PAGE_PATHS.about)),
    "https://gtai-global-travel-ai.vercel.app/en/about",
  );
  ok(
    "38b. canonical and hreflang alternates are declared for public pages",
    /alternates/.test(seoSource) && /languages/.test(seoSource),
  );
  ok(
    "39. no page metadata claims live prices or availability",
    DICTIONARIES.every(([, dict]) => {
      const meta = dict.meta as unknown as Record<
        string,
        { title?: string; description?: string }
      >;
      return Object.values(meta).every((entry) => {
        const text = `${entry?.title ?? ""} ${entry?.description ?? ""}`;
        // The negated form is exactly what this release added: "demonstration
        // data, not live fares" is the correction, not the defect.
        return !/(?<!not )\blive (fares?|prices?)\b/i.test(text);
      });
    }),
  );
  ok(
    "40. structured data carries no rating, offer, price or review",
    !/aggregateRating|"Offer"|"Review"|ratingValue|priceCurrency/.test(seoCode),
  );
  ok(
    "40b. structured data declares no unconfirmed social profile",
    !/sameAs/.test(seoCode),
  );

  // === SECURITY AND PRIVACY =====================================================
  const allAppSources = collectSourceFiles("src");
  const clientSources = allAppSources.filter(
    (file) => !file.includes(`${join("src", "server")}`),
  );

  ok(
    "41. no external travel-provider request is introduced",
    allAppSources.every((file) => {
      const body = stripComments(readFileSync(file, "utf8"));
      // The only absolute URL permitted in source is GTAI's own public origin.
      const urls = [...body.matchAll(/https?:\/\/[^\s"'`)]+/g)].map((m) => m[0]);
      return urls.every(
        (url) =>
          url.startsWith(publicCompanyProfile.websiteUrl) ||
          url.startsWith("https://schema.org"),
      );
    }),
  );
  ok(
    "42. no travel-provider hostname exists anywhere in source",
    allAppSources.every((file) =>
      isSelfReferential(file)
        ? true
        : !/skyscanner|expedia|booking\.com|kayak|amadeus|travelport|sabre/i.test(
            stripComments(readFileSync(file, "utf8")),
          ),
    ),
  );
  ok(
    "43. no API key or credential placeholder exists",
    clientSources.every((file) => {
      const body = stripComments(readFileSync(file, "utf8"));
      return !/(api[_-]?key|client[_-]?secret|access[_-]?token|bearer)\s*[:=]\s*["'`]/i.test(
        body,
      );
    }),
  );
  ok(
    "44. no new environment variable is read outside the one pre-existing runtime check",
    (() => {
      const reads = allAppSources.filter((file) =>
        /process\.env\.\w+/.test(stripComments(readFileSync(file, "utf8"))),
      );
      // V2.7 established exactly two: the route's production gate and the
      // client's dev-scenario guard. V2.8-A adds none.
      return reads.length <= 2;
    })(),
  );
  ok(
    "45. no analytics, tag-manager or chat dependency exists",
    (() => {
      const manifest = JSON.parse(readSource("package.json")) as {
        dependencies: Record<string, string>;
      };
      const names = Object.keys(manifest.dependencies).sort().join(",");
      return names === "next,react,react-dom";
    })(),
  );
  ok(
    "45b. no analytics or tag-manager script is embedded in source",
    allAppSources.every(
      (file) =>
        !/googletagmanager|google-analytics|gtag\(|plausible\.io|segment\.com|hotjar|mixpanel|intercom/i.test(
          readFileSync(file, "utf8"),
        ),
    ),
  );
  ok(
    "46. no affiliate redirect or outbound click-out exists",
    allAppSources.every((file) => {
      const body = stripComments(readFileSync(file, "utf8"));
      const isButtonPrimitive = file.endsWith(join("ui", "Button.tsx"));
      return (
        !/window\.location\s*=/.test(body) &&
        !/window\.open\(/.test(body) &&
        // `ButtonLink` carries a dormant `external` branch from an earlier
        // version. The primitive may define it; what must hold — and is
        // asserted next — is that no call site ever passes it.
        (isButtonPrimitive || !/target=["']_blank["']/.test(body))
      );
    }),
  );
  ok(
    "46b. the dormant external-link capability is never used by any call site",
    allAppSources
      .filter((file) => !file.endsWith(join("ui", "Button.tsx")))
      .every(
        (file) =>
          !/\bexternal(\s*=\s*\{true\}|\s*\/>|\s*$)/m.test(
            stripComments(readFileSync(file, "utf8")),
          ),
      ),
  );
  ok(
    "47. no booking or payment implementation exists",
    allAppSources.every((file) => {
      // V2.8-B's request contract and audit summary enumerate payment-adjacent
      // field names in `PROHIBITED_*_FIELDS` arrays precisely so no such field
      // can be sent or recorded. Those arrays are the guard, not a breach, and
      // are removed before the sweep exactly as comments already are.
      const body = stripComments(readFileSync(file, "utf8")).replace(
        /PROHIBITED_[A-Z_]+_FIELDS[\s\S]*?\];/g,
        " ",
      );
      return !/stripe|paypal|checkout\.session|createPaymentIntent|\bcardNumber\b/i.test(
        body,
      );
    }),
  );
  ok(
    "48. no contact-data backend exists",
    (() => {
      const apiRoutes = collectSourceFiles("src/app/api");
      // The internal flight search route is the only API route, and V2.8-A
      // adds none. A contact form would need one.
      return (
        apiRoutes.length === 1 &&
        apiRoutes[0].includes(join("flights", "search")) &&
        !/<form/.test(readSource(publicPageRoutes.contact))
      );
    })(),
  );
  ok(
    "49. the contact page offers only a mailto link",
    (() => {
      const contact = readSource(publicPageRoutes.contact);
      return (
        /publicContactMailto/.test(contact) &&
        !/<input/.test(contact) &&
        !/<textarea/.test(contact) &&
        !/onSubmit/.test(contact)
      );
    })(),
  );
  ok(
    "50. .claude/ is untracked and absent from source and configuration",
    !exists(".claude/settings.json") ||
      // Its presence on disk is fine; what must hold is that nothing in the
      // application reads or ships it.
      allAppSources.every((file) => !/\.claude/.test(readFileSync(file, "utf8"))),
  );

  // === REGRESSION ===============================================================
  ok(
    "51. the V2.7 internal flight API route is unchanged and present",
    exists("src/app/api/flights/search/route.ts") &&
      /readBoundedRequestBody/.test(
        readSource("src/app/api/flights/search/route.ts"),
      ),
  );
  ok(
    "52. the local deterministic provider adapter remains present",
    exists(
      "src/server/flights/providers/adapters/local-deterministic-provider-adapter.ts",
    ) &&
      /generateDemoOffers/.test(
        readSource(
          "src/server/flights/providers/adapters/local-deterministic-provider-adapter.ts",
        ),
      ),
  );
  ok(
    "53. provider-output validation remains intent-aware",
    /isCanonicalFlightOfferForIntent/.test(
      readSource("src/server/flights/providers/provider-search-validation.ts"),
    ),
  );
  ok(
    "54. Results still resolves offers through the API repository",
    /getFlightOfferRepository/.test(resultsExperience) &&
      /ApiFlightOfferRepository/.test(
        readSource("src/features/flights/runtime-repository.ts"),
      ),
  );
  ok(
    "55. Details still resolves offers through the API repository",
    /getFlightOfferRepository/.test(detailsExperience),
  );
  ok(
    "56. demonstration offer ids remain deterministic",
    /hashString\(seedBase\)/.test(
      readSource("src/features/flights/demo-offer-generation.ts"),
    ),
  );
  ok(
    "57. the search request key still excludes view state",
    /\$\{intentKey\}#\$\{retryToken\}#\$\{devScenario\}/.test(resultsExperience) &&
      /\$\{intentKey\}#\$\{retryToken\}#\$\{devScenario\}/.test(detailsExperience),
  );
  ok(
    "58. filters are applied in memory and cannot trigger a fetch",
    /applyFilters\(/.test(resultsExperience) &&
      !/applyFilters[\s\S]{0,400}repository\.search/.test(resultsExperience),
  );
  ok(
    "59. sorting is applied in memory and cannot trigger a fetch",
    /sortOffers\(/.test(resultsExperience) &&
      !/sortOffers[\s\S]{0,400}repository\.search/.test(resultsExperience),
  );
  ok(
    "60. the four-locale architecture is intact",
    dictionaryLocales.length === 4 &&
      // Declaration order in `locales.ts`, not alphabetical.
      dictionaryLocales.join(",") === "en,fr,ar,fa" &&
      localeCodes.length > 4,
  );
  ok(
    "60b. the shared last-updated constant is the stated date and is rendered once",
    PUBLIC_DOCUMENTS_LAST_UPDATED === "2026-08-04" &&
      /PUBLIC_DOCUMENTS_LAST_UPDATED/.test(
        readSource("src/components/layout/PublicPageShell.tsx"),
      ),
  );
  ok(
    "60c. the demonstration notice supports all three weights and is not dismissible",
    (() => {
      const notice = readCode("src/components/ui/DemonstrationDataNotice.tsx");
      return (
        /"compact"/.test(notice) &&
        /"standard"/.test(notice) &&
        /"prominent"/.test(notice) &&
        /role="note"/.test(notice) &&
        !/onDismiss|onClose|dismissible/.test(notice)
      );
    })(),
  );

  // === ROUND 2: robots/noindex, privacy facts, homepage metadata, fallback
  // locales, and locale-aware truthfulness ======================================

  const layoutSource = readSource("src/app/[locale]/layout.tsx");
  const homeSourceFull = readSource("src/app/[locale]/page.tsx");
  const auditSource = readSource("src/server/flights/providers/provider-audit.ts");
  const orchestratorSource = readSource(
    "src/server/flights/providers/provider-search-orchestrator.ts",
  );
  const recentLocationsPath = "src/features/locations/use-recent-locations.ts";

  /** Runs a predicate per authored locale and reports which ones failed. */
  const perLocale = (
    name: string,
    predicate: (dict: Dict, locale: string) => boolean,
  ): void => {
    const failing = DICTIONARIES.filter(
      ([locale, dict]) => !predicate(dict, locale),
    ).map(([locale]) => locale);
    check(name, failing, []);
  };

  // --- Privacy: the three runtime facts ---------------------------------------
  ok(
    "61. the runtime's default audit sink discards events",
    /export const noopAuditSink/.test(auditSource) &&
      /record\(\)\s*\{[^}]*\}/.test(stripComments(auditSource)) &&
      /options\.auditSink \?\? noopAuditSink/.test(orchestratorSource),
  );
  perLocale(
    "62. no Privacy copy claims a persistent application search-audit log",
    (dict) => {
      const text = dict.publicPages.privacy.sections
        .map((s) => `${s.heading} ${s.body.join(" ")}`)
        .join(" ");
      // The old wording said GTAI "records" a summary. It builds one; the
      // default sink drops it. Every locale must now say so.
      const claimsPersistence =
        /\brecords a\b/i.test(text) || /\benregistre un\b/i.test(text);
      const statesNonPersistence =
        /does not persist|no persistent|ne conserve pas|persistant/i.test(text) ||
        text.includes("ذخیره نمی‌کند") ||
        text.includes("لا يحفظ");
      return !claimsPersistence && statesNonPersistence;
    },
  );
  ok(
    "63. the recent-location store exists and is sessionStorage, not localStorage",
    (() => {
      const source = readCode(recentLocationsPath);
      return (
        exists(recentLocationsPath) &&
        /window\.sessionStorage/.test(source) &&
        !/localStorage/.test(source)
      );
    })(),
  );
  perLocale(
    "64. every Privacy dictionary discloses tab-scoped recent-location storage",
    (dict) => {
      const text = dict.publicPages.privacy.sections
        .map((s) => `${s.heading} ${s.body.join(" ")}`)
        .join(" ");
      return /sessionStorage/.test(text);
    },
  );
  perLocale(
    "65. every Privacy dictionary still discloses technical request metadata",
    (dict) => {
      const text = dict.publicPages.privacy.sections
        .map((s) => s.body.join(" "))
        .join(" ");
      const mentionsIp = /\bIP\b/.test(text);
      const mentionsAgent =
        /User-Agent/i.test(text) ||
        /agent utilisateur/i.test(text) ||
        text.includes("عامل کاربر") ||
        text.includes("وكيل المستخدم");
      return mentionsIp && mentionsAgent;
    },
  );
  perLocale(
    "66. no Privacy dictionary claims nothing else accompanies a request",
    (dict) => {
      const text = dict.publicPages.privacy.sections
        .map((s) => s.body.join(" "))
        .join(" ");
      return (
        !/Nothing else about you is attached/i.test(text) &&
        !/Rien d'autre vous concernant/i.test(text) &&
        !text.includes("هیچ چیز دیگری درباره شما به درخواست پیوست نمی‌شود") &&
        !text.includes("ولا يُرفَق بالطلب أي شيء آخر يخصّك")
      );
    },
  );
  perLocale(
    "67. no Privacy dictionary claims a formal compliance certification",
    (dict) => {
      const text = dict.publicPages.privacy.sections
        .map((s) => s.body.join(" "))
        .join(" ");
      return !/\b(GDPR|PIPEDA|CCPA)[- ]?(compliant|certified)\b/i.test(text);
    },
  );

  // --- Homepage metadata -------------------------------------------------------
  ok(
    "68. the homepage uses the shared metadata helper rather than a second one",
    /buildPublicMetadata/.test(homeSourceFull) &&
      /path:\s*"\/"/.test(homeSourceFull),
  );
  for (const [index, locale] of dictionaryLocales.entries()) {
    check(
      `${69 + index}. homepage canonical for ${locale}`,
      publicUrl(localePath(locale, "/")),
      `https://gtai-global-travel-ai.vercel.app/${locale}`,
    );
  }
  ok(
    "73. homepage alternates cover all four authored locales plus x-default",
    (() => {
      const seo = readCode("src/lib/seo/public-metadata.ts");
      return (
        /for \(const code of dictionaryLocales\)/.test(seo) &&
        /x-default/.test(seo) &&
        dictionaryLocales.length === 4
      );
    })(),
  );
  ok(
    "74. homepage metadata declares Open Graph url and Twitter card",
    (() => {
      const seo = readCode("src/lib/seo/public-metadata.ts");
      return /url:\s*canonical/.test(seo) && /card:\s*"summary"/.test(seo);
    })(),
  );
  perLocale(
    "75. no homepage metadata claims live prices",
    (dict) =>
      !/(?<!not )\blive (fares?|prices?)\b/i.test(
        `${dict.meta.home.title} ${dict.meta.home.description}`,
      ),
  );

  // --- Fallback locales --------------------------------------------------------
  ok('76. hasAuthoredDictionary("en") is true', hasAuthoredDictionary("en"));
  ok('77. hasAuthoredDictionary("de") is false', !hasAuthoredDictionary("de"));
  check('78. resolveContentLocale("de")', resolveContentLocale("de"), "en");
  check('79. resolveContentLocale("ur")', resolveContentLocale("ur"), "en");
  check('80. resolveContentLocale("fa")', resolveContentLocale("fa"), "fa");
  check('81. resolveContentLocale("ar")', resolveContentLocale("ar"), "ar");
  ok(
    "82. authored RTL locales keep their own direction",
    getDirection(resolveContentLocale("fa")) === "rtl" &&
      getDirection(resolveContentLocale("ar")) === "rtl",
  );
  ok(
    "83. unauthored locales fall back to LTR English content",
    getDirection(resolveContentLocale("de")) === "ltr" &&
      getDirection(resolveContentLocale("ur")) === "ltr",
  );
  ok(
    "84. the layout separates requested locale from content locale",
    /resolveContentLocale/.test(layoutSource) &&
      /lang=\{contentLocale\}/.test(layoutSource) &&
      /getDirection\(contentLocale\)/.test(layoutSource) &&
      // The region/currency heuristic still receives the requested locale.
      /RegionProvider[\s\S]{0,120}locale=\{locale\}/.test(layoutSource),
  );
  ok(
    "85. an unauthored locale canonicalizes to the English equivalent and is noindex",
    (() => {
      const seo = readCode("src/lib/seo/public-metadata.ts");
      return (
        /const authored = hasAuthoredDictionary\(locale\)/.test(seo) &&
        // The canonical *branch* specifically. An earlier version of this
        // check matched `publicUrl(localePath(defaultLocale, path))` anywhere,
        // which the `x-default` alternate also satisfies — so it passed even
        // with the canonical ternary deleted.
        /const canonical = authored[\s\S]{0,160}publicUrl\(localePath\(defaultLocale, path\)\)/.test(
          seo,
        ) &&
        /index:\s*false,\s*follow:\s*true/.test(seo)
      );
    })(),
  );
  ok(
    "86. the layout defaults unauthored locales to noindex",
    /hasAuthoredDictionary\(locale\)[\s\S]{0,140}index:\s*false/.test(layoutSource),
  );
  ok(
    "87. the sitemap still lists only the four authored locales",
    /dictionaryLocales/.test(sitemapSource) && dictionaryLocales.length === 4,
  );

  // --- Locale-aware truthfulness ----------------------------------------------
  // One English regex cannot prove the meaning of four languages, so each of
  // these names the exact reviewed key and the exact localized marker.
  const FUTURE_MARKERS =
    /\b(planned|may|will|being built|is being|not yet|no .* is connected|prévu|pourrait|sera|seront|conçue? pour|n'est encore|aucun)\b/i;
  const futureInAny = (text: string): boolean =>
    FUTURE_MARKERS.test(text) ||
    /برنامه‌ریزی‌شده|ممکن است|خواهند|خواهد|ساخته می‌شود|هنوز|متصل نیست|وجود ندارد/.test(
      text,
    ) ||
    /المخطَّط|قد |سي|تُبنى|يُبنى|بعد|غير متاح/.test(text);

  perLocale("88. the affiliate banner title is future or conditional", (dict) =>
    futureInAny(dict.affiliate.title),
  );
  perLocale("89. the affiliate trust item is future or conditional", (dict) =>
    futureInAny(dict.trust.items[2].description),
  );
  perLocale(
    "90. the footer build notice states the demonstration state",
    (dict) => {
      const text = dict.footer.buildNotice;
      const demo =
        /demonstrat|fictional|fictives|données fictives/i.test(text) ||
        /ساختگی|نمایش/.test(text) ||
        /خيالية|يعرض/.test(text);
      const noBooking =
        /not available|ne sont pas disponibles|pas disponibles/i.test(text) ||
        /در دسترس نیست/.test(text) ||
        /غير متاح/.test(text);
      return demo && noBooking;
    },
  );
  for (const [index, product] of (
    ["flights", "stays", "cars", "packages"] as const
  ).entries()) {
    perLocale(
      `${91 + index}. the ${product} description is future or conditional`,
      (dict) => {
        const pages = dict.pages as unknown as Record<
          string,
          { description: string }
        >;
        return futureInAny(pages[product].description);
      },
    );
  }
  perLocale("95. no product description claims a current comparison", (dict) => {
    const pages = dict.pages as unknown as Record<string, { description: string }>;
    return (["flights", "stays", "cars", "packages"] as const).every((product) => {
      const text = pages[product].description;
      // Present-tense "GTAI compares X across approved providers".
      return !/GTAI (compares|compare)\b/i.test(text);
    });
  });

  // --- Report accuracy on `.env.example` ---------------------------------------
  ok(
    "96. .env.example documents only empty, commented, unused future placeholders",
    (() => {
      if (!exists(".env.example")) return true;
      const lines = readSource(".env.example")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      // Every non-blank line is a comment: no variable is even active, so no
      // value — real or placeholder — can be read by anything.
      const allCommented = lines.every((line) => line.startsWith("#"));
      // And nothing in the application reads any of the documented names.
      const documented = [
        ...readSource(".env.example").matchAll(/^#\s*([A-Z][A-Z0-9_]+)=/gm),
      ].map((m) => m[1]);
      const readAnywhere = documented.some((name) =>
        allAppSources.some((file) =>
          new RegExp(`process\\.env\\.${name}\\b`).test(readFileSync(file, "utf8")),
        ),
      );
      return allCommented && !readAnywhere && documented.length > 0;
    })(),
  );
  ok(
    "97. no real credential value exists in the repository's tracked example",
    (() => {
      if (!exists(".env.example")) return true;
      // A documented placeholder is `NAME=` with nothing after it. Anything
      // with a value would be a real credential in a tracked file.
      // Same-line only. `\s` spans the newline, so `NAME=` followed by a
      // blank line and the next comment block looked like a real value.
      return !/^#?[^\S\r\n]*[A-Z][A-Z0-9_]+=[^\S\r\n]*[^\s#]/m.test(
        readSource(".env.example"),
      );
    })(),
  );
  ok(
    "98. no documented placeholder is exposed to the browser bundle",
    clientSources.every(
      (file) =>
        !/process\.env\.NEXT_PUBLIC_(AFFILIATE|SITE_URL)/.test(
          readFileSync(file, "utf8"),
        ),
    ),
  );
  ok(
    "99. the current runtime uses no provider credential",
    !/process\.env/.test(
      stripComments(
        readSource(
          "src/server/flights/providers/adapters/local-deterministic-provider-adapter.ts",
        ),
      ),
    ) &&
      !/process\.env/.test(
        stripComments(
          readSource("src/server/flights/providers/provider-registry.ts"),
        ),
      ),
  );

  // === ROUND 3: revision date, locale counts, current capabilities, JSON-LD,
  // single contact source, and `.env.example` accuracy =========================

  // --- Revision date -----------------------------------------------------------
  check(
    "100. the shared legal revision date",
    PUBLIC_DOCUMENTS_LAST_UPDATED,
    "2026-08-04",
  );
  ok(
    "101. the shared date is a fixed literal, never a runtime clock read",
    /PUBLIC_DOCUMENTS_LAST_UPDATED = "\d{4}-\d{2}-\d{2}";/.test(profileSource) &&
      !/new Date\(\)/.test(stripComments(profileSource)),
  );
  ok(
    "102. Privacy, Terms and the Affiliate Disclosure all render the shared date",
    (() => {
      const shell = readCode("src/components/layout/PublicPageShell.tsx");
      const rendersShared =
        /PUBLIC_DOCUMENTS_LAST_UPDATED/.test(shell) &&
        /showLastUpdated/.test(shell);
      const pages = ["privacy", "terms", "affiliateDisclosure"] as const;
      return (
        rendersShared &&
        pages.every((key) =>
          /showLastUpdated/.test(readSource(publicPageRoutes[key])),
        )
      );
    })(),
  );
  ok(
    "103. no V2.8-A source or documentation still calls 2026-08-03 the current revision",
    [
      ...collectSourceFiles("src"),
      "docs/implementation/V2_8_A_PARTNER_REVIEW_READINESS.md",
    ].every((file) => {
      const body = file.endsWith(".md")
        ? readSource(file)
        : readFileSync(file, "utf8");
      // A historical mention is fine only if it is not presented as current.
      return !/(Last updated|last updated|current revision)[^\n]{0,40}2026-08-03/.test(
        body,
      );
    }),
  );

  // --- Locale counts -----------------------------------------------------------
  const unauthoredCount = localeCodes.filter(
    (code) => !hasAuthoredDictionary(code),
  ).length;
  check("104. total supported locale count", localeCodes.length, 32);
  check("105. authored locale count", dictionaryLocales.length, 4);
  check("106. unauthored fallback locale count", unauthoredCount, 28);
  check(
    "107. the authored locales are exactly en, fr, ar and fa",
    [...dictionaryLocales].sort(),
    ["ar", "en", "fa", "fr"],
  );
  ok(
    "108. no source comment or V2.8-A document claims 33 locales or 29 fallbacks",
    [
      ...collectSourceFiles("src"),
      "docs/implementation/V2_8_A_PARTNER_REVIEW_READINESS.md",
      "docs/reference/V1_2_REFERENCE_UX_BLUEPRINT.md",
    ].every((file) => {
      const body = file.endsWith(".md")
        ? readSource(file)
        : readFileSync(file, "utf8");
      return !/\b33[- ]locale|\b33 locales|\bother 29\b|\b29 fallback/i.test(body);
    }),
  );

  // --- Current public capabilities, per locale ---------------------------------
  // Each check names the exact reviewed key and the exact localized marker.
  // A single English regex cannot establish the meaning of four languages.
  const demoMarker = (text: string): boolean =>
    /demonstration/i.test(text) ||
    /démonstration/i.test(text) ||
    /نمایشی/.test(text) ||
    /توضيحية|توضيحي/.test(text);
  const plannedMarker = (text: string): boolean =>
    /\b(planned|being built|is being|being prepared|not connected)\b/i.test(text) ||
    /prévue?s?|en cours de construction|en préparation|n'est pas connectée/i.test(
      text,
    ) ||
    /برنامه‌ریزی|ساخته می‌شود|در حال آماده‌سازی|متصل نیست/.test(text) ||
    /مخطَّط|قيد البناء|يجري التحضير|غير متصلة/.test(text);

  perLocale(
    "109. the hero does not claim one working search compares all four products",
    (dict) => {
      const t = dict.hero.subtitle;
      // The defect was "Compare flights, stays, cars and packages in one
      // search" — four product nouns joined as one present-tense capability.
      const allFourTogether =
        /flights,?\s+stays,?\s+cars\s+and\s+packages/i.test(t) ||
        /vols,?\s+hébergements,?\s+voitures\s+et\s+forfaits/i.test(t) ||
        /پرواز، اقامت، خودرو و بسته/.test(t) ||
        /الرحلات وأماكن الإقامة والسيارات والباقات/.test(t);
      return !allFourTogether;
    },
  );
  perLocale(
    "110. the hero identifies current flight results as demonstration data",
    (dict) => demoMarker(dict.hero.subtitle) && plannedMarker(dict.hero.subtitle),
  );
  perLocale(
    "111. reassurance does not claim a real provider supplies current offers",
    (dict) => {
      const t = dict.reassurance.items[1].description;
      return (
        !/the provider that supplies it/i.test(t) &&
        !/le fournisseur qui la propose/i.test(t) &&
        !/ارائه‌دهنده خود را نشان می‌دهد/.test(t)
      );
    },
  );
  perLocale(
    "112. reassurance identifies the provider identities as fictional demonstrations",
    (dict) => {
      const t = `${dict.reassurance.items[0].description} ${dict.reassurance.items[1].description}`;
      const fictional =
        /fictional/i.test(t) ||
        /fictive/i.test(t) ||
        /ساختگی/.test(t) ||
        /خيالية/.test(t);
      return fictional && demoMarker(t);
    },
  );
  perLocale(
    "113. the destination heading does not claim actual traveller trends",
    (dict) => {
      const t = dict.destinations.title;
      return (
        !/where travellers are heading/i.test(t) &&
        !/où (vont|se dirigent) les voyageurs/i.test(t) &&
        !/مسافران به کجا/.test(t) &&
        !/إلى أين يتجه المسافرون/.test(t)
      );
    },
  );
  perLocale(
    "114. destination copy identifies itself as illustrative sample content",
    (dict) => {
      const t = `${dict.destinations.title} ${dict.destinations.description}`;
      const sample =
        /sample|illustrative/i.test(t) ||
        /exemple|illustrati/i.test(t) ||
        /نمونه/.test(t) ||
        /نموذجية|توضيحية/.test(t);
      const notTrend =
        /not live popularity|not .{0,20}trend/i.test(t) ||
        /ni de popularité ni de tendances|ne s'agit ni de données de popularité/i.test(
          t,
        ) ||
        /داده محبوبیت یا روند واقعی نیستند/.test(t) ||
        /ليست بيانات رواج أو اتجاهات/.test(t);
      return sample && notTrend;
    },
  );
  perLocale(
    "115. no empty-state notice says providers are actively being connected",
    (dict) => {
      const pages = dict.pages as unknown as Record<
        string,
        { emptyDescription: string }
      >;
      return (["flights", "stays", "cars", "packages"] as const).every((p) => {
        const t = pages[p].emptyDescription;
        return (
          !/still connecting/i.test(t) &&
          !/est encore en train de connecter/i.test(t) &&
          !/در حال اتصال/.test(t) &&
          !/لا يزال .{0,12}يربط/.test(t)
        );
      });
    },
  );
  for (const [index, product] of (
    ["flights", "stays", "cars", "packages"] as const
  ).entries()) {
    perLocale(
      `${116 + index}. the ${product} empty description states the real current state`,
      (dict) => {
        const pages = dict.pages as unknown as Record<
          string,
          { emptyDescription: string }
        >;
        const t = pages[product].emptyDescription;
        const noLive =
          /no live (provider|supplier) results/i.test(t) ||
          /aucun résultat de fournisseur en direct/i.test(t) ||
          /هیچ نتیجه‌ای از (ارائه‌دهنده|تأمین‌کننده) زنده/.test(t) ||
          /لا تتوفّر أي نتائج من (مزوّد|مورّد) مباشر/.test(t);
        // Flights runs on demonstration data; the others are simply not
        // connected. Both are "planned", neither is "in progress".
        const stateful = product === "flights" ? demoMarker(t) : plannedMarker(t);
        return noLive && stateful;
      },
    );
  }
  perLocale("120. the footer tagline uses being-built language", (dict) => {
    const t = dict.footer.tagline;
    return (
      /being built/i.test(t) ||
      /en cours de construction/i.test(t) ||
      /ساخته می‌شود/.test(t) ||
      /قيد البناء/.test(t)
    );
  });
  perLocale(
    "121. the Why GTAI introduction does not present planned planning as operational",
    (dict) => {
      const t = `${dict.why.title} ${dict.why.description}`;
      const operational =
        /GTAI combines/i.test(t) ||
        /GTAI combine la/i.test(t) ||
        /GTAI ترکیب می‌کند/.test(t);
      return !operational && plannedMarker(t);
    },
  );
  perLocale(
    "121b. no Why-GTAI item presents all four products as one working surface",
    (dict) => {
      // The badge says "Coming soon", but the sentence has to stand on its own:
      // a reader quoting the string out of the card should not come away with
      // a four-product capability claim.
      const t = dict.why.items[0].description;
      return (
        !/across flights, stays, cars and packages/i.test(t) &&
        !/entre vols, hébergements, voitures et forfaits/i.test(t) &&
        !/میان پرواز، اقامت، خودرو و بسته/.test(t) &&
        !/بين الرحلات وأماكن الإقامة والسيارات والباقات/.test(t)
      );
    },
  );
  ok(
    "122. the Coming soon status labels are still present in every locale",
    DICTIONARIES.every(
      ([, dict]) =>
        dict.why.statusLabels.planned.length > 0 &&
        dict.why.statusLabels.active.length > 0,
    ),
  );

  // --- JSON-LD contact type ----------------------------------------------------
  // The graph builder imports through `@/` aliases, which this plain-Node
  // harness does not resolve, so these assert on the real source of
  // `buildOrganizationJsonLd` rather than re-deriving its output. That is the
  // same technique the rest of this script uses, and it avoids restating the
  // implementation as its own expectation.
  const jsonLdSource = seoCode.slice(
    seoCode.indexOf("export function buildOrganizationJsonLd"),
  );
  ok(
    "123. JSON-LD contactPoint uses the shared public email",
    /email:\s*publicCompanyProfile\.contactEmail/.test(jsonLdSource),
  );
  ok(
    "124. JSON-LD contactType is general inquiries",
    /contactType:\s*"general inquiries"/.test(jsonLdSource),
  );
  ok(
    "125. JSON-LD does not claim customer support",
    !/customer support/i.test(jsonLdSource),
  );
  ok(
    "126. JSON-LD publishes no telephone number",
    !/telephone|"phone"/i.test(jsonLdSource) &&
      !/\+?\d[\d\s().-]{8,}\d/.test(jsonLdSource),
  );

  // --- Single contact source ---------------------------------------------------
  ok(
    "127. the placeholder address is gone from the whole repository",
    [...collectSourceFiles("src"), ...collectSourceFiles("scripts")].every(
      (file) =>
        isSelfReferential(file) ||
        !/hello@example\.invalid/.test(readFileSync(file, "utf8")),
    ),
  );
  ok(
    "128. exactly one public contact email exists in configuration",
    (() => {
      const configFiles = collectSourceFiles("src/config");
      const emails = new Set<string>();
      for (const file of configFiles) {
        for (const match of stripComments(readFileSync(file, "utf8")).matchAll(
          /[\w.+-]+@[\w.-]+\.\w+/g,
        )) {
          emails.add(match[0]);
        }
      }
      return emails.size === 1 && emails.has(publicCompanyProfile.contactEmail);
    })(),
  );
  ok(
    "129. Contact, Footer and JSON-LD all read the shared profile",
    /publicContactMailto|publicCompanyProfile\.contactEmail/.test(
      readSource(publicPageRoutes.contact),
    ) &&
      /publicCompanyProfile/.test(footerSource) &&
      /publicCompanyProfile\.contactEmail/.test(seoSource),
  );

  // --- `.env.example` accuracy -------------------------------------------------
  ok(
    "130. .env.example describes the current V2.8-C contract rather than an unpublished V1 site",
    (() => {
      const env = readSource(".env.example");
      return (
        /V2\.8-C requires NO environment variable/.test(env) &&
        !/no published domain yet/i.test(env) &&
        !/V1 \(Global Foundation\)/.test(env) &&
        /public-company-profile/.test(env) &&
        /sessionStorage/.test(env)
      );
    })(),
  );
  ok(
    "131. every environment placeholder is still commented and empty",
    (() => {
      const lines = readSource(".env.example")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      return lines.every((line) => line.startsWith("#"));
    })(),
  );
  ok(
    "132. no NEXT_PUBLIC_SITE_URL placeholder remains, and the origin is a literal",
    !/NEXT_PUBLIC_SITE_URL/.test(readSource(".env.example")) &&
      /websiteUrl: "https:\/\//.test(profileSource),
  );

  // === ROUND 4: FREEZE CORRECTIONS ==============================================

  const productRoutes: Record<string, string> = {
    flights: "src/app/[locale]/flights/page.tsx",
    stays: "src/app/[locale]/stays/page.tsx",
    cars: "src/app/[locale]/cars/page.tsx",
    packages: "src/app/[locale]/packages/page.tsx",
    explore: "src/app/[locale]/explore/page.tsx",
    trips: "src/app/[locale]/trips/page.tsx",
    aiTravel: "src/app/[locale]/ai-travel/page.tsx",
  };
  const productRouteCode = PRODUCT_PAGE_KEYS.map(
    (key) => [key, readCode(productRoutes[key])] as const,
  );

  /**
   * "Approval is a prerequisite that has not been met", in each authored
   * language. Both halves are required: naming approval without tying it to a
   * future activation reads as a description of an approval already obtained,
   * which is the exact defect this round corrects.
   */
  const futureApprovalMarker = (text: string): boolean => {
    const approval =
      /\bapproval\b/i.test(text) ||
      /approbation/i.test(text) ||
      /تأیید/.test(text) ||
      /موافقة/.test(text);
    const beforeActivation =
      /would require|before activation|require.{0,40}before/i.test(text) ||
      /exigerait|avant (son |leur )?activation/i.test(text) ||
      /پیش از فعال‌سازی|نیازمند/.test(text) ||
      /قبل تفعيل|سيتطلّب|ستتطلّب/.test(text);
    return approval && beforeActivation;
  };

  // --- Correction 1: the unavailable-search notice -----------------------------
  perLocale(
    "133. the search notice no longer says providers are still being connected",
    (dict) => {
      const t = dict.search.notice;
      return (
        !/still connecting/i.test(t) &&
        !/connecte encore/i.test(t) &&
        !/در حال اتصال/.test(t) &&
        !/لا يزال .{0,12}يربط/.test(t)
      );
    },
  );
  perLocale("134. the search notice promises no imminent availability", (dict) => {
    const t = dict.search.notice;
    return (
      !/\bsoon\b/i.test(t) &&
      !/you will be able to/i.test(t) &&
      !/bientôt|pourrez/i.test(t) &&
      !/به‌زودی|بزودی/.test(t) &&
      !/قريبًا|قريبا/.test(t)
    );
  });
  perLocale(
    "135. the search notice states this category is not connected in this release",
    (dict) => {
      const t = dict.search.notice;
      return (
        /not connected in the current release/i.test(t) ||
        /n'est pas connectée dans la version actuelle/i.test(t) ||
        /در نسخه کنونی متصل نیست/.test(t) ||
        /غير متصلة في النسخة الحالية/.test(t)
      );
    },
  );
  perLocale(
    "136. the search notice frames approval as a future prerequisite",
    (dict) => futureApprovalMarker(dict.search.notice),
  );
  perLocale(
    "137. the disabled hint and the notice read as two distinct full sentences",
    (dict) => {
      const hint = dict.search.submitDisabledHint.trim();
      const notice = dict.search.notice.trim();
      return (
        hint.length > 10 &&
        notice.length > 10 &&
        hint.endsWith(".") &&
        notice.endsWith(".") &&
        hint !== notice &&
        !notice.includes(hint) &&
        !hint.includes(notice)
      );
    },
  );
  ok(
    "137b. both strings still render consecutively inside one live region",
    (() => {
      const shell = readCode("src/components/search/SearchShell.tsx");
      return /\{labels\.submitDisabledHint\}\s*\{labels\.notice\}/.test(shell);
    })(),
  );

  // --- Correction 2: no implied current approval -------------------------------
  ok(
    "138. no copy in any locale describes a provider or supplier as already approved",
    copyMatching(
      /approved (provider|supplier)|across approved|fournisseurs approuvés|loueurs approuvés|ارائه‌دهندگان تأییدشده|تأمین‌کنندگان تأییدشده|مزوّدين معتمدين|مورّدين معتمدين/i,
    ).length === 0,
  );
  perLocale(
    "139. the reassurance strip frames integration as future and approval-gated",
    (dict) => {
      const t = dict.reassurance.items[0].description;
      return futureApprovalMarker(t) && demoMarker(t);
    },
  );
  perLocale(
    "140. every product empty state frames approval as a future prerequisite",
    (dict) => {
      const pages = dict.pages as unknown as Record<
        string,
        { emptyDescription: string }
      >;
      return (["flights", "stays", "cars", "packages"] as const).every((p) =>
        futureApprovalMarker(pages[p].emptyDescription),
      );
    },
  );
  perLocale(
    "141. no product description qualifies its providers as approved",
    (dict) => {
      const pages = dict.pages as unknown as Record<
        string,
        { description: string }
      >;
      return (["flights", "stays", "cars", "packages"] as const).every((p) => {
        const t = pages[p].description;
        return (
          !/approved/i.test(t) &&
          !/approuvés|agréés/i.test(t) &&
          !/تأییدشده/.test(t) &&
          !/معتمدين|معتمدون/.test(t)
        );
      });
    },
  );
  perLocale(
    "142. the Explore empty state does not imply GTAI already has travel partners",
    (dict) => {
      const t = (
        dict.pages as unknown as Record<string, { emptyDescription: string }>
      ).explore.emptyDescription;
      return (
        !/once .{0,20}travel partners are connected/i.test(t) &&
        !/une fois les partenaires de voyage connectés/i.test(t) &&
        !/پس از اتصال شرکای سفر/.test(t) &&
        !/بعد ربط شركاء السفر/.test(t) &&
        // ...and says outright that no such integration exists today, so the
        // sentence cannot be read as "connected partners, feature pending".
        (/none is today/i.test(t) ||
          /aucune ne l'est aujourd'hui/i.test(t) ||
          /امروز هیچ‌کدام چنین نیست/.test(t) ||
          /لا يوجد أي منها اليوم/.test(t))
      );
    },
  );
  perLocale(
    "143. the Affiliate Disclosure keeps its legitimate future-partner language",
    (dict) => {
      const future = dict.publicPages.affiliateDisclosure.future.join(" ");
      return (
        future.length > 0 &&
        (/\bmay\b/i.test(future) ||
          /pourrai(t|ent)|peut|peuvent/i.test(future) ||
          /ممکن است/.test(future) ||
          /قد \S+/.test(future))
      );
    },
  );

  // --- Correction 3: general applicable law ------------------------------------
  perLocale("144. the Terms declare no Quebec governing law", (dict) => {
    const terms = dict.publicPages.terms.sections
      .map((section) => section.body.join(" "))
      .join(" ");
    return (
      !/Quebec|Québec/i.test(terms) &&
      !/کبک/.test(terms) &&
      !/كيبيك/.test(terms) &&
      !/governed by the laws applicable in/i.test(terms) &&
      !/sont régies par le droit applicable au/i.test(terms)
    );
  });
  ok(
    "145. no public copy in any locale names a court, jurisdiction or venue",
    copyMatching(
      /\b(courts?|jurisdiction|exclusive forum|venue)\b|tribunaux?|juridiction|دادگاه|صلاحیت قضایی|المحاكم|محكمة|الاختصاص القضائي/i,
    ).length === 0,
  );
  perLocale(
    "146. the Terms still preserve mandatory consumer protections",
    (dict) => {
      const terms = dict.publicPages.terms.sections
        .map((section) => section.body.join(" "))
        .join(" ");
      return (
        /mandatory consumer protection/i.test(terms) ||
        /protections? impératives? du consommateur/i.test(terms) ||
        /حمایت‌های الزامی مصرف‌کننده/.test(terms) ||
        /حماية إلزامية للمستهلك/.test(terms)
      );
    },
  );
  perLocale(
    "147. the Terms still carry the not-legal-advice, not-lawyer-reviewed note",
    (dict) => {
      const terms = dict.publicPages.terms.sections
        .map((section) => section.body.join(" "))
        .join(" ");
      const notAdvice =
        /not legal advice/i.test(terms) ||
        /pas un avis juridique/i.test(terms) ||
        /مشاوره حقوقی نیست/.test(terms) ||
        /ليست استشارة قانونية/.test(terms);
      const noLawyer =
        /reviewed by a lawyer/i.test(terms) ||
        /par un avocat/i.test(terms) ||
        /توسط وکیل/.test(terms) ||
        /من محام/.test(terms);
      return notAdvice && noLawyer;
    },
  );
  ok(
    "148. Quebec survives as a location fact, not as a governing-law designation",
    publicCompanyProfile.publicLocation === "Quebec, Canada" &&
      /Quebec/.test(profileSource) &&
      /addressRegion: "Quebec"/.test(seoCode),
  );

  // --- Correction 4: complete static product-page metadata ---------------------
  ok(
    "149. every product route builds metadata through the shared builder",
    productRouteCode.every(([, code]) => /buildPublicMetadata\(/.test(code)),
  );
  ok(
    "150. every product route declares its own shared path, and no other",
    productRouteCode.every(([key, code]) =>
      new RegExp(`path: PRODUCT_PAGE_PATHS\\.${key},`).test(code),
    ) &&
      PRODUCT_PAGE_KEYS.length === 7 &&
      new Set(Object.values(PRODUCT_PAGE_PATHS)).size === 7,
  );
  ok(
    "151. no product route returns a bare title/description object any more",
    productRouteCode.every(([, code]) => !/return \{ title: meta\./.test(code)),
  );
  ok(
    "152. the sitemap stays exactly the 24 information URLs and lists no product page",
    dictionaryLocales.length * (1 + PUBLIC_PAGE_KEYS.length) === 24 &&
      Object.values(PRODUCT_PAGE_PATHS).every(
        (path) => !sitemapSource.includes(`"${path}"`),
      ) &&
      !/PRODUCT_PAGE_KEYS|PRODUCT_PAGE_PATHS/.test(sitemapSource),
  );

  // --- Correction 5: fallback product-page direction ---------------------------
  ok(
    "153. no product route derives its direction from the requested locale",
    productRouteCode.every(([, code]) => !/getDirection\(locale\)/.test(code)),
  );
  ok(
    "154. every direction-bearing product route resolves the content locale first",
    productRouteCode.every(
      ([key, code]) =>
        key === "aiTravel" ||
        /dir=\{getDirection\(resolveContentLocale\(locale\)\)\}/.test(code),
    ),
  );
  ok(
    "155. every product route loads its dictionary from the content locale",
    productRouteCode.every(
      ([, code]) =>
        /getDictionary\(resolveContentLocale\(locale\)\)/.test(code) &&
        !/getDictionary\(locale\)/.test(code),
    ),
  );
  ok(
    "156. an unauthored RTL locale renders LTR English while keeping its own URL",
    // `ur` is the case the correction exists for: supported, RTL, unauthored.
    // Requested direction and content direction genuinely disagree, so a route
    // that used the requested locale really did render English right-to-left.
    getDirection("ur") === "rtl" &&
      resolveContentLocale("ur") === "en" &&
      getDirection(resolveContentLocale("ur")) === "ltr" &&
      !hasAuthoredDictionary("ur") &&
      // ...while an authored RTL locale is untouched by the same expression.
      resolveContentLocale("fa") === "fa" &&
      getDirection(resolveContentLocale("fa")) === "rtl" &&
      hasAuthoredDictionary("fa") &&
      // The requested locale still reaches the shell, so the language selector
      // and the region/currency heuristic keep showing Urdu.
      productRouteCode.every(
        ([key, code]) => key === "aiTravel" || /locale=\{locale\}/.test(code),
      ),
  );

  // --- Correction 6: the footer placeholder notice -----------------------------
  perLocale(
    "157. the footer placeholder notice describes unpublished pages, not destinations",
    (dict) => {
      const t = dict.footer.placeholderNotice;
      const notDestinations =
        !/destinations below/i.test(t) &&
        !/destinations ci-dessous/i.test(t) &&
        !/مقصدهای زیر/.test(t) &&
        !/الوجهات أدناه/.test(t);
      const namesPages =
        /footer pages/i.test(t) ||
        /pages du pied de page/i.test(t) ||
        /صفحه‌های پاورقی/.test(t) ||
        /صفحات التذييل/.test(t);
      const notPublished =
        /not published/i.test(t) ||
        /pas encore publiées/i.test(t) ||
        /منتشر نشده‌اند/.test(t) ||
        /لم تُنشَر بعد/.test(t);
      return notDestinations && namesPages && notPublished;
    },
  );

  // === FINAL V2.8-A INDEXING POLICY =============================================
  //
  // Indexable for an authored locale: the homepage, Flights, and the five
  // company/legal pages. Flights earns it by having a working public
  // demonstration search; the others describe the company, which is what a
  // partner or a traveller searching for GTAI is actually looking for.
  //
  // Public but noindex: Stays, Cars, Packages, Explore, Trips, AI Travel —
  // real pages, honestly labelled, describing capabilities that do not exist.
  // Results and Details are noindex for a different reason: query-specific
  // generated demonstration content.
  //
  // These checks establish the policy from three real sources rather than
  // restating it: the locale table (which locales are authored), each route's
  // own source (whether it opts out of indexing), and the shared builder's
  // source (how it combines the two). The emitted HTML for every authored
  // locale of all seven routes is confirmed separately in the browser pass.

  const NOINDEX_PRODUCT_KEYS = [
    "stays",
    "cars",
    "packages",
    "explore",
    "trips",
    "aiTravel",
  ] as const;
  const AUTHORED = ["en", "fr", "fa", "ar"] as const;
  const FALLBACKS = ["ur", "de", "ja"] as const;

  const routeOptsOutOfIndexing = (key: string): boolean =>
    /indexable:\s*false/.test(readCode(productRoutes[key]));

  /**
   * What the shared builder will emit, derived from the two real inputs.
   * Guarded by check 177, which proves the builder actually combines them
   * this way — without it this predicate would be an assumption.
   */
  const willIndex = (locale: string, key: string): boolean =>
    hasAuthoredDictionary(locale) && !routeOptsOutOfIndexing(key);

  for (const [index, locale] of AUTHORED.entries()) {
    ok(
      `${158 + index}. Flights is indexable for ${locale}`,
      willIndex(locale, "flights"),
    );
  }
  ok(
    "162. Flights stays noindex for every unauthored fallback locale",
    FALLBACKS.every((locale) => !willIndex(locale, "flights")) &&
      localeCodes
        .filter((code) => !hasAuthoredDictionary(code))
        .every((code) => !willIndex(code, "flights")),
  );

  for (const [index, key] of NOINDEX_PRODUCT_KEYS.entries()) {
    ok(
      `${163 + index}. ${key} is noindex in every authored locale`,
      routeOptsOutOfIndexing(key) &&
        AUTHORED.every((locale) => !willIndex(locale, key)),
    );
  }

  ok(
    "169. the six planned routes stay crawlable — follow is true, not false",
    /index: false,\s*follow: true,\s*nocache: true,/.test(seoCode) &&
      // The Results/Details directive is a *different* policy and must not be
      // the one these routes get: those are follow:false.
      NOINDEX_PRODUCT_KEYS.every(
        (key) => !/buildNonIndexableMetadata/.test(readCode(productRoutes[key])),
      ),
  );
  ok(
    "170. the six planned routes declare nocache",
    /nocache: true,/.test(seoCode) &&
      NOINDEX_PRODUCT_KEYS.every((key) =>
        /buildPublicMetadata\(/.test(readCode(productRoutes[key])),
      ),
  );
  ok(
    "171. the six planned routes still publish a canonical URL",
    /alternates: \{\s*canonical,/.test(seoCode) &&
      NOINDEX_PRODUCT_KEYS.every((key) =>
        new RegExp(`path: PRODUCT_PAGE_PATHS\\.${key},`).test(
          readCode(productRoutes[key]),
        ),
      ),
  );
  ok(
    "172. the six planned routes still publish authored alternates and x-default",
    /languages: languageAlternates\(path\)/.test(seoCode) &&
      /alternates\["x-default"\]/.test(seoCode) &&
      // The alternate list is the authored locales, not all 32.
      /for \(const code of dictionaryLocales\)/.test(seoCode),
  );
  ok(
    "173. no planned route appears in the sitemap",
    NOINDEX_PRODUCT_KEYS.every(
      (key) => !sitemapSource.includes(PRODUCT_PAGE_PATHS[key]),
    ),
  );
  ok(
    "174. Flights does not appear in the sitemap either",
    !sitemapSource.includes(PRODUCT_PAGE_PATHS.flights),
  );
  ok(
    "175. the sitemap is still exactly the 24 information URLs",
    dictionaryLocales.length * (1 + PUBLIC_PAGE_KEYS.length) === 24 &&
      /PUBLIC_PAGE_KEYS/.test(sitemapSource) &&
      !/PRODUCT_PAGE_KEYS|PRODUCT_PAGE_PATHS/.test(sitemapSource),
  );
  ok(
    "176. Results remains noindex and unfollowed",
    (() => {
      const results = readCode("src/app/[locale]/flights/results/page.tsx");
      return (
        /buildNonIndexableMetadata\(/.test(results) &&
        !/buildPublicMetadata/.test(results)
      );
    })(),
  );
  ok(
    "177. Details remains noindex and unfollowed",
    (() => {
      const details = readCode(
        "src/app/[locale]/flights/results/[offerId]/page.tsx",
      );
      return (
        /buildNonIndexableMetadata\(/.test(details) &&
        !/buildPublicMetadata/.test(details)
      );
    })(),
  );
  ok(
    "177b. the shared builder combines locale authorship with route opt-out",
    // Without this, `willIndex` above would be an assumption about the
    // implementation rather than a reading of it.
    /const indexed = authored && indexable;/.test(seoCode) &&
      /robots: indexed/.test(seoCode) &&
      /indexable = true,/.test(seoCode) &&
      // One builder, one place where canonical and alternates are computed.
      (seoCode.match(/alternates: \{/g) ?? []).length === 1,
  );

  const total = passed + failures.length;
  if (failures.length > 0) {
    console.error(
      `\nPartner-readiness verification FAILED — ${failures.length} of ${total}\n`,
    );
    for (const failure of failures) console.error(`  ✗ ${failure}\n`);
    process.exit(1);
  }

  console.log(`Partner-readiness verification passed — ${passed}/${total} checks`);
}

main();
