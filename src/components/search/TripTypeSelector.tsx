"use client";

import { cn } from "@/lib/utilities/cn";

export type TripType = "roundTrip" | "oneWay" | "multiCity";

const order: readonly TripType[] = ["roundTrip", "oneWay", "multiCity"];

/**
 * Why an option is visible but not choosable.
 *
 * `badge` is the short visible marker on the segment; `explanation` is a full
 * sentence rendered under the group and associated with the input, so the
 * reason reaches keyboard and screen-reader users without a hover-only
 * affordance.
 */
export interface TripTypeUnavailable {
  readonly badge: string;
  readonly explanation: string;
}

interface TripTypeSelectorProps {
  label: string;
  value: TripType;
  onChange: (value: TripType) => void;
  /** Radio group name — must be unique per search shell instance. */
  name: string;
  options: Record<TripType, string>;
  /**
   * Options that exist in the product but cannot be selected yet. Passing the
   * reason in keeps this component generic: it knows how to present an
   * unavailable option, not which option happens to be unavailable today.
   */
  unavailable?: Partial<Record<TripType, TripTypeUnavailable>>;
  className?: string;
}

/**
 * Segmented trip-type control built on native radio inputs.
 *
 * Native radios give arrow-key navigation and correct screen-reader semantics
 * for free; the visible segment is the styled `<label>` bound to each input.
 *
 * An unavailable option uses the **native `disabled` attribute** rather than
 * `aria-disabled`. That is the opposite of the calendar's day cells, and
 * deliberately so: a radio group has one tab stop and arrow keys cycle the
 * enabled members, so a disabled radio is skipped cleanly and focus is never
 * stranded. Leaving it selectable-but-inert would let the form claim a trip
 * type it cannot actually perform.
 */
export function TripTypeSelector({
  label,
  value,
  onChange,
  name,
  options,
  unavailable,
  className,
}: TripTypeSelectorProps) {
  const notes = order
    .map((option) => {
      const note = unavailable?.[option];
      return note ? { option, note } : null;
    })
    .filter((entry): entry is { option: TripType; note: TripTypeUnavailable } =>
      Boolean(entry),
    );

  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="sr-only">{label}</legend>
      <div className="rounded-pill border-border bg-background-muted inline-flex flex-wrap gap-1 border p-1">
        {order.map((option) => {
          const id = `${name}-${option}`;
          const note = unavailable?.[option];
          const selected = value === option && !note;
          return (
            <span key={option} className="relative">
              <input
                type="radio"
                id={id}
                name={name}
                value={option}
                checked={selected}
                disabled={Boolean(note)}
                aria-describedby={note ? `${id}-note` : undefined}
                onChange={() => onChange(option)}
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                className={cn(
                  "rounded-pill inline-flex min-h-11 items-center gap-1.5 px-4 text-sm font-medium",
                  "peer-focus-visible:outline-focus-ring peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
                  note
                    ? "text-foreground-muted/70 cursor-not-allowed"
                    : cn(
                        "gtai-lift cursor-pointer",
                        selected
                          ? "bg-surface text-brand-ink-strong font-semibold shadow-sm"
                          : "text-foreground-secondary hover:text-brand-ink",
                      ),
                )}
              >
                {options[option]}
                {note ? (
                  <span className="border-border text-foreground-muted rounded-pill border px-1.5 py-px text-[0.625rem] font-semibold tracking-wide uppercase">
                    {note.badge}
                  </span>
                ) : null}
              </label>
            </span>
          );
        })}
      </div>

      {notes.map(({ option, note }) => (
        <p
          key={option}
          id={`${name}-${option}-note`}
          className="text-foreground-muted mt-1.5 text-xs"
        >
          {note.explanation}
        </p>
      ))}
    </fieldset>
  );
}
