import type { Dictionary } from "@/i18n/get-dictionary";
import type {
  FlightItinerary,
  FlightSegment,
  Layover,
} from "@/features/flights/flight-offer-types";
import {
  aircraftLabel,
  formatDayOffset,
  formatDurationMinutes,
  formatLocalDate,
} from "@/features/flights/flight-offer-formatting";
import {
  airportName,
  buildItineraryTimeline,
} from "@/features/flights/details/flight-details-formatting";
import { RouteArrow } from "@/components/flights/RouteArrow";
import { renderTemplate } from "@/components/flights/renderTemplate";

interface SegmentTimelineProps {
  itinerary: FlightItinerary;
  labels: Dictionary["flightDetails"];
  resultsLabels: Dictionary["flightResults"];
  locale: string;
  cabinLabel: string;
}

/**
 * One airport endpoint: the local time and IATA code (LTR-isolated, since
 * both are identifiers) above the localized airport name (`dir="auto"`, so
 * an English fallback name inside a Persian or Arabic page still reads
 * correctly). The signed day offset sits *outside* the time/code isolate —
 * it is localized text, not part of the identifier.
 */
function Endpoint({
  label,
  time,
  code,
  date,
  dayOffset,
  locale,
}: {
  label: string;
  time: string;
  code: string;
  date: string;
  dayOffset: string | null;
  locale: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-foreground-muted text-[0.6875rem] font-semibold tracking-wide uppercase">
        {label}
      </span>
      <span className="flex flex-wrap items-baseline gap-1.5">
        <bdi dir="ltr" className="text-foreground text-base font-semibold">
          {time} {code}
        </bdi>
        {dayOffset ? (
          <sup className="text-foreground-muted text-[0.65rem] font-semibold">
            <bdi dir="auto">{dayOffset}</bdi>
          </sup>
        ) : null}
      </span>
      <bdi dir="auto" className="text-foreground-secondary text-sm">
        {airportName(code, locale)}
      </bdi>
      <span className="text-foreground-muted text-xs">{date}</span>
    </div>
  );
}

function SegmentEntry({
  segment,
  labels,
  resultsLabels,
  locale,
  cabinLabel,
}: {
  segment: FlightSegment;
  labels: Dictionary["flightDetails"];
  resultsLabels: Dictionary["flightResults"];
  locale: string;
  cabinLabel: string;
}) {
  const durationLabels = {
    hour: resultsLabels.duration.hourUnit,
    minute: resultsLabels.duration.minuteUnit,
  };
  const dayOffset = formatDayOffset(
    segment.departure,
    segment.arrival,
    locale,
    resultsLabels.dayOffset,
  );

  return (
    <li className="border-border bg-surface rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-foreground text-sm font-semibold">
          {/* Only the flight identifier is LTR-isolated — the localized word
              around it ("Flight" / "پرواز" / "رحلة") keeps page direction. */}
          {renderTemplate(labels.itinerary.flightLabel, {
            number: <bdi dir="ltr">{segment.flightNumber}</bdi>,
          })}
        </p>
        <span className="text-foreground-muted text-xs">{cabinLabel}</span>
      </div>

      <p className="text-foreground-muted mt-1 text-xs">
        {renderTemplate(labels.itinerary.operatedBy, {
          carrier: <bdi dir="auto">{segment.carrierName}</bdi>,
        })}
      </p>

      <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-3">
        <Endpoint
          label={labels.itinerary.depart}
          time={segment.departure.time}
          code={segment.originCode}
          date={formatLocalDate(segment.departure, locale)}
          dayOffset={null}
          locale={locale}
        />
        <span className="self-center pt-4">
          <RouteArrow />
        </span>
        <Endpoint
          label={labels.itinerary.arrive}
          time={segment.arrival.time}
          code={segment.destinationCode}
          date={formatLocalDate(segment.arrival, locale)}
          dayOffset={dayOffset}
          locale={locale}
        />
      </div>

      <p className="text-foreground-muted mt-3 text-xs">
        <bdi dir="auto">
          {formatDurationMinutes(segment.durationMinutes, locale, durationLabels)}
        </bdi>
        {" · "}
        <bdi dir="auto">
          {aircraftLabel(segment.aircraftType, resultsLabels.card.aircraft)}
        </bdi>
      </p>
    </li>
  );
}

function LayoverEntry({
  layover,
  labels,
  resultsLabels,
  locale,
}: {
  layover: Layover;
  labels: Dictionary["flightDetails"];
  resultsLabels: Dictionary["flightResults"];
  locale: string;
}) {
  const durationLabels = {
    hour: resultsLabels.duration.hourUnit,
    minute: resultsLabels.duration.minuteUnit,
  };

  return (
    <li className="border-border-strong ms-4 border-s-2 py-2 ps-4">
      <p className="text-foreground-secondary text-sm font-medium">
        {labels.itinerary.connection}
      </p>
      <p className="text-foreground-muted mt-0.5 text-xs">
        {renderTemplate(labels.itinerary.layoverAt, {
          airport: <bdi dir="auto">{airportName(layover.airportCode, locale)}</bdi>,
        })}
        {" · "}
        <bdi dir="ltr">{layover.airportCode}</bdi>
        {" · "}
        <bdi dir="auto">
          {formatDurationMinutes(layover.durationMinutes, locale, durationLabels)}
        </bdi>
      </p>
    </li>
  );
}

/**
 * One itinerary as a single chronological ordered list: flight, connection,
 * flight, … Connections sit in their real position between the flights they
 * join rather than in a separate block, so the reading order matches the
 * journey order. Nothing here invents terminal, gate, check-in or
 * minimum-connection information — only the airport, its code and the
 * modelled layover duration exist in the data, so only those are shown.
 */
export function SegmentTimeline({
  itinerary,
  labels,
  resultsLabels,
  locale,
  cabinLabel,
}: SegmentTimelineProps) {
  const timeline = buildItineraryTimeline(itinerary);

  return (
    <ol className="flex flex-col gap-3">
      {timeline.map((entry) =>
        entry.kind === "segment" ? (
          <SegmentEntry
            key={`segment-${itinerary.segments[entry.index].id}`}
            segment={itinerary.segments[entry.index]}
            labels={labels}
            resultsLabels={resultsLabels}
            locale={locale}
            cabinLabel={cabinLabel}
          />
        ) : (
          <LayoverEntry
            key={`layover-${entry.index}-${itinerary.layovers[entry.index].airportCode}`}
            layover={itinerary.layovers[entry.index]}
            labels={labels}
            resultsLabels={resultsLabels}
            locale={locale}
          />
        ),
      )}
    </ol>
  );
}
