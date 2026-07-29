"use client";

import { useRef, useState } from "react";

import type {
  DateSelection,
  DateSelectionStage,
  FlexibilityDays,
  IsoDate,
} from "@/features/dates/date-types";
import { EMPTY_DATE_SELECTION } from "@/features/dates/date-types";
import {
  addDays,
  clampToBounds,
  createDateBounds,
  isAfter,
  startOfMonth,
  todayIso,
} from "@/features/dates/date-utils";
import { formatFieldDate, formatFullDate } from "@/features/dates/date-formatting";
import { useMediaQuery } from "@/lib/utilities/use-media-query";
import { useDismissable } from "@/lib/accessibility/use-dismissable";
import { cn } from "@/lib/utilities/cn";
import { CalendarIcon } from "@/components/ui/icons";
import {
  DatePickerPanel,
  type DatePickerPanelLabels,
} from "@/components/search/date-picker/DatePickerPanel";

export interface DatePickerLabels extends DatePickerPanelLabels {
  readonly departureLabel: string;
  readonly returnLabel: string;
  readonly addDate: string;
  readonly datesSelected: string;
  readonly changesCancelled: string;
  readonly returnAfterDeparture: string;
}

interface DatePickerProps {
  idPrefix: string;
  locale: string;
  roundTrip: boolean;
  /** One-way hides Return entirely — not merely disabled. */
  showReturn: boolean;
  value: DateSelection;
  onChange: (next: DateSelection) => void;
  labels: DatePickerLabels;
  departureError?: string;
  returnError?: string;
  className?: string;
}

/**
 * Departure and Return fields sharing one calendar.
 *
 * Commit semantics differ by surface, deliberately:
 *
 * - **Desktop** commits immediately. Selecting a departure keeps the popover
 *   open and advances the stage to return; selecting a return closes it. Only
 *   departure survives if the user closes early — a return is never invented.
 * - **Mobile** edits a draft and commits on Apply, so Cancel can restore the
 *   previously committed dates exactly.
 *
 * A departure that invalidates an existing return never rewrites or silently
 * drops it: the value is preserved, the conflict is surfaced by the form, and
 * the calendar moves to return-selection so the user resolves it themselves.
 */
export function DatePicker({
  idPrefix,
  locale,
  roundTrip,
  showReturn,
  value,
  onChange,
  labels,
  departureError,
  returnError,
  className,
}: DatePickerProps) {
  const today = todayIso();
  const bounds = createDateBounds(today);

  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<DateSelectionStage>("departure");
  const [draft, setDraft] = useState<DateSelection>(value);
  const [visibleMonth, setVisibleMonth] = useState<IsoDate>(
    startOfMonth(value.departure ?? today),
  );
  const [focusedDate, setFocusedDate] = useState<IsoDate>(
    clampToBounds(value.departure ?? today, bounds),
  );
  const [announcement, setAnnouncement] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const departureRef = useRef<HTMLButtonElement>(null);
  const returnRef = useRef<HTMLButtonElement>(null);

  const isDesktop = useMediaQuery("(min-width: 768px)", true);
  const twoMonths = useMediaQuery("(min-width: 1024px)", true);

  /** Desktop writes through to the form; mobile edits a draft first. */
  const active = isDesktop ? value : draft;

  // Plain function: the React compiler memoizes it, and a manual useCallback
  // here defeats that rather than helping.
  function close() {
    setOpen(false);
  }

  useDismissable(open && isDesktop, containerRef, close);

  function openAt(nextStage: DateSelectionStage) {
    // Opening Return without a Departure is redirected rather than refused:
    // a standalone return is never a valid search.
    const effectiveStage: DateSelectionStage =
      nextStage === "return" && value.departure === null ? "departure" : nextStage;

    const anchor =
      effectiveStage === "return"
        ? (value.returnDate ?? value.departure ?? today)
        : (value.departure ?? today);

    setDraft(value);
    setStage(effectiveStage);
    setVisibleMonth(startOfMonth(clampToBounds(anchor, bounds)));
    setFocusedDate(clampToBounds(anchor, bounds));
    setAnnouncement(
      effectiveStage === "return"
        ? labels.chooseReturn
        : nextStage === "return"
          ? labels.departureFirst
          : labels.chooseDeparture,
    );
    setOpen(true);
  }

  function commit(next: DateSelection) {
    if (isDesktop) onChange(next);
    else setDraft(next);
  }

  function handleSelect(iso: IsoDate) {
    const current = active;

    if (stage === "departure") {
      const keepsReturn =
        current.returnDate !== null && isAfter(current.returnDate, iso);

      const next: DateSelection = {
        ...current,
        departure: iso,
        // The existing return is preserved even when it conflicts — the form
        // reports the conflict and the user resolves it.
        returnDate: current.returnDate,
      };
      commit(next);

      if (roundTrip) {
        setStage("return");
        setFocusedDate(clampToBounds(addDays(iso, 1), bounds));
        setAnnouncement(
          keepsReturn || current.returnDate === null
            ? labels.chooseReturn
            : `${labels.returnAfterDeparture} ${labels.chooseReturn}`,
        );
        return;
      }

      setAnnouncement(formatFullDate(iso, locale));
      if (isDesktop) {
        close();
        departureRef.current?.focus();
      }
      return;
    }

    // Return stage.
    const departure = current.departure;
    if (departure === null || !isAfter(iso, departure)) return;

    commit({ ...current, returnDate: iso });
    setAnnouncement(labels.datesSelected);

    if (isDesktop) {
      close();
      returnRef.current?.focus();
    }
  }

  function handleClear() {
    commit({ ...EMPTY_DATE_SELECTION });
    setStage("departure");
    setFocusedDate(clampToBounds(today, bounds));
    setVisibleMonth(startOfMonth(today));
    setAnnouncement(labels.chooseDeparture);
  }

  function handleFlexibility(days: FlexibilityDays) {
    commit({ ...active, flexibilityDays: days });
  }

  function handleCancel() {
    setDraft(value);
    setAnnouncement(labels.changesCancelled);
    close();
    (stage === "return" ? returnRef : departureRef).current?.focus();
  }

  function handleApply() {
    onChange(draft);
    setAnnouncement(labels.datesSelected);
    close();
    (stage === "return" ? returnRef : departureRef).current?.focus();
  }

  const canApply = roundTrip
    ? draft.departure !== null &&
      draft.returnDate !== null &&
      isAfter(draft.returnDate, draft.departure)
    : draft.departure !== null;

  const panelId = `${idPrefix}-calendar`;

  return (
    <div ref={containerRef} className={cn("relative flex gap-2", className)}>
      <DateField
        ref={departureRef}
        id={`${idPrefix}-departure`}
        label={labels.departureLabel}
        value={value.departure}
        locale={locale}
        addDate={labels.addDate}
        expanded={open && stage === "departure"}
        panelId={panelId}
        error={departureError}
        onOpen={() => openAt("departure")}
      />

      {showReturn ? (
        <DateField
          ref={returnRef}
          id={`${idPrefix}-return`}
          label={labels.returnLabel}
          value={value.returnDate}
          locale={locale}
          addDate={labels.addDate}
          expanded={open && stage === "return"}
          panelId={panelId}
          error={returnError}
          onOpen={() => openAt("return")}
        />
      ) : null}

      {open ? (
        <DatePickerPanel
          variant={isDesktop ? "popover" : "sheet"}
          labels={labels}
          locale={locale}
          bounds={bounds}
          stage={stage}
          roundTrip={roundTrip}
          departure={active.departure}
          returnDate={active.returnDate}
          flexibilityDays={active.flexibilityDays}
          visibleMonth={visibleMonth}
          focusedDate={focusedDate}
          twoMonths={isDesktop && twoMonths}
          canApply={canApply}
          onVisibleMonthChange={setVisibleMonth}
          onFocusedDateChange={setFocusedDate}
          onSelect={handleSelect}
          onFlexibilityChange={handleFlexibility}
          onClear={handleClear}
          onClose={() => {
            close();
            (stage === "return" ? returnRef : departureRef).current?.focus();
          }}
          onCancel={handleCancel}
          onApply={handleApply}
          announcement={announcement}
          fieldName={idPrefix}
        />
      ) : null}
    </div>
  );
}

interface DateFieldProps {
  id: string;
  label: string;
  value: IsoDate | null;
  locale: string;
  addDate: string;
  expanded: boolean;
  panelId: string;
  error?: string;
  onOpen: () => void;
  ref?: React.Ref<HTMLButtonElement>;
}

/** One labelled date trigger. The accessible name carries the current value. */
function DateField({
  id,
  label,
  value,
  locale,
  addDate,
  expanded,
  panelId,
  error,
  onOpen,
  ref,
}: DateFieldProps) {
  const display = value ? formatFieldDate(value, locale) : addDate;
  const spoken = value ? formatFullDate(value, locale) : addDate;
  const errorId = `${id}-error`;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span
        id={`${id}-label`}
        className="text-foreground-muted text-xs font-semibold tracking-wide uppercase"
      >
        {label}
      </span>

      <button
        ref={ref}
        type="button"
        id={id}
        aria-label={`${label}: ${spoken}`}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-controls={expanded ? panelId : undefined}
        aria-describedby={error ? errorId : undefined}
        onClick={onOpen}
        className={cn(
          "flex min-h-12 items-center gap-2.5 rounded-lg border px-3.5 text-start",
          "bg-surface gtai-lift focus-visible:outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2",
          error
            ? "border-danger"
            : "border-border hover:border-border-strong focus-within:border-brand-400",
        )}
      >
        <span aria-hidden="true" className="text-brand-600 shrink-0">
          <CalendarIcon size={18} />
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            value ? "text-foreground" : "text-foreground-muted/80",
          )}
        >
          {display}
        </span>
      </button>

      {error ? (
        <p id={errorId} className="text-danger flex items-start gap-1 text-xs">
          <span aria-hidden="true">•</span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
