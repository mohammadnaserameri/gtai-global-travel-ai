import {
  formatDurationMinutes,
  formatOfferPrice,
  formatTemplate,
  type DurationUnitLabels,
} from "../flight-offer-formatting";
import type { CurrencyCode } from "../../../config/currencies";
import type { DepartureTimeBucket, StopCategory } from "./flight-filter-types";

export interface StopFilterLabels {
  readonly direct: string;
  readonly oneStop: string;
  readonly twoPlusStops: string;
}

/** The checkbox label for a Stops category — distinct from the card's numeric "{count} stops" phrasing. */
export function stopCategoryLabel(
  category: StopCategory,
  labels: StopFilterLabels,
): string {
  return labels[category];
}

export interface DepartureTimeFilterLabels {
  readonly earlyMorning: string;
  readonly morning: string;
  readonly afternoon: string;
  readonly evening: string;
}

export function departureTimeBucketLabel(
  bucket: DepartureTimeBucket,
  labels: DepartureTimeFilterLabels,
): string {
  return labels[bucket];
}

/** `"Up to CAD 850"` — a single self-contained quantity phrase, safe to render in one bidi isolate. */
export function formatUpToPrice(
  amount: number,
  currency: CurrencyCode,
  locale: string,
  template: string,
): string {
  return formatTemplate(template, {
    price: formatOfferPrice(amount, currency, locale),
  });
}

/** `"Up to 8h 30m"` — same rationale as {@link formatUpToPrice}. */
export function formatUpToDuration(
  minutes: number,
  locale: string,
  durationLabels: DurationUnitLabels,
  template: string,
): string {
  return formatTemplate(template, {
    duration: formatDurationMinutes(minutes, locale, durationLabels),
  });
}
