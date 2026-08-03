import "../../server-only";

import type { FlightOffer } from "../../../features/flights/flight-offer-types";

/**
 * Turns validated per-provider offers into the single canonical list the rest
 * of GTAI consumes.
 *
 * "Normalization" here is deliberately narrow, because the canonical model is
 * already the only shape that got through validation. What this module
 * actually owns is the *aggregation* policy: how several providers' lists
 * become one list, in an order that does not depend on which provider
 * happened to answer first.
 *
 * It adds nothing. No provider id is stamped onto an offer, no price-freshness
 * timestamp is invented (there is no live price to be fresh), no booking or
 * affiliate URL is attached, and no commission field exists. Downstream —
 * Filters, Sort, Highlights, Details — therefore needs no provider-specific
 * branch anywhere, which is the property that makes a future second provider
 * a configuration change rather than a rewrite.
 */

/**
 * Deterministic ordering, so the same search yields the same list regardless
 * of network timing or provider scheduling. Price first (the dimension a
 * traveler most often means by "cheapest"), then total duration, then the
 * offer id as a total-order tiebreak.
 *
 * This is a *stable canonical order*, not a ranking: the Results page still
 * applies its own Sort, and "Best" is computed by the existing shared ranking
 * module. Nothing commercial participates here.
 */
function compareCanonical(a: FlightOffer, b: FlightOffer): number {
  if (a.totalPrice !== b.totalPrice) return a.totalPrice - b.totalPrice;
  const durationDelta =
    a.rankingMetadata.totalDurationMinutes - b.rankingMetadata.totalDurationMinutes;
  if (durationDelta !== 0) return durationDelta;
  return a.id.localeCompare(b.id);
}

/**
 * Merges every provider's validated offers into one canonical list.
 *
 * Duplicate ids across providers are dropped rather than merged: two
 * providers claiming the same GTAI offer id is a defect, and keeping both
 * would break the id→offer resolution the Details page depends on. The first
 * occurrence in deterministic provider order wins, so which one survives is
 * itself reproducible.
 */
export function normalizeProviderOffers(
  perProvider: readonly (readonly FlightOffer[])[],
  maximumTotalOffers: number,
): readonly FlightOffer[] {
  const merged: FlightOffer[] = [];
  const seen = new Set<string>();

  for (const providerOffers of perProvider) {
    for (const offer of providerOffers) {
      if (seen.has(offer.id)) continue;
      seen.add(offer.id);
      merged.push(offer);
    }
  }

  merged.sort(compareCanonical);
  // A hard ceiling applied after ordering, so truncation removes the least
  // relevant tail rather than whichever provider answered last.
  return merged.length > maximumTotalOffers
    ? merged.slice(0, maximumTotalOffers)
    : merged;
}
