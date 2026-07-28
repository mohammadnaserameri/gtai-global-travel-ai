"use client";

import type { LocationGroup } from "@/features/locations/location-types";
import type { TravelLocation } from "@/features/locations/location-types";
import type { LocationSearchStatus } from "@/features/locations/use-location-search";
import type { LocationLabelStrings } from "@/features/locations/location-presentation";
import { cn } from "@/lib/utilities/cn";
import { Button } from "@/components/ui/Button";
import { LocationResultItem } from "@/components/search/airport-selector/LocationResultItem";

export interface LocationListLabels extends LocationLabelStrings {
  readonly listLabel: string;
  readonly groups: Readonly<Record<string, string>>;
  readonly clearRecent: string;
  readonly loading: string;
  readonly noResultsTitle: string;
  readonly noResultsHint: string;
  readonly clearQuery: string;
  readonly errorTitle: string;
  readonly retry: string;
  readonly demoNotice: string;
}

interface LocationResultListProps {
  groups: readonly LocationGroup[];
  /** Flattened order, used for keyboard indexing. */
  flat: readonly TravelLocation[];
  status: LocationSearchStatus;
  activeIndex: number;
  locale: string;
  labels: LocationListLabels;
  listboxId: string;
  optionId: (index: number) => string;
  hasQuery: boolean;
  showClearRecent: boolean;
  onSelect: (location: TravelLocation) => void;
  onClearRecent: () => void;
  onClearQuery: () => void;
  onRetry: () => void;
  registerOption: (index: number, node: HTMLLIElement | null) => void;
}

/**
 * The grouped result region.
 *
 * Groups are `role="group"` inside a single listbox so a screen reader
 * announces "Cities and all airports" as context while still treating every
 * row as one flat set of options — which is what keeps arrow-key navigation
 * crossing group boundaries predictably.
 *
 * Empty groups are never rendered, and each location appears in exactly one
 * group, so the flattened keyboard order matches the visual order exactly.
 */
export function LocationResultList({
  groups,
  flat,
  status,
  activeIndex,
  locale,
  labels,
  listboxId,
  optionId,
  hasQuery,
  showClearRecent,
  onSelect,
  onClearRecent,
  onClearQuery,
  onRetry,
  registerOption,
}: LocationResultListProps) {
  if (status === "error") {
    return (
      <div className="px-3 py-6 text-center">
        <p className="text-foreground text-sm font-medium">{labels.errorTitle}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          {labels.retry}
        </Button>
      </div>
    );
  }

  if (status === "loading" && flat.length === 0) {
    return (
      <p className="text-foreground-muted px-3 py-6 text-center text-sm">
        {labels.loading}
      </p>
    );
  }

  if (status === "ready" && flat.length === 0) {
    return (
      <div className="px-3 py-6 text-center">
        <p className="text-foreground text-sm font-medium">
          {labels.noResultsTitle}
        </p>
        <p className="text-foreground-muted mt-1 text-xs">{labels.noResultsHint}</p>
        {hasQuery ? (
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={onClearQuery}
          >
            {labels.clearQuery}
          </Button>
        ) : null}
      </div>
    );
  }

  // Flat option indices are derived from a prefix sum rather than a running
  // counter, so nothing is reassigned during render and each row's keyboard
  // index is fixed before any output is produced. Group count is tiny.
  const indexedGroups = groups.map((group, groupIndex) => {
    const start = groups
      .slice(0, groupIndex)
      .reduce((count, previous) => count + previous.locations.length, 0);

    return {
      group,
      rows: group.locations.map((location, position) => ({
        location,
        index: start + position,
      })),
    };
  });

  return (
    <>
      <ul
        id={listboxId}
        role="listbox"
        aria-label={labels.listLabel}
        className="flex flex-col gap-0.5"
      >
        {indexedGroups.map(({ group, rows }) => {
          const headingId = `${listboxId}-group-${group.id}`;
          const heading = labels.groups[group.id] ?? group.id;

          return (
            <li key={group.id} role="presentation">
              <div
                role="group"
                aria-labelledby={headingId}
                className="flex flex-col gap-0.5"
              >
                <div
                  id={headingId}
                  className={cn(
                    "text-foreground-muted flex items-center justify-between",
                    "px-3 pt-3 pb-1 text-[0.6875rem] font-semibold tracking-wide uppercase",
                  )}
                >
                  <span>{heading}</span>
                  {group.id === "recent" && showClearRecent ? (
                    <button
                      type="button"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        onClearRecent();
                      }}
                      className="text-brand-ink hover:text-brand-ink-strong focus-visible:outline-focus-ring rounded-sm text-[0.6875rem] font-semibold normal-case focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {labels.clearRecent}
                    </button>
                  ) : null}
                </div>

                <ul role="presentation" className="flex flex-col gap-0.5">
                  {rows.map(({ location, index }) => (
                    <LocationResultItem
                      key={`${group.id}-${location.id}`}
                      location={location}
                      locale={locale}
                      labels={labels}
                      optionId={optionId(index)}
                      active={index === activeIndex}
                      onSelect={onSelect}
                      registerRef={(node) => registerOption(index, node)}
                    />
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-foreground-muted border-border mt-2 border-t px-3 pt-3 text-[0.6875rem] leading-relaxed">
        {labels.demoNotice}
      </p>
    </>
  );
}
