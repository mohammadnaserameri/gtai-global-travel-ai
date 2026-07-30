"use client";

import {
  MIN_ADULTS,
  totalTravelers,
  type TravelerCounts,
} from "@/features/flights/search-intent-types";
import { isValidTravelerCounts } from "@/features/flights/search-intent-validation";
import {
  formatLocaleNumber,
  formatTemplate,
} from "@/features/flights/flight-offer-formatting";
import { DropdownShell } from "@/components/ui/DropdownShell";
import { IconButton } from "@/components/ui/IconButton";
import { MinusIcon, PlusIcon, TravelersIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";

export interface TravelersControlLabels {
  readonly label: string;
  readonly summaryOne: string;
  readonly summaryOther: string;
  readonly adults: string;
  readonly adultsHint: string;
  readonly children: string;
  readonly childrenHint: string;
  readonly infantsInSeat: string;
  readonly infantsInSeatHint: string;
  readonly infantsOnLap: string;
  readonly infantsOnLapHint: string;
  readonly decrease: string;
  readonly increase: string;
  readonly done: string;
}

interface TravelersControlProps {
  value: TravelerCounts;
  /**
   * Accepts a `Dispatch<SetStateAction<TravelerCounts>>` — i.e. `setTravelers`
   * itself — so `step` below can pass an updater function rather than a
   * value. Two stepper clicks handled inside the same React batch (a fast
   * double-click, or two dispatched in one synchronous script) both read the
   * `value` prop from the *same* render if `onChange` only ever received a
   * plain value; the second click would silently overwrite the first.
   */
  onChange: (
    updater: TravelerCounts | ((previous: TravelerCounts) => TravelerCounts),
  ) => void;
  labels: TravelersControlLabels;
  /** Active locale — every dynamic count renders in this locale's own digits. */
  locale: string;
}

type TravelerKey = keyof TravelerCounts;

interface RowConfig {
  key: TravelerKey;
  label: string;
  hint: string;
}

/**
 * The minimum honest, functional traveler selector: at least one adult, up to
 * nine travelers total, and never more lap infants than adults (an infant
 * needs an adult's lap). Every constraint routes through
 * `isValidTravelerCounts` — the same function the URL parser uses to reject a
 * malformed link — so the stepper can never produce a count the rest of the
 * app would refuse.
 */
export function TravelersControl({
  value,
  onChange,
  labels,
  locale,
}: TravelersControlProps) {
  const rows: readonly RowConfig[] = [
    { key: "adults", label: labels.adults, hint: labels.adultsHint },
    { key: "children", label: labels.children, hint: labels.childrenHint },
    {
      key: "infantsInSeat",
      label: labels.infantsInSeat,
      hint: labels.infantsInSeatHint,
    },
    {
      key: "infantsOnLap",
      label: labels.infantsOnLap,
      hint: labels.infantsOnLapHint,
    },
  ];

  function canDecrement(key: TravelerKey): boolean {
    const floor = key === "adults" ? MIN_ADULTS : 0;
    if (value[key] <= floor) return false;
    return isValidTravelerCounts({ ...value, [key]: value[key] - 1 });
  }

  function canIncrement(key: TravelerKey): boolean {
    return isValidTravelerCounts({ ...value, [key]: value[key] + 1 });
  }

  function step(key: TravelerKey, delta: number) {
    onChange((previous) => {
      const next = { ...previous, [key]: previous[key] + delta };
      return isValidTravelerCounts(next) ? next : previous;
    });
  }

  const total = totalTravelers(value);
  const summary =
    total === 1
      ? labels.summaryOne
      : formatTemplate(labels.summaryOther, {
          count: formatLocaleNumber(total, locale),
        });

  return (
    <DropdownShell
      triggerLabel={`${labels.label}: ${summary}`}
      trigger={
        <>
          <span aria-hidden="true" className="text-brand-600 shrink-0">
            <TravelersIcon size={16} />
          </span>
          <span className="text-foreground-muted text-xs font-medium">
            {labels.label}
          </span>
          <span className="text-foreground text-sm font-semibold">{summary}</span>
        </>
      }
      panelClassName="w-[min(22rem,calc(100vw-2rem))]"
    >
      {(close) => (
        <div className="flex flex-col gap-4">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-foreground text-sm font-semibold">{row.label}</p>
                <p className="text-foreground-muted text-xs">{row.hint}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <IconButton
                  variant="outline"
                  label={formatTemplate(labels.decrease, { label: row.label })}
                  disabled={!canDecrement(row.key)}
                  onClick={() => step(row.key, -1)}
                >
                  <MinusIcon size={16} />
                </IconButton>
                <span
                  className="gtai-ltr-numerals text-foreground w-6 text-center text-sm font-semibold"
                  aria-live="polite"
                >
                  {formatLocaleNumber(value[row.key], locale)}
                </span>
                <IconButton
                  variant="outline"
                  label={formatTemplate(labels.increase, { label: row.label })}
                  disabled={!canIncrement(row.key)}
                  onClick={() => step(row.key, 1)}
                >
                  <PlusIcon size={16} />
                </IconButton>
              </div>
            </div>
          ))}

          <Button variant="secondary" className="self-end" onClick={close}>
            {labels.done}
          </Button>
        </div>
      )}
    </DropdownShell>
  );
}
