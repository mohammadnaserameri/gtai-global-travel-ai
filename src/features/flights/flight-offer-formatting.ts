import { formatAmount } from "../../lib/currency/format";
import { formatFieldDate, formattingLocale } from "../dates/date-formatting";
import type { CurrencyCode } from "../../config/currencies";
import type { AircraftType, LocalDateTime } from "./flight-offer-types";

/** Fills `{token}` placeholders in a localized template string. */
export function formatTemplate(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export type TemplateSegment =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "token"; readonly key: string };

/**
 * Splits a `"{token}"` template into ordered text/token segments instead of
 * one opaque interpolated string. A localized sentence that embeds a
 * mixed-direction value (a code, a fictional identifier, a number) needs each
 * token rendered through its own bidi isolate — `formatTemplate`'s flat
 * string result can't be split back apart safely once punctuation and RTL
 * text are already interleaved, so callers that need per-token isolation
 * start from this instead.
 */
export function splitTemplateSegments(template: string): TemplateSegment[] {
  const segments: TemplateSegment[] = [];
  const pattern = /\{(\w+)\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(template)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        kind: "text",
        value: template.slice(lastIndex, match.index),
      });
    }
    segments.push({ kind: "token", key: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < template.length) {
    segments.push({ kind: "text", value: template.slice(lastIndex) });
  }
  return segments;
}

/**
 * The one shared entry point for turning a dynamic count into locale-correct
 * digits (Persian and Arabic numerals for `fa`/`ar`). Never used on an IATA
 * code or a fictional flight identifier — those stay LTR ASCII everywhere.
 */
export function formatLocaleNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(formattingLocale(locale)).format(value);
}

export interface DurationUnitLabels {
  readonly hour: string;
  readonly minute: string;
}

/** `"7h 45m"` (or the locale's own hour/minute words) — never rounds to a false precision. */
export function formatDurationMinutes(
  totalMinutes: number,
  locale: string,
  labels: DurationUnitLabels,
): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const h = formatLocaleNumber(hours, locale);
  const m = formatLocaleNumber(minutes, locale);
  if (hours === 0) return `${m}${labels.minute}`;
  if (minutes === 0) return `${h}${labels.hour}`;
  return `${h}${labels.hour} ${m}${labels.minute}`;
}

export interface StopLabels {
  readonly direct: string;
  /** `{count}` template used for two or more stops. */
  readonly nStops: string;
  readonly oneStop: string;
}

/** "Direct" / "1 stop" / "N stops" — never colour-only, always this text. */
export function formatStopCount(
  count: number,
  locale: string,
  labels: StopLabels,
): string {
  if (count === 0) return labels.direct;
  if (count === 1) return labels.oneStop;
  return formatTemplate(labels.nStops, {
    count: formatLocaleNumber(count, locale),
  });
}

export interface ResultCountLabels {
  readonly one: string;
  /** `{count}` template used for zero or two-or-more results. */
  readonly other: string;
}

export function formatResultCount(
  count: number,
  locale: string,
  labels: ResultCountLabels,
): string {
  return count === 1
    ? labels.one
    : formatTemplate(labels.other, { count: formatLocaleNumber(count, locale) });
}

/** The demonstration total, always carrying its currency — never a bare number. */
export function formatOfferPrice(
  amount: number,
  currency: CurrencyCode,
  locale: string,
): string {
  return formatAmount(amount, currency, locale);
}

/**
 * `"Sep 15"` style short date, reusing the exact same locale/calendar
 * architecture the Date Picker uses (`formattingLocale`) — Persian and
 * Arabic Results stay Gregorian, matching the calendar the dates were chosen
 * on, rather than drifting to the Persian calendar under a bare `fa` tag.
 */
export function formatLocalDate(local: LocalDateTime, locale: string): string {
  return formatFieldDate(local.date, locale);
}

export interface DayOffsetLabels {
  readonly plusOne: string;
  /** `{count}` template for +2 or more days. */
  readonly plusN: string;
  readonly minusOne: string;
  /** `{count}` template for -2 or more days. */
  readonly minusN: string;
}

/** Whole calendar-day difference between two local dates — may be negative (date-line travel). */
function daysBetweenIso(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}

/**
 * A signed, localized day-offset indicator ("+1 day", "-1 day", …), or `null`
 * on the same local calendar day. Computed from the two *local* dates, so it
 * reflects what a traveller would actually see on each airport's clock —
 * never a hardcoded "is it the next day" boolean.
 */
export function formatDayOffset(
  reference: LocalDateTime,
  target: LocalDateTime,
  locale: string,
  labels: DayOffsetLabels,
): string | null {
  const offset = daysBetweenIso(reference.date, target.date);
  if (offset === 0) return null;
  if (offset === 1) return labels.plusOne;
  if (offset === -1) return labels.minusOne;
  if (offset > 1) {
    return formatTemplate(labels.plusN, {
      count: formatLocaleNumber(offset, locale),
    });
  }
  return formatTemplate(labels.minusN, {
    count: formatLocaleNumber(-offset, locale),
  });
}

export interface AircraftLabels {
  readonly widebody: string;
  readonly narrowbody: string;
  readonly regionalJet: string;
}

/** Maps the fictional aircraft category enum onto its localized label. */
export function aircraftLabel(type: AircraftType, labels: AircraftLabels): string {
  return labels[type];
}
