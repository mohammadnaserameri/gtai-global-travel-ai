import type { Metadata } from "next";

import {
  defaultLocale,
  dictionaryLocales,
  hasAuthoredDictionary,
  resolveContentLocale,
} from "@/config/locales";
import { publicCompanyProfile, publicUrl } from "@/config/public-company-profile";
import { localePath } from "@/i18n/routing";

/**
 * Metadata for public pages.
 *
 * Three things are centralised here because getting any of them wrong on one
 * page is invisible until it matters: the canonical URL, the language
 * alternates, and whether the page should be indexed at all.
 *
 * The base URL is a literal from the shared profile rather than an environment
 * variable. A canonical URL that depends on deployment configuration silently
 * becomes wrong in preview builds — and a canonical pointing at the wrong
 * origin is worse than none at all.
 *
 * No image is declared. GTAI has no authored social card yet, and pointing at
 * a file that does not exist produces a broken preview rather than no preview.
 */

interface PublicMetadataInput {
  /** The locale in the URL — what the visitor asked for. */
  readonly locale: string;
  readonly title: string;
  readonly description: string;
  readonly siteName: string;
  /** Locale-relative path. `"/"` for the homepage, `"/about"` for a page. */
  readonly path: string;
  /**
   * Whether an *authored* locale of this page should be indexed. Defaults to
   * `true`. An unauthored locale is never indexed regardless of this flag.
   *
   * Set `false` for a route that is public and honest but has no substantive
   * functionality yet — Stays, Cars, Packages, Explore, Trips and AI Travel.
   * Those pages describe what GTAI intends to build; they are worth linking to
   * and worth reading, but a search result for "compare car rental" that lands
   * a traveller on a page saying no supplier is connected wastes their time and
   * earns the site a reputation it would then have to undo.
   *
   * This is a flag on the shared builder rather than a second builder, so
   * canonical URLs, alternates, Open Graph and Twitter metadata stay computed
   * in exactly one place. The only thing that varies is the robots directive.
   */
  readonly indexable?: boolean;
}

/**
 * `hreflang` alternates.
 *
 * Only the four authored locales are listed, because those are the only URLs
 * that genuinely contain a translation. Advertising `/de/about` as the German
 * alternate of an English page would be a claim that a German version exists.
 *
 * `x-default` points at English: it is the version to serve when no listed
 * language matches, which is exactly what an unauthored locale falls back to.
 */
function languageAlternates(path: string): Record<string, string> {
  const alternates: Record<string, string> = {};
  for (const code of dictionaryLocales) {
    alternates[code] = publicUrl(localePath(code, path));
  }
  alternates["x-default"] = publicUrl(localePath(defaultLocale, path));
  return alternates;
}

export function buildPublicMetadata({
  locale,
  title,
  description,
  siteName,
  path,
  indexable = true,
}: PublicMetadataInput): Metadata {
  const authored = hasAuthoredDictionary(locale);
  const contentLocale = resolveContentLocale(locale);

  /**
   * Two independent reasons to withhold indexing, and a page needs to clear
   * both: the locale must actually contain a translation, and the route must
   * actually do something. They fail differently — an unauthored locale is a
   * duplicate of the English page, while a planned route has nothing behind it
   * in any language — but the directive they produce is the same.
   */
  const indexed = authored && indexable;

  /**
   * An authored page is its own canonical. An unauthored one canonicalizes to
   * the English equivalent, because that is literally the page it duplicates —
   * `/de/about` and `/en/about` render the same English words, and telling a
   * search engine they are two distinct pages is how duplicate content gets
   * created out of a routing convenience.
   */
  const canonical = authored
    ? publicUrl(localePath(locale, path))
    : publicUrl(localePath(defaultLocale, path));

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: languageAlternates(path),
    },
    openGraph: {
      type: "website",
      siteName,
      title,
      description,
      url: canonical,
      // The locale of the content, not of the request: this page is in
      // English whenever `locale` has no authored dictionary.
      locale: contentLocale,
    },
    twitter: {
      // `summary` rather than `summary_large_image`: there is no large image to
      // show, and claiming one produces an empty card.
      card: "summary",
      title,
      description,
    },
    robots: indexed
      ? { index: true, follow: true }
      : {
          // Not indexed, for one of two reasons: the page is untranslated
          // English under a German (or Urdu, or Japanese) URL, or the route
          // describes a capability that does not exist yet.
          //
          // Still *followed* in both cases, because the links on the page are
          // real and lead to pages worth crawling. This is a "do not surface
          // this URL in results" decision, not a quarantine — which is exactly
          // why `robots.txt` must keep allowing these paths. A crawler refused
          // the fetch never reads the directive it was refused.
          index: false,
          follow: true,
          nocache: true,
        },
  };
}

/**
 * Metadata for pages that must never be indexed, in any locale.
 *
 * Flight Results and Flight Details carry generated demonstration content and
 * query-specific state. Indexing them would publish fictional itineraries and
 * fictional prices as though they were pages worth finding — the precise
 * misunderstanding the rest of this release exists to prevent.
 *
 * This directive is the **only** mechanism keeping those pages out of an
 * index, which is why `robots.txt` must not disallow them: a crawler that is
 * blocked from fetching a URL never reads its `noindex`, and the URL itself
 * can still surface as a bare link. Blocking and `noindex` are alternatives,
 * not layers.
 *
 * `nocache` and the Google-specific directives are included because `noindex`
 * alone still permits a cached snippet.
 */
export function buildNonIndexableMetadata(
  title: string,
  description: string,
): Metadata {
  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
  };
}

/**
 * A minimal, entirely factual Organization + WebSite graph.
 *
 * Every field is something this repository can prove: the legal name, the
 * product name, the public location at province granularity, the contact
 * address and the canonical URL. Deliberately absent: `sameAs` (no social
 * profile is confirmed), any `aggregateRating`, any `Offer`, any `Review`, and
 * any price. Those are exactly the fields that turn structured data into a
 * claim a partner would be right to check — and GTAI has nothing real to put
 * in them.
 */
export function buildOrganizationJsonLd(siteName: string): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: publicCompanyProfile.legalName,
        alternateName: publicCompanyProfile.productName,
        url: publicCompanyProfile.websiteUrl,
        description: publicCompanyProfile.businessDescription,
        address: {
          "@type": "PostalAddress",
          addressRegion: "Quebec",
          addressCountry: publicCompanyProfile.countryCode,
        },
        contactPoint: {
          "@type": "ContactPoint",
          // "general inquiries", not "customer support". The mailbox handles
          // general, partnership and technical questions; describing it as a
          // support desk would claim a service level nobody has committed to.
          contactType: "general inquiries",
          email: publicCompanyProfile.contactEmail,
        },
      },
      {
        "@type": "WebSite",
        name: siteName,
        url: publicCompanyProfile.websiteUrl,
        publisher: {
          "@type": "Organization",
          name: publicCompanyProfile.legalName,
        },
      },
    ],
  });
}
