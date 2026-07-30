"use client";

import type { ReactNode } from "react";

import { formatLocaleNumber } from "@/features/flights/flight-offer-formatting";
import { cn } from "@/lib/utilities/cn";

interface FilterSectionProps {
  legend: string;
  children: ReactNode;
  className?: string;
}

/** A semantic `fieldset`/`legend` group — every checkbox group in both the Sidebar and the Sheet uses this. */
export function FilterSection({ legend, children, className }: FilterSectionProps) {
  return (
    <fieldset className={cn("flex flex-col gap-1", className)}>
      <legend className="text-foreground mb-1.5 text-sm font-semibold">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

interface FilterCheckboxOptionProps {
  label: ReactNode;
  checked: boolean;
  /** `null` when this dimension has no facet count (not used for price/duration). */
  count: number | null;
  locale: string;
  onChange: (checked: boolean) => void;
}

/**
 * One checkbox row. The whole row is the label's click target (native
 * `label`/`input` association), which is what gives it its 44px minimum
 * height rather than relying on the checkbox glyph alone. A selected option
 * with a zero facet count stays enabled — it must remain removable — while
 * an unselected zero-count option is disabled, communicated through both the
 * `disabled` state and the visible muted count, never colour alone.
 */
export function FilterCheckboxOption({
  label,
  checked,
  count,
  locale,
  onChange,
}: FilterCheckboxOptionProps) {
  const disabled = count === 0 && !checked;
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-1.5",
        "hover:bg-background-muted",
        disabled && "cursor-not-allowed opacity-55 hover:bg-transparent",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="border-border-strong text-brand-700 focus-visible:outline-focus-ring size-4 shrink-0 rounded focus-visible:outline-2 focus-visible:outline-offset-2"
      />
      <span className="text-foreground min-w-0 flex-1 text-sm">{label}</span>
      {count !== null ? (
        <span className="text-foreground-muted shrink-0 text-xs">
          {" "}
          ({formatLocaleNumber(count, locale)})
        </span>
      ) : null}
    </label>
  );
}
