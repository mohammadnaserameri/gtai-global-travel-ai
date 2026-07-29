import type { IsoDate } from "./date-types";
import { parseIsoDate } from "./date-utils";

/**
 * Locale-aware date presentation.
 *
 * Every formatter runs on a UTC-constructed instant with `timeZone: "UTC"`.
 * Pairing those two guarantees the rendered day equals the ISO day for every
 * user, regardless of their offset — the same timezone rule as `date-utils`.
 */

/**
 * Maps a GTAI locale to the BCP-47 tag used for formatting.
 *
 * Persian and Arabic are explicitly pinned to the **Gregorian** calendar: the
 * grid GTAI renders is Gregorian, so labelling it with Persian-calendar month
 * names would misdescribe the dates being selected.
 */
const FORMATTING_LOCALES: Readonly<Record<string, string>> = {
  en: "en-CA",
  fr: "fr-CA",
  fa: "fa-IR-u-ca-gregory",
  ar: "ar-u-ca-gregory",
};

export function formattingLocale(locale: string): string {
  const base = locale.split("-")[0];
  return FORMATTING_LOCALES[locale] ?? FORMATTING_LOCALES[base] ?? locale;
}

/**
 * First day of the week per locale: 0 = Sunday … 6 = Saturday.
 *
 * Deliberately explicit rather than derived — `Intl.Locale.weekInfo` is not
 * available everywhere, and a wrong week start silently misaligns every date
 * in the grid.
 */
const WEEK_START: Readonly<Record<string, number>> = {
  en: 0, // Sunday
  fr: 1, // Monday
  fa: 6, // Saturday
  ar: 6, // Saturday
};

export function weekStartFor(locale: string): number {
  const base = locale.split("-")[0];
  return WEEK_START[locale] ?? WEEK_START[base] ?? 0;
}

/** A UTC instant positioned exactly on the ISO calendar date. */
function utcInstant(iso: IsoDate): Date {
  const parts = parseIsoDate(iso);
  if (!parts) throw new RangeError(`Invalid ISO date: ${iso}`);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function formatter(
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(formattingLocale(locale), {
    ...options,
    timeZone: "UTC",
  });
}

/** Compact field value, e.g. "Tue, Sep 15" / "mar. 15 sept.". */
export function formatFieldDate(iso: IsoDate, locale: string): string {
  return formatter(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(utcInstant(iso));
}

/** Full spoken form for accessible names, e.g. "Tuesday 15 September 2026". */
export function formatFullDate(iso: IsoDate, locale: string): string {
  return formatter(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(utcInstant(iso));
}

/** Month heading, e.g. "September 2026" / "سپتامبر ۲۰۲۶". */
export function formatMonthHeading(iso: IsoDate, locale: string): string {
  return formatter(locale, { year: "numeric", month: "long" }).format(
    utcInstant(iso),
  );
}

/** The day number as the locale writes it (Persian and Arabic digits). */
export function formatDayNumber(iso: IsoDate, locale: string): string {
  return formatter(locale, { day: "numeric" }).format(utcInstant(iso));
}

/**
 * Weekday column headings in the locale's week order.
 *
 * Built from a known reference week (2024-01-07 was a Sunday) so the labels
 * always line up with the numeric weekday indices used by the grid.
 */
export function weekdayLabels(
  weekdayOrder: readonly number[],
  locale: string,
  width: "short" | "narrow" = "short",
): readonly {
  readonly index: number;
  readonly short: string;
  readonly long: string;
}[] {
  const shortFormat = formatter(locale, { weekday: width });
  const longFormat = formatter(locale, { weekday: "long" });

  return weekdayOrder.map((index) => {
    // 2024-01-07 is a Sunday, so adding the index lands on that weekday.
    const reference = new Date(Date.UTC(2024, 0, 7 + index));
    return {
      index,
      short: shortFormat.format(reference),
      long: longFormat.format(reference),
    };
  });
}
