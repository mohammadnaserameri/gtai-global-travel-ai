import type { Metadata } from "next";
import { Geist } from "next/font/google";

import "@/app/globals.css";

import {
  defaultLocale,
  dictionaryLocales,
  getDirection,
  isSupportedLocale,
} from "@/config/locales";
import { getDictionary } from "@/i18n/get-dictionary";
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
  const dictionary = await getDictionary(locale);

  return {
    title: {
      default: dictionary.meta.home.title,
      template: `%s`,
    },
    description: dictionary.meta.home.description,
    applicationName: dictionary.meta.siteName,
  };
}

/**
 * Root layout.
 *
 * It lives inside `[locale]` on purpose: `lang` and `dir` are per-locale
 * attributes of the `<html>` element, and only the top-most layout can set
 * them. `src/proxy.ts` guarantees every request reaches this layout with a
 * locale segment already in place.
 */
export default async function LocaleLayout({
  children,
  params,
}: LocaleParams & { children: React.ReactNode }) {
  const { locale: requested } = await params;
  const locale = isSupportedLocale(requested) ? requested : defaultLocale;
  const dictionary = await getDictionary(locale);
  const dir = getDirection(locale);

  return (
    <html lang={locale} dir={dir} className={`${sans.variable} h-full`}>
      <body className="bg-background text-foreground flex min-h-full flex-col">
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
