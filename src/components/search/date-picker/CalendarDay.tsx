"use client";

import type { CalendarDay as CalendarDayModel } from "@/features/dates/date-types";
import { cn } from "@/lib/utilities/cn";

interface CalendarDayProps {
  day: CalendarDayModel;
  label: string;
  dayNumber: string;
  /** Only one cell in the whole panel carries tabIndex 0. */
  focused: boolean;
  onSelect: (iso: string) => void;
  onFocusDay: (iso: string) => void;
  registerRef: (node: HTMLButtonElement | null) => void;
}

/**
 * One day cell.
 *
 * The **interactive target is the full 44px cell**; the visible circle inside
 * it stays at 40px so the grid does not look inflated. Splitting the two means
 * the touch target meets the minimum without the selected-day styling growing
 * with it. The parent table is `table-fixed`, so all seven columns are equal
 * and no two targets can overlap.
 *
 * Unavailable days use `aria-disabled` rather than the `disabled` attribute so
 * they stay focusable: a grid where arrow keys silently skip over cells loses
 * the roving-tabindex anchor and strands focus. They simply refuse selection.
 *
 * Selection state is never carried by colour alone — `aria-selected` plus the
 * accessible label ("selected as departure") always say it in words.
 */
export function CalendarDay({
  day,
  label,
  dayNumber,
  focused,
  onSelect,
  onFocusDay,
  registerRef,
}: CalendarDayProps) {
  if (!day.inCurrentMonth) {
    // Alignment padding: no date, no semantics, not focusable.
    return <td aria-hidden="true" className="p-0" />;
  }

  const isEndpoint = day.isRangeStart || day.isRangeEnd;

  return (
    <td
      role="gridcell"
      aria-selected={isEndpoint}
      className={cn(
        "p-0 text-center",
        // Range fill sits on the cell so it reaches the column edges and reads
        // as one continuous band across the week.
        day.isInRange && "bg-brand-50",
        day.isRangeStart && !day.isRangeEnd && "bg-brand-50 rounded-s-lg",
        day.isRangeEnd && !day.isRangeStart && "bg-brand-50 rounded-e-lg",
      )}
    >
      <button
        ref={registerRef}
        type="button"
        tabIndex={focused ? 0 : -1}
        aria-disabled={day.isDisabled || undefined}
        aria-label={label}
        aria-current={day.isToday ? "date" : undefined}
        onClick={() => {
          if (!day.isDisabled) onSelect(day.iso);
        }}
        onFocus={() => onFocusDay(day.iso)}
        className={cn(
          // 44px minimum target, full column width, never narrower.
          "flex h-11 w-full min-w-11 items-center justify-center rounded-lg",
          // Standard GTAI focus ring. The panel's padding is wider than the
          // ring's reach, so it is never clipped at the calendar edge.
          "focus-visible:outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2",
          day.isDisabled && "cursor-not-allowed",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex size-10 items-center justify-center rounded-lg text-sm",
            // The departure day is disabled during the return stage but is
            // still a selected endpoint. Endpoint styling has to win, or its
            // number renders muted on the dark endpoint fill and disappears.
            day.isDisabled && !isEndpoint && "text-foreground-muted/45",
            !day.isDisabled && !isEndpoint && "hover:bg-brand-100 text-foreground",
            isEndpoint &&
              "bg-brand-800 text-brand-on-action shadow-brand font-semibold",
            day.isToday && !isEndpoint && "ring-brand-400 font-semibold ring-1",
          )}
        >
          <span className="gtai-ltr-numerals">{dayNumber}</span>
        </span>
      </button>
    </td>
  );
}
