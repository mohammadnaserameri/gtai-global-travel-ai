"use client";

import { useId } from "react";

import type { CalendarMonthModel, IsoDate } from "@/features/dates/date-types";
import {
  formatDayNumber,
  formatFullDate,
  formatMonthHeading,
  weekdayLabels,
} from "@/features/dates/date-formatting";
import { CalendarDay } from "@/components/search/date-picker/CalendarDay";

export interface CalendarDayLabels {
  readonly today: string;
  readonly selectedDeparture: string;
  readonly selectedReturn: string;
  readonly unavailable: string;
}

interface CalendarMonthProps {
  model: CalendarMonthModel;
  locale: string;
  labels: CalendarDayLabels;
  focusedDate: IsoDate;
  onSelect: (iso: IsoDate) => void;
  onFocusDay: (iso: IsoDate) => void;
  registerDay: (iso: IsoDate, node: HTMLButtonElement | null) => void;
}

/**
 * One month grid.
 *
 * Rendered as a real `<table role="grid">` so rows and cells carry their
 * semantics natively; the day buttons handle roving tabindex. The month
 * heading labels the grid, which is what lets a screen reader announce the
 * visible month when focus enters.
 */
export function CalendarMonth({
  model,
  locale,
  labels,
  focusedDate,
  onSelect,
  onFocusDay,
  registerDay,
}: CalendarMonthProps) {
  const headingId = useId().replace(/:/g, "");
  const heading = formatMonthHeading(model.monthStart, locale);
  const weekdays = weekdayLabels(model.weekdayOrder, locale);

  /** Builds the spoken name for one day: date, then every state that applies. */
  function dayLabel(iso: IsoDate, isToday: boolean, states: string[]): string {
    const parts = [formatFullDate(iso, locale)];
    if (isToday) parts.push(labels.today);
    parts.push(...states);
    return parts.join(", ");
  }

  return (
    <div className="min-w-0 flex-1">
      <h3
        id={headingId}
        className="text-foreground mb-2 text-center text-sm font-semibold"
      >
        {heading}
      </h3>

      <table
        role="grid"
        aria-labelledby={headingId}
        className="w-full table-fixed border-collapse"
      >
        <thead>
          <tr>
            {weekdays.map((weekday) => (
              <th
                key={weekday.index}
                scope="col"
                abbr={weekday.long}
                className="text-foreground-muted pb-1 text-center text-[0.6875rem] font-medium"
              >
                <span aria-hidden="true">{weekday.short}</span>
                <span className="sr-only">{weekday.long}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.weeks.map((week, weekIndex) => (
            <tr key={`${model.monthStart}-w${weekIndex}`}>
              {week.map((day) => {
                const states: string[] = [];
                if (day.isRangeStart) states.push(labels.selectedDeparture);
                if (day.isRangeEnd) states.push(labels.selectedReturn);
                if (day.isDisabled) states.push(labels.unavailable);

                return (
                  <CalendarDay
                    key={day.iso}
                    day={day}
                    dayNumber={
                      day.inCurrentMonth ? formatDayNumber(day.iso, locale) : ""
                    }
                    label={
                      day.inCurrentMonth
                        ? dayLabel(day.iso, day.isToday, states)
                        : ""
                    }
                    focused={day.inCurrentMonth && day.iso === focusedDate}
                    onSelect={onSelect}
                    onFocusDay={onFocusDay}
                    registerRef={(node) => registerDay(day.iso, node)}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
