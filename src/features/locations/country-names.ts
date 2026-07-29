import type { LocalizedNames } from "./location-types";

/**
 * Localized country names for the demonstration directory.
 *
 * Kept separate from the city/airport data so a country is translated once
 * rather than repeated on every entity, and so a production directory can
 * replace this table without touching the location records.
 *
 * Keys are ISO 3166-1 alpha-2. Only the countries present in the demo data are
 * listed; anything missing falls back through `resolveCountryName`.
 */
const COUNTRY_NAMES: Readonly<Record<string, LocalizedNames>> = {
  CA: {
    en: "Canada",
    fr: "Canada",
    fa: "کانادا",
    ar: "كندا",
  },
  US: {
    en: "United States",
    fr: "États-Unis",
    fa: "ایالات متحده",
    ar: "الولايات المتحدة",
  },
  GB: {
    en: "United Kingdom",
    fr: "Royaume-Uni",
    fa: "بریتانیا",
    ar: "المملكة المتحدة",
  },
  FR: {
    en: "France",
    fr: "France",
    fa: "فرانسه",
    ar: "فرنسا",
  },
  TR: {
    en: "Türkiye",
    fr: "Turquie",
    fa: "ترکیه",
    ar: "تركيا",
  },
  IR: {
    en: "Iran",
    fr: "Iran",
    fa: "ایران",
    ar: "إيران",
  },
  AE: {
    en: "United Arab Emirates",
    fr: "Émirats arabes unis",
    fa: "امارات متحده عربی",
    ar: "الإمارات العربية المتحدة",
  },
  QA: {
    en: "Qatar",
    fr: "Qatar",
    fa: "قطر",
    ar: "قطر",
  },
  DE: {
    en: "Germany",
    fr: "Allemagne",
    fa: "آلمان",
    ar: "ألمانيا",
  },
  NL: {
    en: "Netherlands",
    fr: "Pays-Bas",
    fa: "هلند",
    ar: "هولندا",
  },
  JP: {
    en: "Japan",
    fr: "Japon",
    fa: "ژاپن",
    ar: "اليابان",
  },
};

/** Localized names for one country code, or an empty map when unknown. */
export function countryNamesFor(countryCode: string): LocalizedNames {
  return COUNTRY_NAMES[countryCode] ?? {};
}

/**
 * Resolves the country name to display, following the project's locale
 * fallback rules:
 *
 * 1. the exact requested locale (`fr-CA`)
 * 2. its base language (`fr`)
 * 3. English
 * 4. the canonical name carried on the entity
 *
 * This is the single place the chain is implemented — result components must
 * not re-derive it.
 */
export function resolveCountryName(
  names: LocalizedNames,
  locale: string,
  canonical: string,
): string {
  const base = locale.split("-")[0];
  return names[locale] ?? names[base] ?? names.en ?? canonical;
}
