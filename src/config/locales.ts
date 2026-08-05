import type { CountryCode } from "@/config/countries";

/** Text direction supported by the application shell. */
export type Direction = "ltr" | "rtl";

export interface LocaleDefinition {
  /** BCP-47 primary subtag used in the URL: /[locale]/... */
  code: string;
  /** Language name written in its own script. */
  nativeName: string;
  /** Language name written in English, for selector search and a11y labels. */
  englishName: string;
  /** Document direction applied to <html dir="...">. */
  dir: Direction;
  /**
   * Country used to resolve a display currency when the visitor has not
   * chosen one. This is a deterministic locale heuristic — never geolocation.
   */
  fallbackCountry: CountryCode;
  /**
   * True when a V1 demonstration dictionary ships for this locale.
   * Every other locale falls back safely to English, key by key.
   */
  hasDictionary: boolean;
}

/**
 * The full locale surface GTAI intends to support worldwide.
 *
 * V1 ships complete English content plus demonstration dictionaries for
 * French, Persian and Arabic. All remaining locales route correctly and fall
 * back to English strings until their dictionaries are authored.
 */
export const locales: readonly LocaleDefinition[] = [
  {
    code: "en",
    nativeName: "English",
    englishName: "English",
    dir: "ltr",
    fallbackCountry: "CA",
    hasDictionary: true,
  },
  {
    code: "fr",
    nativeName: "Français",
    englishName: "French",
    dir: "ltr",
    fallbackCountry: "FR",
    hasDictionary: true,
  },
  {
    code: "es",
    nativeName: "Español",
    englishName: "Spanish",
    dir: "ltr",
    fallbackCountry: "ES",
    hasDictionary: false,
  },
  {
    code: "de",
    nativeName: "Deutsch",
    englishName: "German",
    dir: "ltr",
    fallbackCountry: "DE",
    hasDictionary: false,
  },
  {
    code: "it",
    nativeName: "Italiano",
    englishName: "Italian",
    dir: "ltr",
    fallbackCountry: "IT",
    hasDictionary: false,
  },
  {
    code: "pt",
    nativeName: "Português",
    englishName: "Portuguese",
    dir: "ltr",
    fallbackCountry: "PT",
    hasDictionary: false,
  },
  {
    code: "nl",
    nativeName: "Nederlands",
    englishName: "Dutch",
    dir: "ltr",
    fallbackCountry: "NL",
    hasDictionary: false,
  },
  {
    code: "sv",
    nativeName: "Svenska",
    englishName: "Swedish",
    dir: "ltr",
    fallbackCountry: "SE",
    hasDictionary: false,
  },
  {
    code: "no",
    nativeName: "Norsk",
    englishName: "Norwegian",
    dir: "ltr",
    fallbackCountry: "NO",
    hasDictionary: false,
  },
  {
    code: "da",
    nativeName: "Dansk",
    englishName: "Danish",
    dir: "ltr",
    fallbackCountry: "DK",
    hasDictionary: false,
  },
  {
    code: "fi",
    nativeName: "Suomi",
    englishName: "Finnish",
    dir: "ltr",
    fallbackCountry: "FI",
    hasDictionary: false,
  },
  {
    code: "pl",
    nativeName: "Polski",
    englishName: "Polish",
    dir: "ltr",
    fallbackCountry: "PL",
    hasDictionary: false,
  },
  {
    code: "cs",
    nativeName: "Čeština",
    englishName: "Czech",
    dir: "ltr",
    fallbackCountry: "CZ",
    hasDictionary: false,
  },
  {
    code: "ro",
    nativeName: "Română",
    englishName: "Romanian",
    dir: "ltr",
    fallbackCountry: "RO",
    hasDictionary: false,
  },
  {
    code: "hu",
    nativeName: "Magyar",
    englishName: "Hungarian",
    dir: "ltr",
    fallbackCountry: "HU",
    hasDictionary: false,
  },
  {
    code: "el",
    nativeName: "Ελληνικά",
    englishName: "Greek",
    dir: "ltr",
    fallbackCountry: "GR",
    hasDictionary: false,
  },
  {
    code: "uk",
    nativeName: "Українська",
    englishName: "Ukrainian",
    dir: "ltr",
    fallbackCountry: "UA",
    hasDictionary: false,
  },
  {
    code: "ru",
    nativeName: "Русский",
    englishName: "Russian",
    dir: "ltr",
    fallbackCountry: "RU",
    hasDictionary: false,
  },
  {
    code: "tr",
    nativeName: "Türkçe",
    englishName: "Turkish",
    dir: "ltr",
    fallbackCountry: "TR",
    hasDictionary: false,
  },
  {
    code: "ar",
    nativeName: "العربية",
    englishName: "Arabic",
    dir: "rtl",
    fallbackCountry: "AE",
    hasDictionary: true,
  },
  {
    code: "fa",
    nativeName: "فارسی",
    englishName: "Persian",
    dir: "rtl",
    fallbackCountry: "IR",
    hasDictionary: true,
  },
  {
    code: "ur",
    nativeName: "اردو",
    englishName: "Urdu",
    dir: "rtl",
    fallbackCountry: "PK",
    hasDictionary: false,
  },
  {
    code: "he",
    nativeName: "עברית",
    englishName: "Hebrew",
    dir: "rtl",
    fallbackCountry: "IL",
    hasDictionary: false,
  },
  {
    code: "hi",
    nativeName: "हिन्दी",
    englishName: "Hindi",
    dir: "ltr",
    fallbackCountry: "IN",
    hasDictionary: false,
  },
  {
    code: "bn",
    nativeName: "বাংলা",
    englishName: "Bengali",
    dir: "ltr",
    fallbackCountry: "BD",
    hasDictionary: false,
  },
  {
    code: "zh",
    nativeName: "中文",
    englishName: "Chinese",
    dir: "ltr",
    fallbackCountry: "CN",
    hasDictionary: false,
  },
  {
    code: "ja",
    nativeName: "日本語",
    englishName: "Japanese",
    dir: "ltr",
    fallbackCountry: "JP",
    hasDictionary: false,
  },
  {
    code: "ko",
    nativeName: "한국어",
    englishName: "Korean",
    dir: "ltr",
    fallbackCountry: "KR",
    hasDictionary: false,
  },
  {
    code: "id",
    nativeName: "Bahasa Indonesia",
    englishName: "Indonesian",
    dir: "ltr",
    fallbackCountry: "ID",
    hasDictionary: false,
  },
  {
    code: "ms",
    nativeName: "Bahasa Melayu",
    englishName: "Malay",
    dir: "ltr",
    fallbackCountry: "MY",
    hasDictionary: false,
  },
  {
    code: "th",
    nativeName: "ไทย",
    englishName: "Thai",
    dir: "ltr",
    fallbackCountry: "TH",
    hasDictionary: false,
  },
  {
    code: "vi",
    nativeName: "Tiếng Việt",
    englishName: "Vietnamese",
    dir: "ltr",
    fallbackCountry: "VN",
    hasDictionary: false,
  },
] as const;

export const defaultLocale = "en";

export const localeCodes: readonly string[] = locales.map((l) => l.code);

const localeMap = new Map(locales.map((l) => [l.code, l]));

export function isSupportedLocale(value: string | undefined | null): boolean {
  return typeof value === "string" && localeMap.has(value);
}

export function getLocale(code: string): LocaleDefinition {
  return localeMap.get(code) ?? localeMap.get(defaultLocale)!;
}

export function getDirection(code: string): Direction {
  return getLocale(code).dir;
}

export function isRtlLocale(code: string): boolean {
  return getDirection(code) === "rtl";
}

/** Locales that ship an authored dictionary in V1. */
export const dictionaryLocales = locales
  .filter((l) => l.hasDictionary)
  .map((l) => l.code);

/**
 * Whether a locale has content actually written in that language.
 *
 * This is the distinction the rest of the application was missing. GTAI routes
 * 32 locales but authors 4, and each of the other 28 renders English text. That
 * a reasonable product decision and a bad *publishing* one when the page still
 * declares `lang="de"`, still self-canonicalizes to `/de/...`, and is still
 * indexable: the result is a page that lies about its language and duplicates
 * the English one under a different URL.
 */
export function hasAuthoredDictionary(code: string): boolean {
  return localeMap.get(code)?.hasDictionary === true;
}

/**
 * The locale whose language the visitor will actually read.
 *
 * Requested locale and content locale are two different things:
 *
 * - **Requested** — what the URL says. It drives routing, the locale selector's
 *   own state, and the region/currency heuristic, all of which are about the
 *   visitor's stated preference and stay correct even with no translation.
 * - **Content** — what the page is written in. It drives `<html lang>`,
 *   `<html dir>`, the dictionary, the metadata language and the canonical URL.
 *
 * For an authored locale the two are identical. For a supported-but-unauthored
 * locale the content locale is English, because English is what the page
 * contains. An unknown locale resolves through the existing default policy.
 */
export function resolveContentLocale(code: string): string {
  if (hasAuthoredDictionary(code)) return code;
  return defaultLocale;
}
