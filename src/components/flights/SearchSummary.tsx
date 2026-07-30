import type { Dictionary } from "@/i18n/get-dictionary";
import type { FlightSearchIntent } from "@/features/flights/search-intent-types";
import type { LocationSnapshot } from "@/features/flights/search-intent-types";
import { formatFieldDate } from "@/features/dates/date-formatting";
import {
  formatLocaleNumber,
  formatTemplate,
} from "@/features/flights/flight-offer-formatting";
import { Card } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";

interface SearchSummaryProps {
  intent: FlightSearchIntent;
  labels: Dictionary["flightResults"];
  cabinLabel: string;
  flexibilityLabel: string;
  editSearchHref: string;
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

/** A localized place name and its code, isolated separately so a Persian or Arabic name never renders forced-LTR. */
function LocationLabel({ location }: { location: LocationSnapshot }) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1">
      <bdi dir="auto" className="truncate">
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

/**
 * The compact route/date/traveler recap at the top of the Results page.
 *
 * Origin and destination stay in DOM/reading order (origin, then destination)
 * regardless of page direction — under RTL, `flex-row` already lays that out
 * visually right-to-left on its own, so origin correctly appears on the
 * visual right with the arrow (mirrored via `rtl:-scale-x-100`, the same
 * pattern the Date Picker's month chevrons use) pointing toward destination
 * on the visual left. Nothing here reorders the DOM to "fix" that — doing so
 * would break the reading order chronology conveys to assistive tech.
 */
export function SearchSummary({
  intent,
  labels,
  cabinLabel,
  flexibilityLabel,
  editSearchHref,
}: SearchSummaryProps) {
  const departureLabel = formatFieldDate(intent.departureDate, intent.locale);
  const dateLine =
    intent.tripType === "roundTrip" && intent.returnDate
      ? `${departureLabel} – ${formatFieldDate(intent.returnDate, intent.locale)}`
      : departureLabel;

  return (
    <Card
      variant="outline"
      padding="md"
      className="flex flex-wrap items-center justify-between gap-4"
    >
      <div className="min-w-0">
        <p className="text-foreground flex items-center gap-2 text-base font-semibold">
          <LocationLabel location={intent.origin} />
          <span
            aria-hidden="true"
            className="text-foreground-muted shrink-0 rtl:-scale-x-100"
          >
            →
          </span>
          <LocationLabel location={intent.destination} />
        </p>
        {/* The date line is a localized phrase (month names, digits) — never
            forced LTR, unlike the pure codes above. */}
        <p className="text-foreground-secondary mt-1 text-sm">{dateLine}</p>
        <p className="text-foreground-muted mt-0.5 text-xs">
          {travelerSummary(intent, labels)} · {cabinLabel} · {flexibilityLabel} ·{" "}
          <bdi dir="ltr">{intent.currency}</bdi>
        </p>
      </div>

      <ButtonLink href={editSearchHref} variant="secondary">
        {labels.editSearch}
      </ButtonLink>
    </Card>
  );
}
