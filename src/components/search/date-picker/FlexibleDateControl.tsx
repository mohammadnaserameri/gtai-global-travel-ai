"use client";

import type { FlexibilityDays } from "@/features/dates/date-types";
import { FLEXIBILITY_OPTIONS } from "@/features/dates/date-types";
import { cn } from "@/lib/utilities/cn";

export interface FlexibleDateLabels {
  readonly legend: string;
  readonly exact: string;
  readonly plusOne: string;
  readonly plusTwo: string;
  readonly plusThree: string;
}

interface FlexibleDateControlProps {
  labels: FlexibleDateLabels;
  value: FlexibilityDays;
  onChange: (value: FlexibilityDays) => void;
  /** Radio group name — unique per picker instance. */
  name: string;
}

/**
 * Trip-level date flexibility.
 *
 * This is a **search preference, not a date selection**: changing it never
 * alters the chosen departure or return, and it selects no extra calendar day.
 * It records how far a future provider search may look around those anchors.
 *
 * Nothing here promises a cheaper fare — no prices, savings or "best day"
 * claims, because no provider is connected.
 *
 * Built on native radios so arrow-key navigation and grouping come for free.
 */
export function FlexibleDateControl({
  labels,
  value,
  onChange,
  name,
}: FlexibleDateControlProps) {
  const optionLabel: Record<FlexibilityDays, string> = {
    0: labels.exact,
    1: labels.plusOne,
    2: labels.plusTwo,
    3: labels.plusThree,
  };

  return (
    <fieldset className="min-w-0">
      <legend className="text-foreground-muted mb-1.5 text-[0.6875rem] font-semibold tracking-wide uppercase">
        {labels.legend}
      </legend>
      <div className="border-border bg-background-muted rounded-pill inline-flex flex-wrap gap-1 border p-1">
        {FLEXIBILITY_OPTIONS.map((option) => {
          const id = `${name}-${option}`;
          const selected = value === option;
          return (
            <span key={option} className="relative">
              <input
                type="radio"
                id={id}
                name={name}
                value={option}
                checked={selected}
                onChange={() => onChange(option)}
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                className={cn(
                  "rounded-pill gtai-lift inline-flex min-h-9 cursor-pointer items-center px-3 text-xs font-medium",
                  "peer-focus-visible:outline-focus-ring peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
                  selected
                    ? "bg-surface text-brand-ink-strong font-semibold shadow-sm"
                    : "text-foreground-secondary hover:text-brand-ink",
                )}
              >
                <span className="gtai-ltr-numerals">{optionLabel[option]}</span>
              </label>
            </span>
          );
        })}
      </div>
    </fieldset>
  );
}
