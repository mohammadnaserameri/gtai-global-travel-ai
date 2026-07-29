import type {
  CalendarDay,
  CalendarMonthModel,
  DateBounds,
  IsoDate,
} from "./date-types";
import {
  addDays,
  daysInMonth,
  endOfMonth,
  isBetween,
  isSameDate,
  isWithinBounds,
  parseIsoDate,
  startOfMonth,
  todayIso,
  weekdayIndex,
} from "./date-utils";

/** Weekday column order for a locale's first day, e.g. Saturday → [6,0,1,…]. */
export function weekdayOrderFor(weekStart: number): readonly number[] {
  return Array.from({ length: 7 }, (_, offset) => (weekStart + offset) % 7);
}

/** How many blank leading cells a month needs before its first day. */
export function leadingOffset(monthStart: IsoDate, weekStart: number): number {
  return (weekdayIndex(monthStart) - weekStart + 7) % 7;
}

interface BuildMonthOptions {
  /** Any date inside the month to render. */
  readonly month: IsoDate;
  readonly weekStart: number;
  readonly bounds: DateBounds;
  readonly departure: IsoDate | null;
  readonly returnDate: IsoDate | null;
  /** Earliest selectable date for the active stage, e.g. day after departure. */
  readonly minSelectable?: IsoDate | null;
  readonly today?: IsoDate;
}

/**
 * Builds one month's grid.
 *
 * Leading and trailing cells are rendered as **blank padding**, not as days
 * from the adjacent month. That is a deliberate choice: in a two-month view,
 * showing real adjacent-month days would put the same date on screen twice and
 * give it two focusable cells, which breaks both the roving-tabindex model and
 * the "no duplicate selectable dates" rule.
 */
export function buildCalendarMonth(options: BuildMonthOptions): CalendarMonthModel {
  const {
    month,
    weekStart,
    bounds,
    departure,
    returnDate,
    minSelectable = null,
    today = todayIso(),
  } = options;

  const parts = parseIsoDate(month);
  if (!parts) throw new RangeError(`Invalid ISO date: ${month}`);

  const monthStart = startOfMonth(month);
  const total = daysInMonth(parts.year, parts.month);
  const offset = leadingOffset(monthStart, weekStart);
  const weekdayOrder = weekdayOrderFor(weekStart);

  const cells: CalendarDay[] = [];

  // Leading padding — placeholders that belong to no month.
  for (let index = 0; index < offset; index += 1) {
    cells.push(placeholderDay(`${monthStart}-lead-${index}`));
  }

  for (let day = 0; day < total; day += 1) {
    const iso = addDays(monthStart, day);
    const beforeStageMinimum =
      minSelectable !== null && !isSameDate(iso, minSelectable)
        ? iso < minSelectable
        : false;

    cells.push({
      iso,
      day: day + 1,
      inCurrentMonth: true,
      isToday: isSameDate(iso, today),
      isDisabled: !isWithinBounds(iso, bounds) || beforeStageMinimum,
      isRangeStart: departure !== null && isSameDate(iso, departure),
      isRangeEnd: returnDate !== null && isSameDate(iso, returnDate),
      isInRange:
        departure !== null &&
        returnDate !== null &&
        isBetween(iso, departure, returnDate),
    });
  }

  // Trailing padding to complete the final week row.
  while (cells.length % 7 !== 0) {
    cells.push(placeholderDay(`${monthStart}-trail-${cells.length}`));
  }

  const weeks: CalendarDay[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  return { monthStart, weekdayOrder, weeks };
}

/** A non-date cell used purely to align the grid. */
function placeholderDay(key: string): CalendarDay {
  return {
    iso: key,
    day: 0,
    inCurrentMonth: false,
    isToday: false,
    isDisabled: true,
    isRangeStart: false,
    isRangeEnd: false,
    isInRange: false,
  };
}

/** True when the whole month lies outside the selectable window. */
export function isMonthNavigable(month: IsoDate, bounds: DateBounds): boolean {
  return !(endOfMonth(month) < bounds.min || startOfMonth(month) > bounds.max);
}
