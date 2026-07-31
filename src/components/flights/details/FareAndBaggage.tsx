import type { Dictionary } from "@/i18n/get-dictionary";
import type { FlightOffer } from "@/features/flights/flight-offer-types";
import { Card } from "@/components/ui/Card";
import { CheckIcon, CloseIcon } from "@/components/ui/icons";

interface FareAndBaggageProps {
  offer: FlightOffer;
  labels: Dictionary["flightDetails"];
  cabinLabel: string;
  headingId: string;
}

/**
 * One fare/baggage fact. The included/not-included state is carried by the
 * text itself, with the icon purely decorative — meaning is never conveyed
 * by colour or glyph alone.
 */
function FareRow({
  term,
  value,
  included,
}: {
  term: string;
  value: string;
  included?: boolean;
}) {
  return (
    <div className="border-border flex items-start justify-between gap-4 border-b py-2.5 last:border-b-0">
      <dt className="text-foreground-secondary text-sm">{term}</dt>
      <dd className="text-foreground flex items-center gap-1.5 text-sm font-medium">
        {included === undefined ? null : (
          <span
            aria-hidden="true"
            className={included ? "text-success" : "text-foreground-muted"}
          >
            {included ? <CheckIcon size={14} /> : <CloseIcon size={14} />}
          </span>
        )}
        {value}
      </dd>
    </div>
  );
}

/**
 * Fare and baggage, strictly limited to what `FlightOffer` actually models:
 * cabin class, carry-on, checked bag, refundability and changeability.
 *
 * No baggage weight, dimension, change fee, cancellation fee, fare-brand
 * name, seat-selection or meal information is shown, because none of it
 * exists in the demonstration data — inventing any of it would be a
 * fabricated commercial term. The closing notice says so explicitly rather
 * than leaving the omission ambiguous.
 */
export function FareAndBaggage({
  offer,
  labels,
  cabinLabel,
  headingId,
}: FareAndBaggageProps) {
  const fare = labels.fare;

  return (
    <Card as="section" variant="outline" padding="md" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-foreground text-base font-semibold">
        {fare.heading}
      </h2>

      <dl className="mt-3">
        <FareRow term={fare.cabinClass} value={cabinLabel} />
        <FareRow
          term={fare.carryOn}
          value={offer.baggage.carryOnIncluded ? fare.included : fare.notIncluded}
          included={offer.baggage.carryOnIncluded}
        />
        <FareRow
          term={fare.checkedBag}
          value={
            offer.baggage.checkedBagIncluded ? fare.included : fare.notIncluded
          }
          included={offer.baggage.checkedBagIncluded}
        />
        <FareRow
          term={fare.conditions}
          value={offer.fare.refundable ? fare.refundable : fare.nonRefundable}
          included={offer.fare.refundable}
        />
        <FareRow
          term={fare.conditions}
          value={
            offer.fare.changeable ? fare.changesPermitted : fare.changesNotPermitted
          }
          included={offer.fare.changeable}
        />
      </dl>

      <p className="text-foreground-muted mt-3 text-xs leading-relaxed">
        {fare.scopeNotice}
      </p>
    </Card>
  );
}
