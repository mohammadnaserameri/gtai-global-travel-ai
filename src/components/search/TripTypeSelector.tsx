"use client";

import { cn } from "@/lib/utilities/cn";

export type TripType = "roundTrip" | "oneWay" | "multiCity";

const order: readonly TripType[] = ["roundTrip", "oneWay", "multiCity"];

interface TripTypeSelectorProps {
  label: string;
  value: TripType;
  onChange: (value: TripType) => void;
  /** Radio group name — must be unique per search shell instance. */
  name: string;
  options: Record<TripType, string>;
  className?: string;
}

/**
 * Segmented trip-type control built on native radio inputs.
 *
 * Native radios give arrow-key navigation and correct screen-reader semantics
 * for free; the visible segment is the styled `<label>` bound to each input.
 */
export function TripTypeSelector({
  label,
  value,
  onChange,
  name,
  options,
  className,
}: TripTypeSelectorProps) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="sr-only">{label}</legend>
      <div className="rounded-pill border-border bg-background-muted inline-flex flex-wrap gap-1 border p-1">
        {order.map((option) => {
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
                {options[option]}
              </label>
            </span>
          );
        })}
      </div>
    </fieldset>
  );
}
