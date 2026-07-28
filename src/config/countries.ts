import type { CurrencyCode } from "@/config/currencies";

/**
 * Country metadata backing the region selector and the display-currency rules.
 *
 * The list is deliberately curated rather than exhaustive: it covers GTAI's
 * launch markets plus the largest outbound travel markets worldwide. Adding a
 * country is a data-only change.
 */

export interface CountryDefinition {
  /** ISO 3166-1 alpha-2 code. */
  code: string;
  /** English country name — the selector's searchable label. */
  name: string;
  /** ISO 4217 code GTAI will display prices in for this country. */
  currency: CurrencyCode;
  /** Coarse grouping used to organize the selector. */
  region:
    | "north-america"
    | "latin-america"
    | "europe"
    | "middle-east"
    | "africa"
    | "asia-pacific"
    | "south-asia";
  /** True for euro-area member states. */
  eurozone?: boolean;
  /**
   * Set when the displayed currency intentionally differs from the country's
   * legal tender. Documented so the rule is never mistaken for a bug.
   */
  currencyNote?: string;
}

export const countries: readonly CountryDefinition[] = [
  // --- North America -------------------------------------------------------
  { code: "CA", name: "Canada", currency: "CAD", region: "north-america" },
  { code: "US", name: "United States", currency: "USD", region: "north-america" },
  { code: "MX", name: "Mexico", currency: "MXN", region: "north-america" },

  // --- Latin America -------------------------------------------------------
  { code: "BR", name: "Brazil", currency: "BRL", region: "latin-america" },
  { code: "AR", name: "Argentina", currency: "ARS", region: "latin-america" },
  { code: "CL", name: "Chile", currency: "CLP", region: "latin-america" },
  { code: "CO", name: "Colombia", currency: "COP", region: "latin-america" },
  { code: "PE", name: "Peru", currency: "PEN", region: "latin-america" },

  // --- Europe: eurozone ----------------------------------------------------
  {
    code: "AT",
    name: "Austria",
    currency: "EUR",
    region: "europe",
    eurozone: true,
  },
  {
    code: "BE",
    name: "Belgium",
    currency: "EUR",
    region: "europe",
    eurozone: true,
  },
  {
    code: "HR",
    name: "Croatia",
    currency: "EUR",
    region: "europe",
    eurozone: true,
  },
  { code: "CY", name: "Cyprus", currency: "EUR", region: "europe", eurozone: true },
  {
    code: "EE",
    name: "Estonia",
    currency: "EUR",
    region: "europe",
    eurozone: true,
  },
  {
    code: "FI",
    name: "Finland",
    currency: "EUR",
    region: "europe",
    eurozone: true,
  },
  { code: "FR", name: "France", currency: "EUR", region: "europe", eurozone: true },
  {
    code: "DE",
    name: "Germany",
    currency: "EUR",
    region: "europe",
    eurozone: true,
  },
  { code: "GR", name: "Greece", currency: "EUR", region: "europe", eurozone: true },
  {
    code: "IE",
    name: "Ireland",
    currency: "EUR",
    region: "europe",
    eurozone: true,
  },
  { code: "IT", name: "Italy", currency: "EUR", region: "europe", eurozone: true },
  { code: "LV", name: "Latvia", currency: "EUR", region: "europe", eurozone: true },
  {
    code: "LT",
    name: "Lithuania",
    currency: "EUR",
    region: "europe",
    eurozone: true,
  },
  {
    code: "LU",
    name: "Luxembourg",
    currency: "EUR",
    region: "europe",
    eurozone: true,
  },
  { code: "MT", name: "Malta", currency: "EUR", region: "europe", eurozone: true },
  {
    code: "NL",
    name: "Netherlands",
    currency: "EUR",
    region: "europe",
    eurozone: true,
  },
  {
    code: "PT",
    name: "Portugal",
    currency: "EUR",
    region: "europe",
    eurozone: true,
  },
  {
    code: "SK",
    name: "Slovakia",
    currency: "EUR",
    region: "europe",
    eurozone: true,
  },
  {
    code: "SI",
    name: "Slovenia",
    currency: "EUR",
    region: "europe",
    eurozone: true,
  },
  { code: "ES", name: "Spain", currency: "EUR", region: "europe", eurozone: true },

  // --- Europe: non-eurozone ------------------------------------------------
  { code: "GB", name: "United Kingdom", currency: "GBP", region: "europe" },
  { code: "CH", name: "Switzerland", currency: "CHF", region: "europe" },
  { code: "NO", name: "Norway", currency: "NOK", region: "europe" },
  { code: "SE", name: "Sweden", currency: "SEK", region: "europe" },
  { code: "DK", name: "Denmark", currency: "DKK", region: "europe" },
  { code: "IS", name: "Iceland", currency: "ISK", region: "europe" },
  { code: "PL", name: "Poland", currency: "PLN", region: "europe" },
  { code: "CZ", name: "Czechia", currency: "CZK", region: "europe" },
  { code: "HU", name: "Hungary", currency: "HUF", region: "europe" },
  { code: "RO", name: "Romania", currency: "RON", region: "europe" },
  { code: "BG", name: "Bulgaria", currency: "BGN", region: "europe" },
  { code: "RS", name: "Serbia", currency: "RSD", region: "europe" },
  { code: "UA", name: "Ukraine", currency: "UAH", region: "europe" },
  { code: "RU", name: "Russia", currency: "RUB", region: "europe" },
  { code: "TR", name: "Türkiye", currency: "TRY", region: "europe" },

  // --- Middle East ---------------------------------------------------------
  {
    code: "AE",
    name: "United Arab Emirates",
    currency: "AED",
    region: "middle-east",
  },
  { code: "SA", name: "Saudi Arabia", currency: "SAR", region: "middle-east" },
  { code: "QA", name: "Qatar", currency: "QAR", region: "middle-east" },
  { code: "KW", name: "Kuwait", currency: "KWD", region: "middle-east" },
  { code: "BH", name: "Bahrain", currency: "BHD", region: "middle-east" },
  { code: "OM", name: "Oman", currency: "OMR", region: "middle-east" },
  { code: "JO", name: "Jordan", currency: "JOD", region: "middle-east" },
  { code: "IL", name: "Israel", currency: "ILS", region: "middle-east" },
  {
    code: "IR",
    name: "Iran",
    currency: "USD",
    region: "middle-east",
    currencyNote:
      "GTAI displays USD for Iran. The Iranian rial is not used as a display currency.",
  },

  // --- Africa --------------------------------------------------------------
  { code: "EG", name: "Egypt", currency: "EGP", region: "africa" },
  { code: "MA", name: "Morocco", currency: "MAD", region: "africa" },
  { code: "ZA", name: "South Africa", currency: "ZAR", region: "africa" },
  { code: "NG", name: "Nigeria", currency: "NGN", region: "africa" },
  { code: "KE", name: "Kenya", currency: "KES", region: "africa" },

  // --- South Asia ----------------------------------------------------------
  { code: "IN", name: "India", currency: "INR", region: "south-asia" },
  { code: "PK", name: "Pakistan", currency: "PKR", region: "south-asia" },
  { code: "BD", name: "Bangladesh", currency: "BDT", region: "south-asia" },
  { code: "LK", name: "Sri Lanka", currency: "LKR", region: "south-asia" },
  { code: "NP", name: "Nepal", currency: "NPR", region: "south-asia" },

  // --- Asia-Pacific --------------------------------------------------------
  { code: "JP", name: "Japan", currency: "JPY", region: "asia-pacific" },
  { code: "CN", name: "China", currency: "CNY", region: "asia-pacific" },
  { code: "KR", name: "South Korea", currency: "KRW", region: "asia-pacific" },
  { code: "HK", name: "Hong Kong SAR", currency: "HKD", region: "asia-pacific" },
  { code: "TW", name: "Taiwan", currency: "TWD", region: "asia-pacific" },
  { code: "SG", name: "Singapore", currency: "SGD", region: "asia-pacific" },
  { code: "MY", name: "Malaysia", currency: "MYR", region: "asia-pacific" },
  { code: "ID", name: "Indonesia", currency: "IDR", region: "asia-pacific" },
  { code: "TH", name: "Thailand", currency: "THB", region: "asia-pacific" },
  { code: "VN", name: "Vietnam", currency: "VND", region: "asia-pacific" },
  { code: "PH", name: "Philippines", currency: "PHP", region: "asia-pacific" },
  { code: "AU", name: "Australia", currency: "AUD", region: "asia-pacific" },
  { code: "NZ", name: "New Zealand", currency: "NZD", region: "asia-pacific" },
] as const;

export type CountryCode = (typeof countries)[number]["code"];

/** GTAI's home market. */
export const defaultCountry: CountryCode = "CA";

const countryMap = new Map<string, CountryDefinition>(
  countries.map((c) => [c.code, c]),
);

export function isSupportedCountry(value: string): value is CountryCode {
  return countryMap.has(value);
}

export function getCountry(code: string): CountryDefinition | undefined {
  return countryMap.get(code);
}

/** Countries surfaced at the top of the region selector. */
export const featuredCountryCodes: readonly CountryCode[] = [
  "CA",
  "US",
  "GB",
  "FR",
  "DE",
  "AE",
  "IR",
  "IN",
  "JP",
  "AU",
];
