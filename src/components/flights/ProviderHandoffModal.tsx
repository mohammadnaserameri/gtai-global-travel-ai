"use client";

import type { Dictionary } from "@/i18n/get-dictionary";
import type { FlightOffer } from "@/features/flights/flight-offer-types";
import type { FlightSearchIntent } from "@/features/flights/search-intent-types";
import { formatOfferPrice } from "@/features/flights/flight-offer-formatting";
import { Button } from "@/components/ui/Button";
import { ModalShell } from "@/components/ui/ModalShell";
import { RouteArrow } from "@/components/flights/RouteArrow";

interface ProviderHandoffModalProps {
  open: boolean;
  onClose: () => void;
  offer: FlightOffer;
  intent: FlightSearchIntent;
  labels: Dictionary["flightResults"];
  /** Stable id this modal's dialog is rendered with, so the triggering CTA can reference it via `aria-controls`. */
  dialogId?: string;
}

/**
 * The affiliate outbound placeholder: what the "Preview provider hand-off"
 * CTA opens instead of a real redirect — a preview of what a future hand-off
 * would show, not an actual continuation to any provider. Everything shown
 * here comes from the already-loaded `offer` and `intent` props — no network
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
  dialogId,
}: ProviderHandoffModalProps) {
  const outbound = labels.outbound;

  return (
    <ModalShell
      id={dialogId}
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
          <p className="text-foreground-secondary flex flex-wrap items-center gap-1.5 text-sm">
            <bdi dir="auto">{intent.origin.displayName}</bdi>
            <RouteArrow />
            <bdi dir="auto">{intent.destination.displayName}</bdi>
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
