import type { Dictionary } from "@/i18n/get-dictionary";
import type {
  FlightSearchIntent,
  LocationSnapshot,
} from "@/features/flights/search-intent-types";
import { formatFieldDate } from "@/features/dates/date-formatting";
import {
  formatLocaleNumber,
  formatTemplate,
} from "@/features/flights/flight-offer-formatting";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { RouteArrow } from "@/components/flights/RouteArrow";

interface FlightDetailsSummaryProps {
  intent: FlightSearchIntent;
  resultsLabels: Dictionary["flightResults"];
  cabinLabel: string;
  flexibilityLabel: string;
  tripTypeLabel: string;
}

/** A localized place name and its code, isolated separately — the same rule the Results summary follows. */
function LocationLabel({ location }: { location: LocationSnapshot }) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1">
      <bdi dir="auto" className="min-w-0">
        {location.displayName}
      </bdi>
      {location.displayCode ? (
        <bdi dir="ltr" className="text-foreground-muted shrink-0 text-sm">
          ({location.displayCode})
        </bdi>
      ) : null}
    </span>
  );
}

function travelerSummary(
  intent: FlightSearchIntent,
  labels: Dictionary["flightResults"],
): string {
  const locale = intent.locale;
  const parts: string[] = [
    intent.travelers.adults === 1
      ? labels.summary.adultsOne
      : formatTemplate(labels.summary.adultsOther, {
          count: formatLocaleNumber(intent.travelers.adults, locale),
        }),
  ];
  if (intent.travelers.children > 0) {
    parts.push(
      intent.travelers.children === 1
        ? labels.summary.childrenOne
        : formatTemplate(labels.summary.childrenOther, {
            count: formatLocaleNumber(intent.travelers.children, locale),
          }),
    );
  }
  const infants = intent.travelers.infantsInSeat + intent.travelers.infantsOnLap;
  if (infants > 0) {
    parts.push(
      infants === 1
        ? labels.summary.infantsOne
        : formatTemplate(labels.summary.infantsOther, {
            count: formatLocaleNumber(infants, locale),
          }),
    );
  }
  return parts.join(", ");
}

/**
 * The route/date/traveler recap under the Details heading.
 *
 * Origin stays first in the DOM and destination second, always — under RTL
 * the row lays out visually right-to-left on its own and `RouteArrow`
 * mirrors, so the arrow still points from origin toward destination without
 * anything reordering the document. The date line and traveler line are
 * whole localized phrases and are never forced LTR; only the codes and the
 * currency are.
 */
export function FlightDetailsSummary({
  intent,
  resultsLabels,
  cabinLabel,
  flexibilityLabel,
  tripTypeLabel,
}: FlightDetailsSummaryProps) {
  const departureLabel = formatFieldDate(intent.departureDate, intent.locale);
  const dateLine =
    intent.tripType === "roundTrip" && intent.returnDate
      ? `${departureLabel} – ${formatFieldDate(intent.returnDate, intent.locale)}`
      : departureLabel;

  return (
    <Card variant="outline" padding="md" className="flex flex-col gap-3">
      <p className="text-foreground flex flex-wrap items-center gap-2 text-base font-semibold sm:text-lg">
        <LocationLabel location={intent.origin} />
        <RouteArrow />
        <LocationLabel location={intent.destination} />
      </p>

      <p className="text-foreground-secondary text-sm">{dateLine}</p>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral" size="sm">
          {tripTypeLabel}
        </Badge>
        <Badge tone="neutral" size="sm">
          {cabinLabel}
        </Badge>
        <Badge tone="neutral" size="sm">
          {flexibilityLabel}
        </Badge>
        <Badge tone="info" size="sm">
          {resultsLabels.demoOffer}
        </Badge>
      </div>

      <p className="text-foreground-muted text-xs">
        {travelerSummary(intent, resultsLabels)} ·{" "}
        <bdi dir="ltr">{intent.currency}</bdi>
      </p>
    </Card>
  );
}
