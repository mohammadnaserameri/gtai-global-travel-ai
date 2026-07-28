import { getCurrency } from "@/config/currencies";

/**
 * Currency presentation helpers.
 *
 * GTAI performs **no FX conversion** in V1 — there are no real travel prices
 * to convert. These helpers only describe how an amount would be written once
 * provider prices exist, using the visitor's chosen display currency.
 */

/** `"C$"`, `"€"`, `"AED"` … for inline labels and selector chips. */
export function currencySymbol(code: string): string {
  return getCurrency(code).symbol;
}

/** `"CAD — Canadian Dollar"`, used in selectors and accessible labels. */
export function currencyLabel(code: string): string {
  const currency = getCurrency(code);
  return `${currency.code} — ${currency.name}`;
}

/**
 * Formats an amount for display.
 *
 * The value is assumed to already be expressed in `currencyCode`; nothing is
 * converted. Falls back to a plain, readable string if the runtime cannot
 * format the locale/currency pair.
 */
export function formatAmount(
  amount: number,
  currencyCode: string,
  locale: string,
): string {
  const currency = getCurrency(currencyCode);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.code,
      minimumFractionDigits: currency.decimalDigits,
      maximumFractionDigits: currency.decimalDigits,
    }).format(amount);
  } catch {
    return `${currency.symbol}${amount.toFixed(currency.decimalDigits)}`;
  }
}
