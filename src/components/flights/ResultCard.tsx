"use client";

import { Fragment, useId, useRef, useState, type ReactNode } from "react";

import type { Dictionary } from "@/i18n/get-dictionary";
import type { FlightSearchIntent } from "@/features/flights/search-intent-types";
import type {
  FlightItinerary,
  FlightOffer,
} from "@/features/flights/flight-offer-types";
import {
  aircraftLabel,
  formatDayOffset,
  formatDurationMinutes,
  formatLocalDate,
  formatOfferPrice,
  formatStopCount,
  formatTemplate,
  splitTemplateSegments,
} from "@/features/flights/flight-offer-formatting";
import { cn } from "@/lib/utilities/cn";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ChevronDownIcon } from "@/components/ui/icons";

interface ResultCardProps {
  offer: FlightOffer;
  intent: FlightSearchIntent;
  labels: Dictionary["flightResults"];
  /** Localized cabin name — the offer only carries the internal enum value. */
  cabinLabel: string;
}

const ITINERARY_LABEL_KEY: Record<
  FlightItinerary["direction"],
  "outbound" | "inbound"
> = {
  outbound: "outbound",
  inbound: "inbound",
};

/** A route arrow that mirrors under RTL, exactly like the Date Picker's month chevrons. */
function RouteArrow() {
  return (
    <span aria-hidden="true" className="text-foreground-muted rtl:-scale-x-100">
      →
    </span>
  );
}

/**
 * Renders a `"{token}"` template as structured JSX rather than one opaque
 * interpolated string, so each `values` entry — typically a `<bdi>`-isolated
 * code, time or identifier — keeps its own bidi isolation instead of being
 * flattened into the localized surrounding text.
 */
function renderTemplate(
  template: string,
  values: Readonly<Record<string, ReactNode>>,
): ReactNode {
  return splitTemplateSegments(template).map((segment, index) => {
    if (segment.kind === "text") return segment.value;
    return <Fragment key={index}>{values[segment.key]}</Fragment>;
  });
}

/** One itinerary's collapsed summary row — the departure/arrival/duration line. */
function ItinerarySummary({
  itinerary,
  labels,
  locale,
}: {
  itinerary: FlightItinerary;
  labels: Dictionary["flightResults"];
  locale: string;
}) {
  const headingId = useId();
  const dayOffset = formatDayOffset(
    itinerary.departure,
    itinerary.arrival,
    locale,
    labels.dayOffset,
  );
  const durationLabels = {
    hour: labels.duration.hourUnit,
    minute: labels.duration.minuteUnit,
  };
  const firstSegment = itinerary.segments[0];
  const lastSegment = itinerary.segments[itinerary.segments.length - 1];

  return (
    <div className="flex flex-col gap-1.5">
      <h3
        id={headingId}
        className="text-foreground-muted text-xs font-semibold tracking-wide uppercase"
      >
        {labels.card[ITINERARY_LABEL_KEY[itinerary.direction]]}
        <span className="ms-2 font-normal normal-case">
          <bdi dir="auto">{formatLocalDate(itinerary.departure, locale)}</bdi>
        </span>
      </h3>

      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1"
        aria-labelledby={headingId}
      >
        <bdi dir="ltr" className="text-foreground text-base font-semibold">
          {itinerary.departure.time} {firstSegment.originCode}
        </bdi>
        <RouteArrow />
        <bdi dir="ltr" className="text-foreground text-base font-semibold">
          {itinerary.arrival.time} {lastSegment.destinationCode}
        </bdi>
        {dayOffset ? (
          <sup className="text-foreground-muted ms-0.5 text-[0.65rem] font-semibold">
            <bdi dir="auto">{dayOffset}</bdi>
          </sup>
        ) : null}

        <span className="text-foreground-muted text-sm">
          <bdi dir="auto">
            {formatDurationMinutes(
              itinerary.durationMinutes,
              locale,
              durationLabels,
            )}
          </bdi>
        </span>
        <span className="text-foreground-secondary text-sm font-medium">
          {formatStopCount(itinerary.stopCount, locale, {
            direct: labels.card.direct,
            oneStop: labels.card.oneStop,
            nStops: labels.card.nStops,
          })}
        </span>
      </div>
    </div>
  );
}

/** The segment-by-segment breakdown shown once "Show details" is expanded. */
function ItineraryDetail({
  itinerary,
  labels,
  locale,
}: {
  itinerary: FlightItinerary;
  labels: Dictionary["flightResults"];
  locale: string;
}) {
  const durationLabels = {
    hour: labels.duration.hourUnit,
    minute: labels.duration.minuteUnit,
  };

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-foreground text-sm font-semibold">
        {labels.card[ITINERARY_LABEL_KEY[itinerary.direction]]}
      </h4>
      <ol className="flex flex-col gap-3">
        {itinerary.segments.map((segment, index) => {
          const segmentDayOffset = formatDayOffset(
            segment.departure,
            segment.arrival,
            locale,
            labels.dayOffset,
          );
          return (
            <li key={segment.id} className="flex flex-col gap-1.5">
              <p className="text-foreground text-sm font-semibold">
                {renderTemplate(labels.card.flightLabel, {
                  number: <bdi dir="ltr">{segment.flightNumber}</bdi>,
                })}{" "}
                <bdi dir="auto" className="text-foreground-muted font-normal">
                  {segment.carrierName}
                </bdi>
              </p>
              <p className="text-foreground-secondary text-sm">
                <bdi dir="auto">{formatLocalDate(segment.departure, locale)}</bdi>
                {" · "}
                <bdi dir="ltr">
                  {segment.departure.time} {segment.originCode}
                </bdi>{" "}
                <RouteArrow />{" "}
                <bdi dir="auto">{formatLocalDate(segment.arrival, locale)}</bdi>
                {" · "}
                <bdi dir="ltr">
                  {segment.arrival.time} {segment.destinationCode}
                </bdi>
                {segmentDayOffset ? (
                  <sup className="ms-0.5">
                    <bdi dir="auto">{segmentDayOffset}</bdi>
                  </sup>
                ) : null}
              </p>
              <p className="text-foreground-muted text-xs">
                <bdi dir="auto">
                  {formatDurationMinutes(
                    segment.durationMinutes,
                    locale,
                    durationLabels,
                  )}
                </bdi>
                {" · "}
                <bdi dir="auto">
                  {aircraftLabel(segment.aircraftType, labels.card.aircraft)}
                </bdi>
              </p>

              {index < itinerary.layovers.length ? (
                <p className="border-border text-foreground-muted border-s-2 ps-3 text-xs">
                  {labels.card.layover}
                  {": "}
                  {renderTemplate(labels.card.layoverSummary, {
                    duration: (
                      <bdi dir="auto">
                        {formatDurationMinutes(
                          itinerary.layovers[index].durationMinutes,
                          locale,
                          durationLabels,
                        )}
                      </bdi>
                    ),
                    code: (
                      <bdi dir="ltr">{itinerary.layovers[index].airportCode}</bdi>
                    ),
                  })}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * One flight offer, as a semantic `<article>` with its own heading — the
 * card's `aria-labelledby` points at an `<h2>` naming the carrier and route,
 * so a screen-reader user navigating by heading hears which offer they are
 * in before any itinerary detail. That heading also gives the two itinerary
 * `<h3>`s underneath a real parent instead of a hierarchy gap.
 *
 * "Review option" and "Show details" deliberately drive the same disclosure —
 * V2.3 has nothing further to navigate to, so a second control that opened a
 * different view would be a dead end dressed as a feature.
 */
export function ResultCard({ offer, intent, labels, cabinLabel }: ResultCardProps) {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const detailId = useId();
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);

  function openDetails() {
    setOpen(true);
    requestAnimationFrame(() => detailHeadingRef.current?.focus());
  }

  return (
    <Card
      as="article"
      variant="plain"
      padding="md"
      className="flex flex-col gap-4"
      aria-labelledby={headingId}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id={headingId} className="text-foreground text-sm font-semibold">
            <bdi dir="auto">{offer.validatingCarrierName}</bdi>
            <span className="sr-only">
              {" — "}
              {formatTemplate(labels.card.routeHeading, {
                origin: intent.origin.displayName,
                destination: intent.destination.displayName,
              })}
            </span>
          </h2>
          <p className="text-foreground-muted text-xs">
            {renderTemplate(labels.card.providedBy, {
              provider: <bdi dir="auto">{offer.provider}</bdi>,
            })}
          </p>
        </div>
        <Badge tone="neutral" size="sm">
          {cabinLabel}
        </Badge>
      </div>

      <div className="flex flex-col gap-4">
        {offer.itineraries.map((itinerary) => (
          <ItinerarySummary
            key={itinerary.direction}
            itinerary={itinerary}
            labels={labels}
            locale={intent.locale}
          />
        ))}
      </div>

      <div className="border-border flex flex-wrap items-end justify-between gap-3 border-t pt-4">
        <div>
          <p className="text-foreground text-lg font-bold">
            {/* Intl already embeds its own directional marks (LRM/RLM) around
                the localized digits and currency symbol for fa/ar — forcing
                dir="ltr" here would override that and can reorder the
                amount. dir="auto" lets the formatted string carry its own
                direction. */}
            <bdi dir="auto">
              {formatOfferPrice(offer.totalPrice, offer.currency, intent.locale)}
            </bdi>
          </p>
          <p className="text-foreground-muted text-xs">
            {labels.card.demonstrationTotal}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={openDetails}>
            {labels.card.reviewOption}
          </Button>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={() => setOpen((value) => !value)}
            className={cn(
              "text-brand-ink hover:text-brand-ink-strong focus-visible:outline-focus-ring inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold",
              "focus-visible:outline-2 focus-visible:outline-offset-2",
            )}
          >
            {open ? labels.card.hideDetails : labels.card.showDetails}
            <span
              aria-hidden="true"
              className={cn("transition-transform", open && "rotate-180")}
            >
              <ChevronDownIcon size={16} />
            </span>
          </button>
        </div>
      </div>

      {open ? (
        <div
          id={detailId}
          className="border-border flex flex-col gap-5 border-t pt-4"
        >
          <h4
            ref={detailHeadingRef}
            tabIndex={-1}
            className="text-foreground text-sm font-semibold focus:outline-none"
          >
            {labels.card.showDetails}
          </h4>

          {offer.itineraries.map((itinerary) => (
            <ItineraryDetail
              key={itinerary.direction}
              itinerary={itinerary}
              labels={labels}
              locale={intent.locale}
            />
          ))}

          <div className="flex flex-col gap-1 text-sm">
            <p className="text-foreground-secondary">
              {offer.baggage.carryOnIncluded ? labels.card.carryOnIncluded : null}
            </p>
            <p className="text-foreground-secondary">
              {offer.baggage.checkedBagIncluded
                ? labels.card.checkedBagIncluded
                : labels.card.checkedBagNotIncluded}
            </p>
            <p className="text-foreground-secondary">
              {offer.fare.changeable
                ? labels.card.changesPermitted
                : labels.card.changesNotPermitted}
            </p>
            <p className="text-foreground-secondary">
              {offer.fare.refundable
                ? labels.card.refundable
                : labels.card.nonRefundable}
            </p>
          </div>

          <p className="text-foreground-muted text-xs leading-relaxed">
            {labels.localTimeNotice}
          </p>
          <p className="text-foreground-muted text-xs leading-relaxed">
            {renderTemplate(labels.card.operatedBy, {
              carrier: (
                <bdi dir="auto">{offer.operatingCarrierNames.join(", ")}</bdi>
              ),
            })}
          </p>
          <p className="text-foreground-muted text-xs leading-relaxed">
            {labels.card.partnerBookingUnavailable}
          </p>
        </div>
      ) : null}
    </Card>
  );
}
