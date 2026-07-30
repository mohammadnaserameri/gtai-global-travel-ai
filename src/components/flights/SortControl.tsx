"use client";

import {
  SORT_OPTIONS,
  type SortOption,
} from "@/features/flights/flight-offer-ranking";
import { cn } from "@/lib/utilities/cn";

export interface SortControlLabels {
  readonly label: string;
  readonly best: string;
  readonly cheapest: string;
  readonly fastest: string;
  readonly bestExplanation: string;
}

interface SortControlProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
  labels: SortControlLabels;
  name: string;
}

/**
 * One implementation serves desktop and mobile — native radios with a visible
 * label and a 44px target per option, which is already what the spec asks
 * for on mobile, so a second "Sort Sheet" would just be extra surface area.
 */
export function SortControl({ value, onChange, labels, name }: SortControlProps) {
  const optionLabel: Record<SortOption, string> = {
    best: labels.best,
    cheapest: labels.cheapest,
    fastest: labels.fastest,
  };

  return (
    <fieldset className="flex flex-wrap items-center gap-3">
      <legend className="text-foreground-muted text-xs font-semibold tracking-wide uppercase">
        {labels.label}
      </legend>

      <div className="border-border bg-background-muted rounded-pill inline-flex flex-wrap gap-1 border p-1">
        {SORT_OPTIONS.map((option) => {
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
                  "rounded-pill gtai-lift inline-flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium",
                  "peer-focus-visible:outline-focus-ring peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
                  selected
                    ? "bg-surface text-brand-ink-strong font-semibold shadow-sm"
                    : "text-foreground-secondary hover:text-brand-ink",
                )}
              >
                {optionLabel[option]}
              </label>
            </span>
          );
        })}
      </div>

      {value === "best" ? (
        <p className="text-foreground-muted w-full text-xs sm:w-auto">
          {labels.bestExplanation}
        </p>
      ) : null}
    </fieldset>
  );
}
