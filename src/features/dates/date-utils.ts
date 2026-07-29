import type { DateBounds, DateParts, IsoDate } from "./date-types";

/**
 * Pure calendar-date arithmetic.
 *
 * **Timezone safety is the whole point of this module.** A travel date is a
 * calendar date, so it must never pass through a UTC instant conversion that
 * could move it a day. Three rules enforce that:
 *
 * 1. `new Date("2026-09-15")` is never used — the spec parses a bare date
 *    string as **UTC midnight**, which renders as the previous day for anyone
 *    west of Greenwich.
 * 2. All arithmetic runs on `Date.UTC(...)` millisecond values read back with
 *    `getUTC*`. UTC has no DST, so adding a day is always exactly 86 400 000 ms
 *    and never lands on 23:00 or 01:00 of the wrong date.
 * 3. Only `todayIso()` touches local time, and it reads local calendar
 *    *components* rather than converting an instant.
 */

const MS_PER_DAY = 86_400_000;
const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Zero-pads to two digits without locale-sensitive number formatting. */
function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** `{ year, month, day }` → `YYYY-MM-DD`. */
export function formatIsoDate(parts: DateParts): IsoDate {
  return `${String(parts.year).padStart(4, "0")}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

/**
 * Parses `YYYY-MM-DD`, returning `null` for anything malformed or for a date
 * that does not exist (e.g. `2026-02-30`).
 */
export function parseIsoDate(value: string): DateParts | null {
  const match = ISO_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;

  return { year, month, day };
}

/** True when the string is a well-formed, existing calendar date. */
export function isValidIsoDate(value: string | null | undefined): value is IsoDate {
  return typeof value === "string" && parseIsoDate(value) !== null;
}

/** Days in a month, handling leap years. `month` is 1-based. */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Internal: ISO date → UTC epoch milliseconds. Throws on invalid input. */
function toUtcMs(iso: IsoDate): number {
  const parts = parseIsoDate(iso);
  if (!parts) throw new RangeError(`Invalid ISO date: ${iso}`);
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

/** Internal: UTC epoch milliseconds → ISO date. */
function fromUtcMs(ms: number): IsoDate {
  const date = new Date(ms);
  return formatIsoDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

/**
 * Today's date in the **browser's local calendar**.
 *
 * Reads local components rather than converting an instant, so a user at
 * 23:30 in Toronto gets today's date, not tomorrow's UTC date.
 */
export function todayIso(now: Date = new Date()): IsoDate {
  return formatIsoDate({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  });
}

/** Shifts by whole days. Safe across month, year and DST boundaries. */
export function addDays(iso: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(iso) + days * MS_PER_DAY);
}

/**
 * Shifts by whole months, clamping the day to the target month's length so
 * that 31 January + 1 month is 28/29 February rather than overflowing.
 */
export function addMonths(iso: IsoDate, months: number): IsoDate {
  const parts = parseIsoDate(iso);
  if (!parts) throw new RangeError(`Invalid ISO date: ${iso}`);

  const zeroBased = parts.year * 12 + (parts.month - 1) + months;
  const year = Math.floor(zeroBased / 12);
  const month = (zeroBased % 12) + 1;

  return formatIsoDate({
    year,
    month,
    day: Math.min(parts.day, daysInMonth(year, month)),
  });
}

/** Negative when `a` is earlier, positive when later, `0` when equal. */
export function compareIso(a: IsoDate, b: IsoDate): number {
  // ISO dates are fixed-width and zero-padded, so lexical order is
  // chronological order — no parsing required.
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isBefore(a: IsoDate, b: IsoDate): boolean {
  return compareIso(a, b) < 0;
}

export function isAfter(a: IsoDate, b: IsoDate): boolean {
  return compareIso(a, b) > 0;
}

export function isSameDate(a: IsoDate, b: IsoDate): boolean {
  return compareIso(a, b) === 0;
}

/** First day of the month containing `iso`. */
export function startOfMonth(iso: IsoDate): IsoDate {
  const parts = parseIsoDate(iso);
  if (!parts) throw new RangeError(`Invalid ISO date: ${iso}`);
  return formatIsoDate({ ...parts, day: 1 });
}

/** Last day of the month containing `iso`. */
export function endOfMonth(iso: IsoDate): IsoDate {
  const parts = parseIsoDate(iso);
  if (!parts) throw new RangeError(`Invalid ISO date: ${iso}`);
  return formatIsoDate({
    ...parts,
    day: daysInMonth(parts.year, parts.month),
  });
}

/** Day of week, `0` = Sunday … `6` = Saturday. Timezone-independent. */
export function weekdayIndex(iso: IsoDate): number {
  return new Date(toUtcMs(iso)).getUTCDay();
}

/** Inclusive bounds check. */
export function isWithinBounds(iso: IsoDate, bounds: DateBounds): boolean {
  return !isBefore(iso, bounds.min) && !isAfter(iso, bounds.max);
}

/** True when `iso` lies strictly between `start` and `end`. */
export function isBetween(iso: IsoDate, start: IsoDate, end: IsoDate): boolean {
  return isAfter(iso, start) && isBefore(iso, end);
}

/**
 * The single policy source for the selectable window: from today until twelve
 * calendar months ahead.
 */
export function createDateBounds(today: IsoDate = todayIso()): DateBounds {
  return { min: today, max: addMonths(today, 12) };
}

/** Clamps a date into the bounds, used when opening the calendar. */
export function clampToBounds(iso: IsoDate, bounds: DateBounds): IsoDate {
  if (isBefore(iso, bounds.min)) return bounds.min;
  if (isAfter(iso, bounds.max)) return bounds.max;
  return iso;
}
