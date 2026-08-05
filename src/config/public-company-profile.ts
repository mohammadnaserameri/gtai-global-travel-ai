/**
 * The public company profile — the single source for every fact GTAI states
 * about itself in public.
 *
 * Footer, About, Contact, Privacy, Terms and the Affiliate Disclosure all read
 * from here. That is not tidiness for its own sake: a company name, a location
 * or a contact address restated in six places is six places that can disagree,
 * and a partner reviewing this site would be right to treat any inconsistency
 * as a reason to doubt the rest. Stating each fact once makes "the site is
 * internally consistent" checkable rather than hoped for.
 *
 * Everything here is **confirmed public information**. What is deliberately
 * absent is as important as what is present: no street address, no telephone
 * number, no company registration number, no financial detail, no credential,
 * and nothing about any pending commercial application. Those are either
 * private, unverified, or both — and a public page is the wrong place to
 * discover which.
 *
 * This module is client-safe: it imports nothing, reads no environment
 * variable, and contains no secret. The public base URL is a literal for the
 * same reason — a canonical URL that depends on deployment configuration is a
 * canonical URL that silently breaks in preview builds.
 */

export const publicCompanyProfile = {
  /** Registered legal entity behind the product. */
  legalName: "GROUPE AMERI INC.",
  /** Product name as it appears to the public. */
  productName: "GTAI — Global Travel AI",
  /** Short product mark, matching `brand.name`. */
  productShortName: "GTAI",
  /**
   * One-sentence factual description. States what the platform *is* — a
   * technology platform — rather than what it will eventually be connected to.
   */
  businessDescription:
    "Canada-based multilingual travel metasearch technology platform.",
  /** Public mailbox for partnership, technical and general inquiries. */
  contactEmail: "mohammad.naserameri@gmail.com",
  /** Public location, at province granularity. No street address is published. */
  publicLocation: "Quebec, Canada",
  /** ISO 3166-1 alpha-2 for the public location's country. */
  countryCode: "CA",
  /** Canonical public origin. No trailing slash. */
  websiteUrl: "https://gtai-global-travel-ai.vercel.app",
} as const;

export type PublicCompanyProfile = typeof publicCompanyProfile;

/** `mailto:` target for the public contact address. */
export const publicContactMailto = `mailto:${publicCompanyProfile.contactEmail}`;

/**
 * The date the published legal and disclosure documents last changed.
 *
 * One constant rather than a date written into each page's copy, so "Last
 * updated" can never say one thing on Terms and another on Privacy. It is a
 * fixed ISO date, not `new Date()`: a document's revision date is a fact about
 * the document, and rendering today's date would make every page claim it was
 * revised on the day it happened to be viewed.
 */
export const PUBLIC_DOCUMENTS_LAST_UPDATED = "2026-08-04";

/**
 * Locale-relative paths for the public information pages.
 *
 * Shared so the Footer, the sitemap and the verification script all describe
 * the same set. A page added here without a route, or routed without being
 * listed, is a discrepancy verification can catch.
 */
export const PUBLIC_PAGE_PATHS = {
  about: "/about",
  contact: "/contact",
  privacy: "/privacy",
  terms: "/terms",
  affiliateDisclosure: "/affiliate-disclosure",
} as const;

export type PublicPageKey = keyof typeof PUBLIC_PAGE_PATHS;

/** Every public information page key, in the order the Footer lists them. */
export const PUBLIC_PAGE_KEYS: readonly PublicPageKey[] = [
  "about",
  "contact",
  "privacy",
  "terms",
  "affiliateDisclosure",
];

/**
 * Locale-relative paths for the seven static product pages.
 *
 * Deliberately a **separate** constant from `PUBLIC_PAGE_PATHS` rather than an
 * extension of it. These pages need exactly the same canonical, `hreflang` and
 * indexing policy as the information pages — an unauthored locale must not
 * self-canonicalize, here or anywhere. What they must *not* share is sitemap
 * inclusion: a sitemap entry is a request to index, and the sitemap is
 * deliberately the set of pages describing the company, not the set of pages
 * describing capabilities that do not exist yet.
 *
 * Keeping the two lists distinct is what makes "the sitemap contains exactly
 * the information pages" a statement verification can check, rather than an
 * accident of which array something happened to be added to.
 *
 * The keys match the `meta.*` dictionary keys for the same pages, so a route
 * cannot quietly point at another page's title.
 */
export const PRODUCT_PAGE_PATHS = {
  flights: "/flights",
  stays: "/stays",
  cars: "/cars",
  packages: "/packages",
  explore: "/explore",
  trips: "/trips",
  aiTravel: "/ai-travel",
} as const;

export type ProductPageKey = keyof typeof PRODUCT_PAGE_PATHS;

/** Every static product page key, in navigation order. */
export const PRODUCT_PAGE_KEYS: readonly ProductPageKey[] = [
  "flights",
  "stays",
  "cars",
  "packages",
  "explore",
  "trips",
  "aiTravel",
];

/**
 * Route segments whose content is generated demonstration data or
 * query-specific state, and which therefore must not be indexed.
 *
 * Kept beside the public page list because the two decisions are one policy:
 * information about the company is meant to be found, while a specific
 * generated itinerary is not a page a search engine should ever surface.
 *
 * Note what this list is **not**: it is not a `robots.txt` denylist. These
 * paths stay crawlable precisely so a crawler can read the `noindex` they
 * publish — a blocked URL is a URL whose directive nobody ever fetches. The
 * list documents which routes carry that directive, and verification uses it
 * to assert they still do.
 */
export const NON_INDEXABLE_PATH_SEGMENTS: readonly string[] = ["/flights/results"];

/** Absolute public URL for a locale-relative path. */
export function publicUrl(path = "/"): string {
  if (!path || path === "/") return publicCompanyProfile.websiteUrl;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${publicCompanyProfile.websiteUrl}${normalized}`;
}
