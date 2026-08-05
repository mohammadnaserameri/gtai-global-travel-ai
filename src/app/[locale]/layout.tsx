import type { Metadata } from "next";
import { Geist } from "next/font/google";

import "@/app/globals.css";

import {
  defaultLocale,
  dictionaryLocales,
  getDirection,
  hasAuthoredDictionary,
  isSupportedLocale,
  resolveContentLocale,
} from "@/config/locales";
import { publicCompanyProfile } from "@/config/public-company-profile";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildOrganizationJsonLd } from "@/lib/seo/public-metadata";
import { RegionProvider } from "@/components/region/RegionProvider";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

const sans = Geist({
  variable: "--font-gtai-sans",
  subsets: ["latin"],
  display: "swap",
});

interface LocaleParams {
  params: Promise<{ locale: string }>;
}

/**
 * Pre-render the locales that ship an authored dictionary. Every other
 * supported locale is rendered on demand and falls back to English strings, so
 * adding a language never requires a build-configuration change.
 */
export function generateStaticParams() {
  return dictionaryLocales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LocaleParams): Promise<Metadata> {
  const { locale } = await params;
  const contentLocale = resolveContentLocale(locale);
  const dictionary = await getDictionary(contentLocale);

  return {
    // `metadataBase` makes every relative URL a page declares resolve against
    // the real public origin. It is a literal from the shared profile, not an
    // environment variable — a base URL that depends on deployment config is
    // one that silently points at a preview host.
    metadataBase: new URL(publicCompanyProfile.websiteUrl),
    title: {
      default: dictionary.meta.home.title,
      template: `%s`,
    },
    description: dictionary.meta.home.description,
    applicationName: dictionary.meta.siteName,
    openGraph: {
      type: "website",
      siteName: dictionary.meta.siteName,
      // The language the page is actually written in.
      locale: contentLocale,
    },
    // The layout-level default for an unauthored locale: every page under it is
    // untranslated English at a non-English URL, so none of them should be
    // indexed. A page with a stricter policy of its own — Results and Details
    // are `noindex` in every locale — overrides this rather than relaxing it.
    ...(hasAuthoredDictionary(locale)
      ? {}
      : { robots: { index: false, follow: true, nocache: true } }),
  };
}

/**
 * Root layout.
 *
 * It lives inside `[locale]` on purpose: `lang` and `dir` are per-locale
 * attributes of the `<html>` element, and only the top-most layout can set
 * them. `src/proxy.ts` guarantees every request reaches this layout with a
 * locale segment already in place.
 *
 * **Two locales, deliberately.** `requestedLocale` is what the URL says and
 * what the visitor chose; `contentLocale` is the language the page is actually
 * written in. They are identical for the four authored locales and diverge for
 * the other 28, which render English.
 *
 * The split matters because the two drive different things. `lang` and `dir`
 * describe the *text* — declaring `lang="de"` over English words tells a
 * screen reader to pronounce English with German phonetics, and tells a search
 * engine the page is German when it is not. The region and currency heuristic,
 * by contrast, is about the visitor's stated preference, so it keeps using the
 * requested locale and stays correct even with no translation available.
 */
export default async function LocaleLayout({
  children,
  params,
}: LocaleParams & { children: React.ReactNode }) {
  const { locale: requested } = await params;
  const requestedLocale = isSupportedLocale(requested) ? requested : defaultLocale;
  const contentLocale = resolveContentLocale(requestedLocale);
  const dictionary = await getDictionary(contentLocale);
  const dir = getDirection(contentLocale);
  // Routing, the locale selector and every internal link keep the requested
  // locale, so `/de/about` still links to `/de/privacy` rather than silently
  // dropping the visitor into English URLs.
  const locale = requestedLocale;

  return (
    <html lang={contentLocale} dir={dir} className={`${sans.variable} h-full`}>
      <body className="bg-background text-foreground flex min-h-full flex-col">
        {/* Organization + WebSite only. Every field is a fact this repository
            can prove; there is deliberately no rating, offer, price, review or
            unconfirmed social profile — those are exactly the fields that turn
            structured data into a claim. */}
        <script
          type="application/ld+json"
          // The payload is built from `JSON.stringify` over a literal object,
          // so it contains no interpolated or user-supplied text.
          dangerouslySetInnerHTML={{
            __html: buildOrganizationJsonLd(dictionary.meta.siteName),
          }}
        />

        <a
          href="#gtai-main"
          className="focus:bg-brand-800 sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white"
        >
          {dictionary.common.skipToContent}
        </a>

        {/* `key` forces a fresh region resolution when the locale changes, so a
            visitor switching to Persian sees the Iran/USD default rather than a
            stale Canadian one. */}
        <RegionProvider key={locale} locale={locale}>
          <Header locale={locale} dictionary={dictionary} />
          <main id="gtai-main" className="flex-1">
            {children}
          </main>
          <Footer locale={locale} dictionary={dictionary} />
        </RegionProvider>
      </body>
    </html>
  );
}
