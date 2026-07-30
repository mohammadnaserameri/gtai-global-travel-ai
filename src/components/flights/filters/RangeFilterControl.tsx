"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utilities/cn";

interface RangeFilterControlProps {
  legend: string;
  min: number;
  max: number;
  step: number;
  /** The committed value — `max` represents "no restriction" (the default, omitted-from-URL state). */
  value: number;
  /** Fires at most once per settled value — never once per intermediate tick, and never twice for the same value. */
  onCommit: (value: number) => void;
  /** `"Up to CAD 850"` — the localized current-maximum readout. */
  formatCurrentValue: (value: number) => string;
  /** Localized `aria-valuetext`, read by assistive tech instead of the bare number. */
  formatValueText: (value: number) => string;
  minValueLabel: string;
  maxValueLabel: string;
}

/**
 * A single native `<input type="range">` shared by the Desktop Sidebar and
 * the Mobile Sheet. Dragging updates the visible thumb position and the
 * live-formatted current-value readout immediately, but `onCommit` — which
 * is what actually changes the URL or the mobile draft — only fires once the
 * interaction settles *and* the value genuinely changed, so a drag never
 * floods the history stack, and pointerup/keyup/blur firing in combination
 * for the same gesture never commits the same value twice.
 */
export function RangeFilterControl({
  legend,
  min,
  max,
  step,
  value,
  onCommit,
  formatCurrentValue,
  formatValueText,
  minValueLabel,
  maxValueLabel,
}: RangeFilterControlProps) {
  const inputId = useId();

  // Mirrors the render-time reset pattern already used for Sort in
  // FlightResultsExperience: local visual state — and the dedup marker below
  // — reset whenever the committed `value` prop changes for a reason other
  // than this control's own commit (a URL navigation, or the Sheet's draft
  // being reset), without needing an effect.
  const [syncedValue, setSyncedValue] = useState(value);
  const [local, setLocal] = useState(value);
  const [lastCommitted, setLastCommitted] = useState(value);
  if (syncedValue !== value) {
    setSyncedValue(value);
    setLocal(value);
    setLastCommitted(value);
  }

  /** The one place `onCommit` is ever called — only when the settled value actually changed. */
  function commitIfChanged() {
    if (local !== lastCommitted) {
      setLastCommitted(local);
      onCommit(local);
    }
  }

  if (min >= max) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-foreground text-sm font-semibold">
          {legend}
        </label>
        <span className="text-foreground-muted text-sm">
          {formatCurrentValue(local)}
        </span>
      </div>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={local}
        onChange={(event) => setLocal(Number(event.target.value))}
        onPointerUp={commitIfChanged}
        onPointerCancel={commitIfChanged}
        onKeyUp={commitIfChanged}
        onBlur={commitIfChanged}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={local}
        aria-valuetext={formatValueText(local)}
        className={cn(
          // The input's own box is a full 44px tall — the real interactive
          // target, not just surrounding whitespace — while the track and
          // thumb below are styled to stay visually thin and centered on it.
          "h-11 w-full cursor-pointer touch-none appearance-none bg-transparent",
          "focus-visible:outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2",
          "[&::-moz-range-track]:bg-background-muted [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full",
          "[&::-webkit-slider-runnable-track]:bg-background-muted [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full",
          "[&::-moz-range-thumb]:bg-brand-600 [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-xs",
          "[&::-webkit-slider-thumb]:bg-brand-600 [&::-webkit-slider-thumb]:mt-[-7px] [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-xs",
        )}
      />
      <div className="text-foreground-muted flex justify-between text-xs">
        <span>{minValueLabel}</span>
        <span>{maxValueLabel}</span>
      </div>
    </div>
  );
}
