"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

import type {
  DateBounds,
  DateSelectionStage,
  FlexibilityDays,
  IsoDate,
} from "@/features/dates/date-types";
import {
  addDays,
  addMonths,
  clampToBounds,
  isWithinBounds,
  startOfMonth,
} from "@/features/dates/date-utils";
import {
  buildCalendarMonth,
  isMonthNavigable,
} from "@/features/dates/calendar-grid";
import { weekStartFor } from "@/features/dates/date-formatting";
import { cn } from "@/lib/utilities/cn";
import { useFocusTrap } from "@/lib/accessibility/use-focus-trap";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { CloseIcon } from "@/components/ui/icons";
import {
  CalendarMonth,
  type CalendarDayLabels,
} from "@/components/search/date-picker/CalendarMonth";
import {
  FlexibleDateControl,
  type FlexibleDateLabels,
} from "@/components/search/date-picker/FlexibleDateControl";

export interface DatePickerPanelLabels extends CalendarDayLabels {
  readonly title: string;
  readonly chooseDeparture: string;
  readonly chooseReturn: string;
  readonly departureFirst: string;
  readonly previousMonth: string;
  readonly nextMonth: string;
  readonly clearDate: string;
  readonly clearDates: string;
  readonly cancel: string;
  readonly apply: string;
  readonly close: string;
  readonly flexible: FlexibleDateLabels;
}

interface DatePickerPanelProps {
  variant: "popover" | "sheet";
  /**
   * Id of the calendar surface itself. Both date triggers point their
   * `aria-controls` here, and only one panel is ever mounted, so the reference
   * always resolves to exactly one element and never duplicates.
   */
  panelId: string;
  labels: DatePickerPanelLabels;
  locale: string;
  bounds: DateBounds;
  stage: DateSelectionStage;
  roundTrip: boolean;
  departure: IsoDate | null;
  returnDate: IsoDate | null;
  flexibilityDays: FlexibilityDays;
  visibleMonth: IsoDate;
  focusedDate: IsoDate;
  twoMonths: boolean;
  /** Sheet only — Apply is blocked until the draft is complete. */
  canApply: boolean;
  onVisibleMonthChange: (month: IsoDate) => void;
  onFocusedDateChange: (iso: IsoDate) => void;
  onSelect: (iso: IsoDate) => void;
  onFlexibilityChange: (value: FlexibilityDays) => void;
  onClear: () => void;
  onClose: () => void;
  onCancel: () => void;
  onApply: () => void;
  /** Polite announcement text for the panel's live region. */
  announcement: string;
  fieldName: string;
}

/**
 * The calendar surface.
 *
 * Desktop renders an anchored popover; mobile renders a modal sheet with
 * Cancel/Apply over draft state. Both use the same focus-trap, scroll-lock and
 * logical-positioning primitives as the Airport Selector — one modal
 * architecture, two presentations.
 *
 * Keyboard movement is **chronological in every locale**: Arrow Left is always
 * the previous day and Arrow Right the next, including in Persian and Arabic.
 * Mirroring them under RTL would make the same key mean different things
 * depending on the interface language, which is worse than the visual
 * inconsistency it would fix.
 */
export function DatePickerPanel({
  variant,
  panelId,
  labels,
  locale,
  bounds,
  stage,
  roundTrip,
  departure,
  returnDate,
  flexibilityDays,
  visibleMonth,
  focusedDate,
  twoMonths,
  canApply,
  onVisibleMonthChange,
  onFocusedDateChange,
  onSelect,
  onFlexibilityChange,
  onClear,
  onClose,
  onCancel,
  onApply,
  announcement,
  fieldName,
}: DatePickerPanelProps) {
  const isSheet = variant === "sheet";
  const sheetRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const shouldFocusDay = useRef(false);

  useFocusTrap(isSheet, sheetRef);

  useEffect(() => {
    if (!isSheet) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isSheet]);

  // Moves DOM focus only when the keyboard asked for it, never on open or on
  // an unrelated re-render.
  useEffect(() => {
    if (!shouldFocusDay.current) return;
    shouldFocusDay.current = false;
    dayRefs.current.get(focusedDate)?.focus();
  }, [focusedDate]);

  const weekStart = weekStartFor(locale);
  const minSelectable =
    stage === "return" && departure !== null ? addDays(departure, 1) : null;

  const months = twoMonths
    ? [visibleMonth, addMonths(visibleMonth, 1)]
    : [visibleMonth];

  const previousMonth = addMonths(visibleMonth, -1);
  const nextMonth = addMonths(visibleMonth, 1);
  const lastVisible = months[months.length - 1];

  const canGoPrevious = isMonthNavigable(previousMonth, bounds);
  const canGoNext = isMonthNavigable(addMonths(lastVisible, 1), bounds);

  /** Moves the focused day, pulling the visible range along when needed. */
  function moveFocus(next: IsoDate) {
    const clamped = clampToBounds(next, bounds);
    shouldFocusDay.current = true;
    onFocusedDateChange(clamped);

    const firstVisible = startOfMonth(visibleMonth);
    const lastVisibleEnd = addMonths(firstVisible, months.length);
    if (clamped < firstVisible) {
      onVisibleMonthChange(startOfMonth(clamped));
    } else if (clamped >= lastVisibleEnd) {
      onVisibleMonthChange(startOfMonth(addMonths(clamped, -(months.length - 1))));
    }
  }

  function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const key = event.key;
    let next: IsoDate | null = null;

    switch (key) {
      case "ArrowLeft":
        next = addDays(focusedDate, -1);
        break;
      case "ArrowRight":
        next = addDays(focusedDate, 1);
        break;
      case "ArrowUp":
        next = addDays(focusedDate, -7);
        break;
      case "ArrowDown":
        next = addDays(focusedDate, 7);
        break;
      case "Home":
        next = addDays(focusedDate, -weekdayOffset(focusedDate, weekStart));
        break;
      case "End":
        next = addDays(focusedDate, 6 - weekdayOffset(focusedDate, weekStart));
        break;
      case "PageUp":
        next = addMonths(focusedDate, event.shiftKey ? -12 : -1);
        break;
      case "PageDown":
        next = addMonths(focusedDate, event.shiftKey ? 12 : 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (isWithinBounds(focusedDate, bounds)) onSelect(focusedDate);
        return;
      case "Escape":
        event.preventDefault();
        onClose();
        return;
      default:
        return;
    }

    event.preventDefault();
    moveFocus(next);
  }

  const stageHint =
    stage === "departure"
      ? roundTrip && departure === null && returnDate !== null
        ? labels.departureFirst
        : labels.chooseDeparture
      : labels.chooseReturn;

  const grids = (
    <div
      onKeyDown={onGridKeyDown}
      className={cn("flex gap-6", twoMonths ? "flex-row" : "flex-col")}
    >
      {months.map((month) => (
        <CalendarMonth
          key={month}
          model={buildCalendarMonth({
            month,
            weekStart,
            bounds,
            departure,
            returnDate,
            minSelectable,
          })}
          locale={locale}
          labels={labels}
          focusedDate={focusedDate}
          onSelect={onSelect}
          onFocusDay={onFocusedDateChange}
          registerDay={(iso, node) => {
            if (node) dayRefs.current.set(iso, node);
            else dayRefs.current.delete(iso);
          }}
        />
      ))}
    </div>
  );

  const navigation = (
    <div className="mb-3 flex items-center justify-between gap-2">
      <IconButton
        label={labels.previousMonth}
        variant="outline"
        disabled={!canGoPrevious}
        onClick={() => onVisibleMonthChange(previousMonth)}
      >
        <ChevronStart />
      </IconButton>

      <p className="text-foreground-secondary min-w-0 flex-1 text-center text-xs font-medium">
        {stageHint}
      </p>

      <IconButton
        label={labels.nextMonth}
        variant="outline"
        disabled={!canGoNext}
        onClick={() => onVisibleMonthChange(nextMonth)}
      >
        <ChevronEnd />
      </IconButton>
    </div>
  );

  const footer = (
    <div className="border-border mt-4 flex flex-wrap items-end justify-between gap-3 border-t pt-4">
      <FlexibleDateControl
        labels={labels.flexible}
        value={flexibilityDays}
        onChange={onFlexibilityChange}
        name={`${fieldName}-flex`}
      />
      <Button variant="ghost" onClick={onClear}>
        {roundTrip ? labels.clearDates : labels.clearDate}
      </Button>
    </div>
  );

  const liveRegion = (
    <span role="status" aria-live="polite" className="sr-only">
      {announcement}
    </span>
  );

  if (isSheet) {
    return (
      <div className="fixed inset-0 z-[120]">
        <div
          aria-hidden="true"
          onClick={onCancel}
          className="bg-brand-950/40 absolute inset-0"
        />
        <div
          ref={sheetRef}
          id={panelId}
          role="dialog"
          aria-modal="true"
          aria-label={labels.title}
          className="bg-surface-elevated absolute inset-x-0 top-0 bottom-0 flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
        >
          <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
            <h2 className="text-foreground text-sm font-semibold">
              {labels.title}
            </h2>
            <IconButton label={labels.close} variant="ghost" onClick={onCancel}>
              <CloseIcon />
            </IconButton>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
            {navigation}
            {grids}
            {footer}
          </div>

          <div className="border-border flex items-center justify-end gap-2 border-t px-4 py-3">
            <Button variant="secondary" onClick={onCancel}>
              {labels.cancel}
            </Button>
            <Button onClick={onApply} disabled={!canApply}>
              {labels.apply}
            </Button>
          </div>

          {liveRegion}
        </div>
      </div>
    );
  }

  return (
    <div
      id={panelId}
      // Non-modal dialog: the trigger declares aria-haspopup="dialog", so the
      // surface it opens has to actually be one. It is not aria-modal, because
      // on desktop the page behind stays usable and outside click dismisses.
      role="dialog"
      aria-label={labels.title}
      className={cn(
        "border-border bg-surface-elevated absolute end-0 top-[calc(100%+0.5rem)] z-50",
        // Width follows the month count. Two months need 44rem to keep seven
        // columns per month comfortably above the 44px target; one month at
        // that width would be a mostly-empty box, and — because the popover is
        // anchored to the field rather than the page — it would also hang off
        // the viewport start edge at tablet widths.
        twoMonths
          ? "w-[min(44rem,calc(100vw-2rem))]"
          : "w-[min(26rem,calc(100vw-2rem))]",
        "max-h-[32rem] overflow-y-auto",
        "overscroll-contain rounded-xl border p-4 shadow-xl",
      )}
    >
      {navigation}
      {grids}
      {footer}
      {liveRegion}
    </div>
  );
}

/** Offset of a date within its locale week, 0 = first column. */
function weekdayOffset(iso: IsoDate, weekStart: number): number {
  const index = new Date(
    Date.UTC(
      Number(iso.slice(0, 4)),
      Number(iso.slice(5, 7)) - 1,
      Number(iso.slice(8, 10)),
    ),
  ).getUTCDay();
  return (index - weekStart + 7) % 7;
}

/** Points toward the inline start; mirrors automatically under RTL. */
function ChevronStart() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="rtl:-scale-x-100"
    >
      <path d="m14 6-6 6 6 6" />
    </svg>
  );
}

/** Points toward the inline end; mirrors automatically under RTL. */
function ChevronEnd() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="rtl:-scale-x-100"
    >
      <path d="m10 6 6 6-6 6" />
    </svg>
  );
}
