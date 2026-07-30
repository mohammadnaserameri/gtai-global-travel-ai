import type { TravelLocation } from "./location-types";
import { resolveCountryName } from "./country-names";

/** Locales that separate list items with an Arabic comma. */
const ARABIC_COMMA_LOCALES = new Set(["fa", "ar", "ur"]);

/** `"City، Country"` in Persian/Arabic, `"City, Country"` elsewhere. */
function joinPlace(place: string, country: string, locale: string): string {
  const base = locale.split("-")[0];
  const separator = ARABIC_COMMA_LOCALES.has(base) ? "، " : ", ";
  return `${place}${separator}${country}`;
}

/**
 * The country name to display for an entity.
 *
 * The fallback chain lives in `resolveCountryName`; this is the only place the
 * UI reaches for it, so no result component re-implements the lookup.
 */
function localizedCountry(location: TravelLocation, locale: string): string {
  return resolveCountryName(
    location.localizedCountryNames,
    locale,
    location.countryName,
  );
}

/**
 * Turns a normalized entity into the strings the UI shows.
 *
 * Kept out of the components so the same entity renders identically in the
 * field, the result row and the screen-reader announcement.
 */

export interface LocationLabelStrings {
  /** e.g. "All airports" */
  readonly allAirports: string;
  /** e.g. "Everywhere" */
  readonly everywhere: string;
  /** e.g. "Explore destinations within your budget" */
  readonly everywhereDescription: string;
}

/** Prefers a locale-specific name, falling back to the dataset's base name. */
export function localizedName(location: TravelLocation, locale: string): string {
  return location.localizedNames[locale] ?? location.displayName;
}

/**
 * The entity's parent city name alone — no country, no code. Used where a
 * compact "Montreal → London" summary needs just the city, not the airport's
 * own name or the "City, Country" pair `locationPrimaryLabel` renders.
 */
export function cityLabel(location: TravelLocation, locale: string): string {
  if (location.isFlexibleDestination) return location.cityName;
  return location.localizedCityNames[locale] ?? location.cityName;
}

/**
 * The parent city's name, never the entity's own. An airport carries its own
 * localized name in `localizedNames`, so reading the city from there would
 * print the airport name twice on an airport row.
 */
function localizedCity(location: TravelLocation, locale: string): string {
  return location.localizedCityNames[locale] ?? location.cityName;
}

/** Headline text for a result row. */
export function locationPrimaryLabel(
  location: TravelLocation,
  locale: string,
  labels: LocationLabelStrings,
): string {
  if (location.isFlexibleDestination) return labels.everywhere;
  if (location.entityType === "CITY_ALL_AIRPORTS") {
    return joinPlace(
      localizedCity(location, locale),
      localizedCountry(location, locale),
      locale,
    );
  }
  return localizedName(location, locale);
}

/**
 * Supporting text for a result row, split so the code can be rendered with
 * LTR isolation inside an RTL layout.
 */
export interface LocationSecondary {
  /** Short code shown first for airports, last for cities. Never localized. */
  readonly code: string | null;
  /** Plain-language remainder. */
  readonly text: string;
  /** True when the code should render before the text. */
  readonly codeFirst: boolean;
}

export function locationSecondaryLabel(
  location: TravelLocation,
  locale: string,
  labels: LocationLabelStrings,
): LocationSecondary {
  if (location.isFlexibleDestination) {
    return { code: null, text: labels.everywhereDescription, codeFirst: false };
  }

  if (location.entityType === "CITY_ALL_AIRPORTS") {
    return { code: location.cityCode, text: labels.allAirports, codeFirst: false };
  }

  return {
    code: location.iataCode,
    text: joinPlace(
      localizedCity(location, locale),
      localizedCountry(location, locale),
      locale,
    ),
    codeFirst: true,
  };
}

/** Value shown inside the closed field once a location is selected. */
export function locationFieldValue(
  location: TravelLocation,
  locale: string,
  labels: LocationLabelStrings,
): string {
  if (location.isFlexibleDestination) return labels.everywhere;

  const code =
    location.entityType === "CITY_ALL_AIRPORTS"
      ? location.cityCode
      : location.iataCode;

  const base =
    location.entityType === "CITY_ALL_AIRPORTS"
      ? localizedCity(location, locale)
      : localizedName(location, locale);

  return code ? `${base} (${code})` : base;
}

/** Flat sentence used for screen-reader announcements. */
export function locationAnnouncement(
  location: TravelLocation,
  locale: string,
  labels: LocationLabelStrings,
): string {
  const primary = locationPrimaryLabel(location, locale, labels);
  const secondary = locationSecondaryLabel(location, locale, labels);
  const parts = [primary, secondary.code, secondary.text].filter(Boolean);
  return parts.join(", ");
}
