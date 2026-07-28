import en from "@/i18n/dictionaries/en.json";
import { defaultLocale, isSupportedLocale } from "@/config/locales";
import type { DeepPartial } from "@/types/utility";

/**
 * The dictionary contract is the English file. Every other locale is a
 * (possibly partial) override of it, so a missing key can never crash a page —
 * it simply renders the English string.
 */
export type Dictionary = typeof en;

type DictionaryOverride = DeepPartial<Dictionary>;

/**
 * Locales with an authored V1 dictionary. Loaded lazily so a request for one
 * language never pulls the others into the response.
 */
const loaders: Record<string, () => Promise<DictionaryOverride>> = {
  en: async () => en,
  fr: () => import("@/i18n/dictionaries/fr.json").then((m) => m.default),
  fa: () => import("@/i18n/dictionaries/fa.json").then((m) => m.default),
  ar: () => import("@/i18n/dictionaries/ar.json").then((m) => m.default),
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursively overlays `override` on top of `base`.
 *
 * Objects merge key by key. Arrays are replaced wholesale, because a partially
 * translated list would interleave two languages inside one component.
 */
function mergeDeep<T>(base: T, override: unknown): T {
  if (override === undefined || override === null) return base;
  if (!isPlainObject(base) || !isPlainObject(override)) return override as T;

  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    result[key] = mergeDeep(base[key], override[key]);
  }
  return result as T;
}

/**
 * Resolves the dictionary for a locale.
 *
 * Unknown locales, and supported locales without an authored dictionary, fall
 * back to English. Partial dictionaries fall back key by key.
 */
export async function getDictionary(locale: string): Promise<Dictionary> {
  const code = isSupportedLocale(locale) ? locale : defaultLocale;
  const load = loaders[code];
  if (!load) return en;

  try {
    const override = await load();
    return mergeDeep(en, override);
  } catch {
    // A malformed or missing dictionary must never take a page down.
    return en;
  }
}
