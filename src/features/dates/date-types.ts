/**
 * GTAI date model.
 *
 * A travel date is a **calendar date**, not an instant. The canonical value is
 * therefore an ISO local-date string (`YYYY-MM-DD`) with no time, no offset and
 * no timezone — see `date-utils.ts` for why that matters.
 */

/** `YYYY-MM-DD`. The canonical form of every date in the search form. */
export type IsoDate = string;

/** Calendar components of an ISO date. `month` is 1-based. */
export interface DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** Which endpoint the calendar is currently collecting. */
export type DateSelectionStage = "departure" | "return";

/** How far around the anchor dates a future provider search may look. */
export type FlexibilityDays = 0 | 1 | 2 | 3;

export const FLEXIBILITY_OPTIONS: readonly FlexibilityDays[] = [0, 1, 2, 3];

/** The date portion of the search intent. */
export interface DateSelection {
  readonly departure: IsoDate | null;
  readonly returnDate: IsoDate | null;
  readonly flexibilityDays: FlexibilityDays;
}

export const EMPTY_DATE_SELECTION: DateSelection = {
  departure: null,
  returnDate: null,
  flexibilityDays: 0,
};

/** Everything the day grid needs to render and describe one cell. */
export interface CalendarDay {
  readonly iso: IsoDate;
  readonly day: number;
  /** False for leading/trailing cells belonging to an adjacent month. */
  readonly inCurrentMonth: boolean;
  readonly isToday: boolean;
  readonly isDisabled: boolean;
  readonly isRangeStart: boolean;
  readonly isRangeEnd: boolean;
  /** Strictly between the endpoints. */
  readonly isInRange: boolean;
}

/** One rendered month: its heading anchor and its grid. */
export interface CalendarMonthModel {
  /** First day of the month, as an ISO date. */
  readonly monthStart: IsoDate;
  /** Weekday column order, 0 = Sunday … 6 = Saturday. */
  readonly weekdayOrder: readonly number[];
  /** Rows of seven cells. */
  readonly weeks: readonly (readonly CalendarDay[])[];
}

/** The selectable window. A single policy source for the whole feature. */
export interface DateBounds {
  readonly min: IsoDate;
  readonly max: IsoDate;
}
