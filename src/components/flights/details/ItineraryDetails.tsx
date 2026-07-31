import type { Dictionary } from "@/i18n/get-dictionary";
import type { FlightItinerary } from "@/features/flights/flight-offer-types";
import {
  formatDayOffset,
  formatDurationMinutes,
  formatLocalDate,
  formatStopCount,
} from "@/features/flights/flight-offer-formatting";
import { airportName } from "@/features/flights/details/flight-details-formatting";
import { Card } from "@/components/ui/Card";
import { RouteArrow } from "@/components/flights/RouteArrow";
import { SegmentTimeline } from "./SegmentTimeline";

interface ItineraryDetailsProps {
  itinerary: FlightItinerary;
  labels: Dictionary["flightDetails"];
  resultsLabels: Dictionary["flightResults"];
  locale: string;
  cabinLabel: string;
  headingId: string;
}

/**
 * One direction of the trip: a compact overview line, then the full
 * chronological segment/layover timeline.
 *
 * Outbound is always rendered before Return by the caller, and this
 * component never reorders anything based on direction — under RTL the
 * layout mirrors visually while the DOM keeps departure before arrival, so
 * screen readers still hear the journey in the order it happens.
 */
export function ItineraryDetails({
  itinerary,
  labels,
  resultsLabels,
  locale,
  cabinLabel,
  headingId,
}: ItineraryDetailsProps) {
  const durationLabels = {
    hour: resultsLabels.duration.hourUnit,
    minute: resultsLabels.duration.minuteUnit,
  };
  const firstSegment = itinerary.segments[0];
  const lastSegment = itinerary.segments[itinerary.segments.length - 1];
  const dayOffset = formatDayOffset(
    itinerary.departure,
    itinerary.arrival,
    locale,
    resultsLabels.dayOffset,
  );
  const directionLabel =
    itinerary.direction === "outbound"
      ? labels.itinerary.outbound
      : labels.itinerary.inbound;

  return (
    <Card as="section" variant="outline" padding="md" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-foreground text-base font-semibold">
        {directionLabel}
        <span className="text-foreground-muted ms-2 text-sm font-normal">
          <bdi dir="auto">{formatLocalDate(itinerary.departure, locale)}</bdi>
        </span>
      </h2>

      <div className="border-border mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-3">
        <bdi dir="ltr" className="text-foreground text-base font-semibold">
          {itinerary.departure.time} {firstSegment.originCode}
        </bdi>
        <RouteArrow />
        <bdi dir="ltr" className="text-foreground text-base font-semibold">
          {itinerary.arrival.time} {lastSegment.destinationCode}
        </bdi>
        {dayOffset ? (
          <sup className="text-foreground-muted text-[0.65rem] font-semibold">
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
            direct: resultsLabels.card.direct,
            oneStop: resultsLabels.card.oneStop,
            nStops: resultsLabels.card.nStops,
          })}
        </span>
      </div>

      {/* Origin stays first in the DOM and destination second; the shared
          RouteArrow mirrors visually under RTL, so the arrow still points
          from origin toward destination without reordering the document.
          Each name is isolated on its own so an English fallback inside a
          Persian or Arabic page cannot drag the row's direction with it. */}
      <p className="text-foreground-secondary mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        <bdi dir="auto">{airportName(firstSegment.originCode, locale)}</bdi>
        <RouteArrow />
        <bdi dir="auto">{airportName(lastSegment.destinationCode, locale)}</bdi>
      </p>

      <h3 className="text-foreground-muted mt-4 text-xs font-semibold tracking-wide uppercase">
        {labels.itinerary.segmentDetails}
      </h3>
      <div className="mt-2">
        <SegmentTimeline
          itinerary={itinerary}
          labels={labels}
          resultsLabels={resultsLabels}
          locale={locale}
          cabinLabel={cabinLabel}
        />
      </div>
    </Card>
  );
}
