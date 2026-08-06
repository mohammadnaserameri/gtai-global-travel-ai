"use client";

import { useId, useRef, useState } from "react";

import type { Dictionary } from "@/i18n/get-dictionary";
import type { FlightSearchIntent } from "@/features/flights/search-intent-types";
import type { HighlightKind } from "@/features/flights/flight-offer-highlights";
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
} from "@/features/flights/flight-offer-formatting";
import { cn } from "@/lib/utilities/cn";
import { Card } from "@/components/ui/Card";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ChevronDownIcon } from "@/components/ui/icons";
import { ProviderHandoffModal } from "@/components/flights/ProviderHandoffModal";
import { RouteArrow } from "@/components/flights/RouteArrow";
import { renderTemplate } from "@/components/flights/renderTemplate";

interface ResultCardProps {
  offer: FlightOffer;
  intent: FlightSearchIntent;
  labels: Dictionary["flightResults"];
  /** The shared demonstration statement, forwarded to the provider preview. */
  demonstrationNotice: Dictionary["demonstrationNotice"];
  /** Localized cabin name — the offer only carries the internal enum value. */
  cabinLabel: string;
  /** At most one deterministic highlight for this offer within the currently shown set. */
  highlight?: HighlightKind;
  /** The dedicated Details route for this offer, preserving the current Results view state. */
  detailsHref: string;
}

const ITINERARY_LABEL_KEY: Record<
  FlightItinerary["direction"],
  "outbound" | "inbound"
> = {
  outbound: "outbound",
  inbound: "inbound",
};

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
 * The card's primary action is a real internal link to the dedicated Flight
 * Details route (V2.6), carrying the current Search Intent and Results
 * view-state so the Details page can describe the offer exactly as this list
 * does — and so the link can be opened in a new tab, bookmarked or shared.
 * "Show details" remains a cheap inline disclosure for scanning without
 * leaving the list, and the provider hand-off *preview* now lives inside
 * that disclosure rather than in the action row: it opens a demonstration
 * explanation, not a hand-off, so it must not read as the card's main call
 * to action.
 */
export function ResultCard({
  offer,
  intent,
  labels,
  demonstrationNotice,
  cabinLabel,
  highlight,
  detailsHref,
}: ResultCardProps) {
  const [open, setOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const headingId = useId();
  const detailId = useId();
  const handoffDialogId = useId();
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const highlightCopy = highlight ? labels.highlights[highlight] : null;

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
        <div className="flex flex-wrap items-center gap-1.5">
          {highlightCopy ? (
            <Badge tone="brand" size="sm">
              {highlightCopy.badge}
            </Badge>
          ) : null}
          <Badge tone="neutral" size="sm">
            {cabinLabel}
          </Badge>
          <Badge tone="info" size="sm">
            {offer.isDemonstration
              ? labels.demoOffer
              : labels.livePreview.offerBadge}
          </Badge>
        </div>
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

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge
          tone={offer.baggage.carryOnIncluded ? "success" : "neutral"}
          size="sm"
        >
          {labels.card.carryOnIncluded}
        </Badge>
        <Badge
          tone={offer.baggage.checkedBagIncluded ? "success" : "neutral"}
          size="sm"
        >
          {offer.baggage.checkedBagIncluded
            ? labels.card.checkedBagIncluded
            : labels.card.checkedBagNotIncluded}
        </Badge>
        <Badge tone={offer.fare.refundable ? "success" : "neutral"} size="sm">
          {offer.fare.refundable
            ? labels.card.refundable
            : labels.card.nonRefundable}
        </Badge>
        <Badge tone={offer.fare.changeable ? "success" : "neutral"} size="sm">
          {offer.fare.changeable
            ? labels.card.changesPermitted
            : labels.card.changesNotPermitted}
        </Badge>
      </div>

      {highlightCopy ? (
        <p className="border-brand-150 bg-brand-25 text-foreground-secondary rounded-xl border px-3 py-2.5 text-sm leading-relaxed">
          <span className="text-brand-ink-strong font-semibold">
            {labels.highlights.sectionLabel}
          </span>{" "}
          {highlightCopy.explanation}
        </p>
      ) : null}

      <div className="border-border flex flex-wrap items-end justify-between gap-3 border-t pt-4">
        <div>
          <p className="text-foreground text-lg font-bold sm:text-xl">
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
            {offer.isDemonstration
              ? labels.card.demonstrationTotal
              : labels.livePreview.totalLabel}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
          {/* A real internal link, not a button with an onClick: middle-click,
              Cmd/Ctrl-click and "open in new tab" all have to work, and the
              Details route is a genuine shareable address rather than a
              client-only view. */}
          <ButtonLink href={detailsHref} variant="primary">
            {labels.viewFlightDetails}
          </ButtonLink>
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

          {/* The provider preview lives inside the expanded disclosure, not
              in the card's action row: it opens a demonstration explanation,
              not a real hand-off, so it must never read as the card's
              primary call to action. "View flight details" is. */}
          <div>
            <Button
              variant="secondary"
              aria-haspopup="dialog"
              aria-expanded={handoffOpen}
              aria-controls={handoffDialogId}
              onClick={() => setHandoffOpen(true)}
            >
              {labels.outbound.cta}
            </Button>
          </div>
        </div>
      ) : null}

      <ProviderHandoffModal
        dialogId={handoffDialogId}
        open={handoffOpen}
        onClose={() => setHandoffOpen(false)}
        offer={offer}
        intent={intent}
        labels={labels}
        demonstrationNotice={demonstrationNotice}
      />
    </Card>
  );
}
