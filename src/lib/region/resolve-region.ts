import {
  defaultCountry,
  getCountry,
  isSupportedCountry,
  type CountryCode,
} from "@/config/countries";
import { getLocale, isSupportedLocale } from "@/config/locales";
import {
  fallbackCurrency,
  isSupportedCurrency,
  type CurrencyCode,
} from "@/config/currencies";

/**
 * Region resolution.
 *
 * V1 is deliberately deterministic and offline: GTAI performs **no IP
 * geolocation, no GPS lookup and no device fingerprinting**. A visitor's
 * country is either something they chose, or a transparent guess derived from
 * the language they are reading the site in.
 */

export type RegionSource =
  /** The visitor picked this country in the region selector. */
  | "user-selection"
  /** Derived from the active locale, shown to the visitor as a suggestion. */
  | "locale-fallback"
  /** Nothing else applied — GTAI's home market. */
  | "default";

export type CurrencySource =
  /** The visitor picked this currency explicitly. */
  | "user-selection"
  /** Mapped from the resolved country. */
  | "country-rule"
  /** The country has no mapping — safe worldwide default. */
  | "fallback";

export interface RegionInput {
  /** A country the visitor selected, if any. */
  country?: string | null;
  /** A currency the visitor selected, if any. */
  currency?: string | null;
  /** The active locale, used only as a transparent heuristic. */
  locale?: string | null;
}

export interface ResolvedRegion {
  country: CountryCode;
  countrySource: RegionSource;
  currency: CurrencyCode;
  currencySource: CurrencySource;
}

/**
 * Maps a locale to a plausible country so first-time visitors see a sensible
 * default. This is a language heuristic, never a location measurement.
 */
export function getLocaleFallbackCountry(
  locale: string | null | undefined,
): CountryCode {
  if (!locale || !isSupportedLocale(locale)) return defaultCountry;
  return getLocale(locale).fallbackCountry;
}

/**
 * The display currency GTAI uses for a country.
 *
 * Business rules live in `src/config/countries.ts`. Two are worth calling out:
 * Canada resolves to CAD (GTAI's home market) and Iran resolves to USD rather
 * than IRR. Any country GTAI does not know resolves to USD.
 */
export function getCountryCurrency(
  country: string | null | undefined,
): CurrencyCode {
  if (!country) return fallbackCurrency;
  const definition = getCountry(country);
  return definition ? definition.currency : fallbackCurrency;
}

/**
 * Resolves the currency to display prices in.
 *
 * An explicit visitor choice always wins; otherwise the country rule applies;
 * otherwise USD.
 */
export function resolveDisplayCurrency(input: RegionInput = {}): CurrencyCode {
  if (input.currency && isSupportedCurrency(input.currency)) {
    return input.currency;
  }
  const country = resolveUserRegion(input).country;
  return getCountryCurrency(country);
}

/**
 * Resolves the visitor's region and display currency together, reporting where
 * each value came from so the UI can be honest about it.
 */
export function resolveUserRegion(input: RegionInput = {}): ResolvedRegion {
  let country: CountryCode = defaultCountry;
  let countrySource: RegionSource = "default";

  if (input.country && isSupportedCountry(input.country)) {
    country = input.country;
    countrySource = "user-selection";
  } else if (input.locale && isSupportedLocale(input.locale)) {
    country = getLocaleFallbackCountry(input.locale);
    countrySource = "locale-fallback";
  }

  let currency: CurrencyCode;
  let currencySource: CurrencySource;

  if (input.currency && isSupportedCurrency(input.currency)) {
    currency = input.currency;
    currencySource = "user-selection";
  } else {
    const definition = getCountry(country);
    currency = definition ? definition.currency : fallbackCurrency;
    currencySource = definition ? "country-rule" : "fallback";
  }

  return { country, countrySource, currency, currencySource };
}
