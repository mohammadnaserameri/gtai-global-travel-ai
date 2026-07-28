/**
 * Currency metadata used by the display-currency selector.
 *
 * V1 stores presentation metadata only. GTAI performs no FX conversion
 * because no real travel prices exist yet.
 */

export interface CurrencyDefinition {
  /** ISO 4217 code. */
  code: string;
  /** Short display symbol. */
  symbol: string;
  /** English name, used for selector search and accessible labels. */
  name: string;
  /** Minor-unit digits, per ISO 4217. */
  decimalDigits: number;
}

export const currencies: readonly CurrencyDefinition[] = [
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", decimalDigits: 2 },
  { code: "USD", symbol: "$", name: "United States Dollar", decimalDigits: 2 },
  { code: "EUR", symbol: "€", name: "Euro", decimalDigits: 2 },
  { code: "GBP", symbol: "£", name: "British Pound Sterling", decimalDigits: 2 },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", decimalDigits: 2 },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar", decimalDigits: 2 },
  { code: "JPY", symbol: "¥", name: "Japanese Yen", decimalDigits: 0 },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan", decimalDigits: 2 },
  { code: "INR", symbol: "₹", name: "Indian Rupee", decimalDigits: 2 },
  { code: "KRW", symbol: "₩", name: "South Korean Won", decimalDigits: 0 },
  { code: "TRY", symbol: "₺", name: "Turkish Lira", decimalDigits: 2 },
  {
    code: "AED",
    symbol: "AED",
    name: "United Arab Emirates Dirham",
    decimalDigits: 2,
  },
  { code: "SAR", symbol: "SAR", name: "Saudi Riyal", decimalDigits: 2 },
  { code: "QAR", symbol: "QAR", name: "Qatari Riyal", decimalDigits: 2 },
  { code: "KWD", symbol: "KWD", name: "Kuwaiti Dinar", decimalDigits: 3 },
  { code: "BHD", symbol: "BHD", name: "Bahraini Dinar", decimalDigits: 3 },
  { code: "OMR", symbol: "OMR", name: "Omani Rial", decimalDigits: 3 },
  { code: "JOD", symbol: "JOD", name: "Jordanian Dinar", decimalDigits: 3 },
  { code: "ILS", symbol: "₪", name: "Israeli New Shekel", decimalDigits: 2 },
  { code: "EGP", symbol: "E£", name: "Egyptian Pound", decimalDigits: 2 },
  { code: "MAD", symbol: "MAD", name: "Moroccan Dirham", decimalDigits: 2 },
  { code: "ZAR", symbol: "R", name: "South African Rand", decimalDigits: 2 },
  { code: "NGN", symbol: "₦", name: "Nigerian Naira", decimalDigits: 2 },
  { code: "KES", symbol: "KSh", name: "Kenyan Shilling", decimalDigits: 2 },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc", decimalDigits: 2 },
  { code: "NOK", symbol: "kr", name: "Norwegian Krone", decimalDigits: 2 },
  { code: "SEK", symbol: "kr", name: "Swedish Krona", decimalDigits: 2 },
  { code: "DKK", symbol: "kr", name: "Danish Krone", decimalDigits: 2 },
  { code: "ISK", symbol: "kr", name: "Icelandic Króna", decimalDigits: 0 },
  { code: "PLN", symbol: "zł", name: "Polish Złoty", decimalDigits: 2 },
  { code: "CZK", symbol: "Kč", name: "Czech Koruna", decimalDigits: 2 },
  { code: "HUF", symbol: "Ft", name: "Hungarian Forint", decimalDigits: 2 },
  { code: "RON", symbol: "lei", name: "Romanian Leu", decimalDigits: 2 },
  { code: "BGN", symbol: "лв", name: "Bulgarian Lev", decimalDigits: 2 },
  { code: "RSD", symbol: "RSD", name: "Serbian Dinar", decimalDigits: 2 },
  { code: "UAH", symbol: "₴", name: "Ukrainian Hryvnia", decimalDigits: 2 },
  { code: "RUB", symbol: "₽", name: "Russian Ruble", decimalDigits: 2 },
  { code: "MXN", symbol: "MX$", name: "Mexican Peso", decimalDigits: 2 },
  { code: "BRL", symbol: "R$", name: "Brazilian Real", decimalDigits: 2 },
  { code: "ARS", symbol: "AR$", name: "Argentine Peso", decimalDigits: 2 },
  { code: "CLP", symbol: "CLP$", name: "Chilean Peso", decimalDigits: 0 },
  { code: "COP", symbol: "COP$", name: "Colombian Peso", decimalDigits: 2 },
  { code: "PEN", symbol: "S/", name: "Peruvian Sol", decimalDigits: 2 },
  { code: "PKR", symbol: "₨", name: "Pakistani Rupee", decimalDigits: 2 },
  { code: "BDT", symbol: "৳", name: "Bangladeshi Taka", decimalDigits: 2 },
  { code: "LKR", symbol: "Rs", name: "Sri Lankan Rupee", decimalDigits: 2 },
  { code: "NPR", symbol: "Rs", name: "Nepalese Rupee", decimalDigits: 2 },
  { code: "THB", symbol: "฿", name: "Thai Baht", decimalDigits: 2 },
  { code: "VND", symbol: "₫", name: "Vietnamese Dong", decimalDigits: 0 },
  { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah", decimalDigits: 2 },
  { code: "MYR", symbol: "RM", name: "Malaysian Ringgit", decimalDigits: 2 },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar", decimalDigits: 2 },
  { code: "PHP", symbol: "₱", name: "Philippine Peso", decimalDigits: 2 },
  { code: "HKD", symbol: "HK$", name: "Hong Kong Dollar", decimalDigits: 2 },
  { code: "TWD", symbol: "NT$", name: "New Taiwan Dollar", decimalDigits: 2 },
] as const;

export type CurrencyCode = (typeof currencies)[number]["code"];

/** Currency used when nothing better can be resolved. */
export const fallbackCurrency: CurrencyCode = "USD";

/** Currency used for the company's home market. */
export const defaultCurrency: CurrencyCode = "CAD";

const currencyMap = new Map<string, CurrencyDefinition>(
  currencies.map((c) => [c.code, c]),
);

export function isSupportedCurrency(value: string): value is CurrencyCode {
  return currencyMap.has(value);
}

export function getCurrency(code: string): CurrencyDefinition {
  return currencyMap.get(code) ?? currencyMap.get(fallbackCurrency)!;
}

/**
 * A short currency list surfaced first in the selector so the most common
 * GTAI markets stay one keystroke away.
 */
export const featuredCurrencyCodes: readonly CurrencyCode[] = [
  "CAD",
  "USD",
  "EUR",
  "GBP",
  "AUD",
  "AED",
  "JPY",
  "INR",
];
