"use client";

import type { Dictionary } from "@/i18n/get-dictionary";
import type { FlightOffer } from "@/features/flights/flight-offer-types";
import type { FlightSearchIntent } from "@/features/flights/search-intent-types";
import {
  formatOfferPrice,
  formatTemplate,
} from "@/features/flights/flight-offer-formatting";
import { Button } from "@/components/ui/Button";
import { ModalShell } from "@/components/ui/ModalShell";

interface ProviderHandoffModalProps {
  open: boolean;
  onClose: () => void;
  offer: FlightOffer;
  intent: FlightSearchIntent;
  labels: Dictionary["flightResults"];
}

/**
 * The affiliate outbound placeholder: what a "View deal" / "Continue to
 * provider" CTA opens instead of a real redirect. Everything shown here
 * comes from the already-loaded `offer` and `intent` props — no network
 * request, no page navigation, no real outbound link. Closing it returns
 * exactly to the Results page the visitor was already on; nothing about the
 * URL, the offer set or the Search Intent changes because this opened or
 * closed.
 */
export function ProviderHandoffModal({
  open,
  onClose,
  offer,
  intent,
  labels,
}: ProviderHandoffModalProps) {
  const outbound = labels.outbound;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={outbound.modalTitle}
      closeLabel={outbound.close}
      description={outbound.modalDescription}
    >
      <div className="flex flex-col gap-4">
        <div className="border-border bg-surface-subtle flex flex-col gap-1 rounded-xl border p-4">
          <p className="text-foreground text-sm font-semibold">
            <bdi dir="auto">{offer.validatingCarrierName}</bdi>
          </p>
          <p className="text-foreground-secondary text-sm">
            {formatTemplate(labels.card.routeHeading, {
              origin: intent.origin.displayName,
              destination: intent.destination.displayName,
            })}
          </p>
          <p className="text-foreground text-base font-bold">
            <bdi dir="auto">
              {formatOfferPrice(offer.totalPrice, offer.currency, intent.locale)}
            </bdi>
          </p>
          <p className="text-foreground-muted text-xs">
            {labels.card.demonstrationTotal}
          </p>
        </div>

        <ul className="flex flex-col gap-2.5">
          {outbound.points.map((point) => (
            <li
              key={point}
              className="text-foreground-secondary flex items-start gap-2.5 text-sm leading-relaxed"
            >
              <span
                aria-hidden="true"
                className="bg-brand-500 mt-2 size-1.5 shrink-0 rounded-full"
              />
              {point}
            </li>
          ))}
        </ul>

        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            {outbound.close}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
