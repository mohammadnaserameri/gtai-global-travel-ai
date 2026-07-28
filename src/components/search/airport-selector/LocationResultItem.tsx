"use client";

import type { TravelLocation } from "@/features/locations/location-types";
import {
  locationPrimaryLabel,
  locationSecondaryLabel,
  type LocationLabelStrings,
} from "@/features/locations/location-presentation";
import { cn } from "@/lib/utilities/cn";
import { CityIcon, CompassIcon, FlightIcon } from "@/components/ui/icons";

interface LocationResultItemProps {
  location: TravelLocation;
  locale: string;
  labels: LocationLabelStrings;
  /** DOM id, referenced by the input's `aria-activedescendant`. */
  optionId: string;
  active: boolean;
  onSelect: (location: TravelLocation) => void;
  /** Keeps the active row scrolled into view during keyboard navigation. */
  registerRef: (node: HTMLLIElement | null) => void;
}

function entityIcon(location: TravelLocation) {
  if (location.isFlexibleDestination) return <CompassIcon size={18} />;
  if (location.entityType === "CITY_ALL_AIRPORTS") return <CityIcon size={18} />;
  return <FlightIcon size={18} />;
}

/**
 * One selectable location.
 *
 * The row is an ARIA `option`, not a button — a nested interactive element
 * inside a listbox would break the combobox pattern. Selection is committed on
 * `pointerdown` so the input never loses focus first, which is what would
 * otherwise close the panel before the click resolved.
 *
 * The icon is decorative: entity kind is always also carried by the visible
 * secondary text ("All airports", an IATA code, or the Everywhere description).
 */
export function LocationResultItem({
  location,
  locale,
  labels,
  optionId,
  active,
  onSelect,
  registerRef,
}: LocationResultItemProps) {
  const primary = locationPrimaryLabel(location, locale, labels);
  const secondary = locationSecondaryLabel(location, locale, labels);

  const code = secondary.code ? (
    <span className="gtai-ltr-numerals text-brand-ink font-semibold">
      {secondary.code}
    </span>
  ) : null;

  return (
    <li
      ref={registerRef}
      id={optionId}
      role="option"
      aria-selected={active}
      onPointerDown={(event) => {
        event.preventDefault();
        onSelect(location);
      }}
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2",
        active ? "bg-brand-50" : "hover:bg-background-muted",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-md border",
          active
            ? "border-brand-250 bg-surface text-brand-700"
            : "border-border bg-surface-subtle text-foreground-muted",
        )}
      >
        {entityIcon(location)}
      </span>

      <span className="flex min-w-0 flex-col">
        <span className="text-foreground truncate text-sm font-medium">
          {primary}
        </span>
        <span className="text-foreground-muted truncate text-xs">
          {secondary.codeFirst ? (
            <>
              {code}
              {code ? " · " : null}
              {secondary.text}
            </>
          ) : (
            <>
              {secondary.text}
              {code ? " · " : null}
              {code}
            </>
          )}
        </span>
      </span>
    </li>
  );
}
