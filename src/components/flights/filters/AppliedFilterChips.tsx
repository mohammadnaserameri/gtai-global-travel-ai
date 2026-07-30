"use client";

import { Fragment, type ReactNode } from "react";

import type { Dictionary } from "@/i18n/get-dictionary";
import type { CurrencyCode } from "@/config/currencies";
import type { FlightFilterState } from "@/features/flights/filters/flight-filter-types";
import type { CarrierOption } from "@/features/flights/filters/flight-filter-facets";
import {
  departureTimeBucketLabel,
  formatUpToDuration,
  formatUpToPrice,
  stopCategoryLabel,
} from "@/features/flights/filters/flight-filter-formatting";
import {
  formatTemplate,
  splitTemplateSegments,
  type DurationUnitLabels,
} from "@/features/flights/flight-offer-formatting";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { CloseIcon } from "@/components/ui/icons";

interface Chip {
  readonly key: string;
  /** Visual label — may embed a `<bdi dir="ltr">` code inside localized text. */
  readonly label: ReactNode;
  /** Plain-string form of the same label, for the remove button's accessible name. */
  readonly plainLabel: string;
  readonly onRemove: () => void;
}

/** Renders a `"{token}"` template with a JSX value for its one token, keeping the surrounding text plain. */
function renderChipTemplate(
  template: string,
  token: string,
  value: ReactNode,
): ReactNode {
  return splitTemplateSegments(template).map((segment, index) =>
    segment.kind === "text" ? (
      segment.value
    ) : (
      <Fragment key={index}>{value}</Fragment>
    ),
  );
}

interface AppliedFilterChipsProps {
  filters: FlightFilterState;
  onChange: (next: FlightFilterState) => void;
  onClearAll: () => void;
  carrierOptions: readonly CarrierOption[];
  currency: CurrencyCode;
  locale: string;
  labels: Dictionary["flightResults"]["filters"];
  durationUnitLabels: DurationUnitLabels;
}

/**
 * One chip per active value, plus a single "Clear all" action — rendered
 * only once at least one filter dimension is active. Removing a chip commits
 * immediately (there is no draft state here; chips always reflect the
 * committed URL, on both desktop and mobile).
 */
export function AppliedFilterChips({
  filters,
  onChange,
  onClearAll,
  carrierOptions,
  currency,
  locale,
  labels,
  durationUnitLabels,
}: AppliedFilterChipsProps) {
  const chips: Chip[] = [];

  for (const category of filters.stopCategories) {
    const text = stopCategoryLabel(category, labels.stops);
    chips.push({
      key: `stop-${category}`,
      label: text,
      plainLabel: text,
      onRemove: () =>
        onChange({
          ...filters,
          stopCategories: filters.stopCategories.filter((c) => c !== category),
        }),
    });
  }

  for (const id of filters.carrierIds) {
    const name = carrierOptions.find((carrier) => carrier.id === id)?.name ?? id;
    chips.push({
      key: `carrier-${id}`,
      label: <bdi dir="auto">{name}</bdi>,
      plainLabel: name,
      onRemove: () =>
        onChange({
          ...filters,
          carrierIds: filters.carrierIds.filter((c) => c !== id),
        }),
    });
  }

  for (const bucket of filters.departureTimeBuckets) {
    const text = departureTimeBucketLabel(bucket, labels.departureTime);
    chips.push({
      key: `time-${bucket}`,
      label: text,
      plainLabel: text,
      onRemove: () =>
        onChange({
          ...filters,
          departureTimeBuckets: filters.departureTimeBuckets.filter(
            (b) => b !== bucket,
          ),
        }),
    });
  }

  if (filters.maxTotalPrice !== null) {
    const text = formatUpToPrice(
      filters.maxTotalPrice,
      currency,
      locale,
      labels.price.upTo,
    );
    chips.push({
      key: "price",
      label: <bdi dir="auto">{text}</bdi>,
      plainLabel: text,
      onRemove: () => onChange({ ...filters, maxTotalPrice: null }),
    });
  }

  if (filters.maxDurationMinutes !== null) {
    const text = formatUpToDuration(
      filters.maxDurationMinutes,
      locale,
      durationUnitLabels,
      labels.duration.upTo,
    );
    chips.push({
      key: "duration",
      label: <bdi dir="auto">{text}</bdi>,
      plainLabel: text,
      onRemove: () => onChange({ ...filters, maxDurationMinutes: null }),
    });
  }

  for (const code of filters.departureAirportCodes) {
    chips.push({
      key: `from-${code}`,
      label: renderChipTemplate(
        labels.airports.fromChip,
        "airport",
        <bdi dir="ltr">{code}</bdi>,
      ),
      plainLabel: formatTemplate(labels.airports.fromChip, { airport: code }),
      onRemove: () =>
        onChange({
          ...filters,
          departureAirportCodes: filters.departureAirportCodes.filter(
            (c) => c !== code,
          ),
        }),
    });
  }

  for (const code of filters.arrivalAirportCodes) {
    chips.push({
      key: `to-${code}`,
      label: renderChipTemplate(
        labels.airports.toChip,
        "airport",
        <bdi dir="ltr">{code}</bdi>,
      ),
      plainLabel: formatTemplate(labels.airports.toChip, { airport: code }),
      onRemove: () =>
        onChange({
          ...filters,
          arrivalAirportCodes: filters.arrivalAirportCodes.filter(
            (c) => c !== code,
          ),
        }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={labels.heading}
      className="flex flex-wrap items-center gap-2"
    >
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="border-border bg-background-muted rounded-pill inline-flex min-h-11 items-center gap-1 border ps-3 pe-1 text-sm"
        >
          {chip.label}
          <IconButton
            label={formatTemplate(labels.removeFilter, { filter: chip.plainLabel })}
            variant="ghost"
            onClick={chip.onRemove}
          >
            <CloseIcon size={14} />
          </IconButton>
        </span>
      ))}
      <Button variant="ghost" onClick={onClearAll}>
        {labels.clearAll}
      </Button>
    </div>
  );
}
