"use client";

import type { Dictionary } from "@/i18n/get-dictionary";
import type { CurrencyCode } from "@/config/currencies";
import {
  DEPARTURE_TIME_BUCKETS,
  STOP_CATEGORIES,
  type FlightFilterState,
} from "@/features/flights/filters/flight-filter-types";
import {
  computeRangeSliderDomain,
  type CarrierOption,
  type FacetCounts,
  type RangeBounds,
} from "@/features/flights/filters/flight-filter-facets";
import {
  departureTimeBucketLabel,
  formatUpToDuration,
  formatUpToPrice,
  stopCategoryLabel,
} from "@/features/flights/filters/flight-filter-formatting";
import {
  formatOfferPrice,
  type DurationUnitLabels,
} from "@/features/flights/flight-offer-formatting";
import { FilterCheckboxOption, FilterSection } from "./FilterSection";
import { RangeFilterControl } from "./RangeFilterControl";

function toggleValue<T>(values: readonly T[], value: T, checked: boolean): T[] {
  if (checked) return values.includes(value) ? [...values] : [...values, value];
  return values.filter((existing) => existing !== value);
}

interface FlightFilterGroupsProps {
  filters: FlightFilterState;
  onChangeCheckboxes: (next: FlightFilterState) => void;
  onCommitPrice: (value: number) => void;
  onCommitDuration: (value: number) => void;
  priceBounds: RangeBounds;
  durationBounds: RangeBounds;
  carrierOptions: readonly CarrierOption[];
  fromAirportOptions: readonly string[];
  toAirportOptions: readonly string[];
  facetCounts: FacetCounts;
  currency: CurrencyCode;
  locale: string;
  labels: Dictionary["flightResults"]["filters"];
  durationUnitLabels: DurationUnitLabels;
  /** Resolves an airport code to its localized display name. */
  airportName: (code: string) => string;
}

/**
 * The actual filter controls — six groups shared verbatim by the Desktop
 * Sidebar and the Mobile Sheet. Only the meaning of `onChangeCheckboxes` /
 * `onCommitPrice` / `onCommitDuration` differs between the two: the Sidebar
 * wires them straight to a URL commit, the Sheet wires them to its draft
 * state setter.
 */
export function FlightFilterGroups({
  filters,
  onChangeCheckboxes,
  onCommitPrice,
  onCommitDuration,
  priceBounds,
  durationBounds,
  carrierOptions,
  fromAirportOptions,
  toAirportOptions,
  facetCounts,
  currency,
  locale,
  labels,
  durationUnitLabels,
  airportName,
}: FlightFilterGroupsProps) {
  const showDepartureAirports = fromAirportOptions.length > 1;
  const showArrivalAirports = toAirportOptions.length > 1;
  // Price steps by a single currency unit, so its span always divides evenly
  // and `sliderMax` trivially equals the observed maximum; Duration's
  // 15-minute step generally does not divide evenly, so its `sliderMax` is
  // rounded up to the next reachable step position instead.
  const priceDomain = computeRangeSliderDomain(priceBounds, 1);
  const durationDomain = computeRangeSliderDomain(durationBounds, 15);

  return (
    <div className="flex flex-col gap-6">
      <FilterSection legend={labels.stops.legend}>
        {STOP_CATEGORIES.map((category) => (
          <FilterCheckboxOption
            key={category}
            label={stopCategoryLabel(category, labels.stops)}
            checked={filters.stopCategories.includes(category)}
            count={facetCounts.stopCategories.get(category) ?? 0}
            locale={locale}
            onChange={(checked) =>
              onChangeCheckboxes({
                ...filters,
                stopCategories: toggleValue(
                  filters.stopCategories,
                  category,
                  checked,
                ),
              })
            }
          />
        ))}
      </FilterSection>

      {carrierOptions.length > 0 ? (
        <FilterSection legend={labels.carriers.legend}>
          {carrierOptions.map((carrier) => (
            <FilterCheckboxOption
              key={carrier.id}
              label={<bdi dir="auto">{carrier.name}</bdi>}
              checked={filters.carrierIds.includes(carrier.id)}
              count={facetCounts.carriers.get(carrier.id) ?? 0}
              locale={locale}
              onChange={(checked) =>
                onChangeCheckboxes({
                  ...filters,
                  carrierIds: toggleValue(filters.carrierIds, carrier.id, checked),
                })
              }
            />
          ))}
        </FilterSection>
      ) : null}

      <FilterSection legend={labels.departureTime.legend}>
        {DEPARTURE_TIME_BUCKETS.map((bucket) => (
          <FilterCheckboxOption
            key={bucket}
            label={departureTimeBucketLabel(bucket, labels.departureTime)}
            checked={filters.departureTimeBuckets.includes(bucket)}
            count={facetCounts.departureTimeBuckets.get(bucket) ?? 0}
            locale={locale}
            onChange={(checked) =>
              onChangeCheckboxes({
                ...filters,
                departureTimeBuckets: toggleValue(
                  filters.departureTimeBuckets,
                  bucket,
                  checked,
                ),
              })
            }
          />
        ))}
      </FilterSection>

      <FilterSection legend={labels.price.legend}>
        <RangeFilterControl
          legend={labels.price.maxLabel}
          min={priceDomain.min}
          max={priceDomain.sliderMax}
          step={priceDomain.step}
          value={filters.maxTotalPrice ?? priceDomain.sliderMax}
          onCommit={onCommitPrice}
          formatCurrentValue={(value) =>
            value >= priceBounds.max
              ? labels.allOptions
              : formatUpToPrice(value, currency, locale, labels.price.upTo)
          }
          formatValueText={(value) =>
            value >= priceBounds.max
              ? labels.allOptions
              : formatUpToPrice(value, currency, locale, labels.price.upTo)
          }
          minValueLabel={formatOfferPrice(priceBounds.min, currency, locale)}
          maxValueLabel={formatOfferPrice(priceBounds.max, currency, locale)}
        />
      </FilterSection>

      <FilterSection legend={labels.duration.legend}>
        <RangeFilterControl
          legend={labels.duration.maxLabel}
          min={durationDomain.min}
          max={durationDomain.sliderMax}
          step={durationDomain.step}
          value={filters.maxDurationMinutes ?? durationDomain.sliderMax}
          onCommit={onCommitDuration}
          formatCurrentValue={(value) =>
            value >= durationBounds.max
              ? labels.allOptions
              : formatUpToDuration(
                  value,
                  locale,
                  durationUnitLabels,
                  labels.duration.upTo,
                )
          }
          formatValueText={(value) =>
            value >= durationBounds.max
              ? labels.allOptions
              : formatUpToDuration(
                  value,
                  locale,
                  durationUnitLabels,
                  labels.duration.upTo,
                )
          }
          minValueLabel={formatUpToDuration(
            durationBounds.min,
            locale,
            durationUnitLabels,
            "{duration}",
          )}
          maxValueLabel={formatUpToDuration(
            durationBounds.max,
            locale,
            durationUnitLabels,
            "{duration}",
          )}
        />
      </FilterSection>

      {showDepartureAirports ? (
        <FilterSection legend={labels.airports.departureLegend}>
          {fromAirportOptions.map((code) => (
            <FilterCheckboxOption
              key={code}
              label={
                <span className="inline-flex min-w-0 items-baseline gap-1.5">
                  <bdi dir="ltr" className="font-semibold">
                    {code}
                  </bdi>
                  <bdi dir="auto" className="text-foreground-muted truncate">
                    {airportName(code)}
                  </bdi>
                </span>
              }
              checked={filters.departureAirportCodes.includes(code)}
              count={facetCounts.departureAirportCodes.get(code) ?? 0}
              locale={locale}
              onChange={(checked) =>
                onChangeCheckboxes({
                  ...filters,
                  departureAirportCodes: toggleValue(
                    filters.departureAirportCodes,
                    code,
                    checked,
                  ),
                })
              }
            />
          ))}
        </FilterSection>
      ) : null}

      {showArrivalAirports ? (
        <FilterSection legend={labels.airports.arrivalLegend}>
          {toAirportOptions.map((code) => (
            <FilterCheckboxOption
              key={code}
              label={
                <span className="inline-flex min-w-0 items-baseline gap-1.5">
                  <bdi dir="ltr" className="font-semibold">
                    {code}
                  </bdi>
                  <bdi dir="auto" className="text-foreground-muted truncate">
                    {airportName(code)}
                  </bdi>
                </span>
              }
              checked={filters.arrivalAirportCodes.includes(code)}
              count={facetCounts.arrivalAirportCodes.get(code) ?? 0}
              locale={locale}
              onChange={(checked) =>
                onChangeCheckboxes({
                  ...filters,
                  arrivalAirportCodes: toggleValue(
                    filters.arrivalAirportCodes,
                    code,
                    checked,
                  ),
                })
              }
            />
          ))}
        </FilterSection>
      ) : null}
    </div>
  );
}
