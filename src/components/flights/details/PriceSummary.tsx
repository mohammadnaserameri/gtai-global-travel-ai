import type { Dictionary } from "@/i18n/get-dictionary";
import type { FlightOffer } from "@/features/flights/flight-offer-types";
import type { FlightSearchIntent } from "@/features/flights/search-intent-types";
import {
  formatLocaleNumber,
  formatOfferPrice,
} from "@/features/flights/flight-offer-formatting";
import { Card } from "@/components/ui/Card";

interface PriceSummaryProps {
  offer: FlightOffer;
  intent: FlightSearchIntent;
  labels: Dictionary["flightDetails"];
  headingId: string;
}

/**
 * The demonstration total, the per-traveler amount, and nothing else.
 *
 * `FlightOffer` models exactly two monetary values, so exactly two are
 * shown. There is deliberately no tax/fee/surcharge/commission breakdown,
 * no crossed-out "was" price, no savings percentage and no scarcity or
 * urgency language — none of that exists in the data, and inventing a
 * breakdown would be a fabricated price claim. The closing notice states
 * the limitation outright.
 *
 * The chargeable-traveler count mirrors the repository's own rule (adults +
 * children + infants in seat; lap infants are not charged), so the
 * per-traveler figure shown always reconciles with the total.
 */
export function PriceSummary({
  offer,
  intent,
  labels,
  headingId,
}: PriceSummaryProps) {
  const price = labels.price;
  const locale = intent.locale;
  const chargeableTravelers = Math.max(
    1,
    intent.travelers.adults +
      intent.travelers.children +
      intent.travelers.infantsInSeat,
  );

  return (
    <Card as="section" variant="outline" padding="md" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-foreground text-base font-semibold">
        {price.heading}
      </h2>

      <p className="text-foreground mt-3 text-2xl font-bold">
        {/* Intl embeds its own directional marks around the localized digits
            and currency symbol for fa/ar — `dir="auto"` lets the formatted
            string keep them rather than overriding with a forced direction. */}
        <bdi dir="auto">
          {formatOfferPrice(offer.totalPrice, offer.currency, locale)}
        </bdi>
      </p>
      <p className="text-foreground-muted text-xs">{price.demonstrationTotal}</p>

      <dl className="border-border mt-4 border-t pt-3">
        <div className="flex items-start justify-between gap-4 py-1.5">
          <dt className="text-foreground-secondary text-sm">{price.perTraveler}</dt>
          <dd className="text-foreground text-sm font-medium">
            <bdi dir="auto">
              {formatOfferPrice(offer.pricePerTraveler, offer.currency, locale)}
            </bdi>
          </dd>
        </div>
        <div className="flex items-start justify-between gap-4 py-1.5">
          <dt className="text-foreground-secondary text-sm">{price.travelers}</dt>
          <dd className="text-foreground text-sm font-medium">
            <bdi dir="auto">{formatLocaleNumber(chargeableTravelers, locale)}</bdi>
          </dd>
        </div>
        <div className="flex items-start justify-between gap-4 py-1.5">
          <dt className="text-foreground-secondary text-sm">{price.currency}</dt>
          <dd className="text-foreground text-sm font-medium">
            <bdi dir="ltr">{offer.currency}</bdi>
          </dd>
        </div>
      </dl>

      <p className="text-foreground-muted mt-3 text-xs leading-relaxed">
        {price.noBreakdownNotice}
      </p>
    </Card>
  );
}
