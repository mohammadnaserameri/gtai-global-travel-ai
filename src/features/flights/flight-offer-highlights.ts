import {
  departureTimeBucketForOffer,
  outboundItinerary,
} from "./filters/flight-filter-application";
import { bestScore, computeRankingBounds } from "./flight-offer-ranking";
import type { FlightOffer } from "./flight-offer-types";

/**
 * A deterministic, non-LLM "why this option" layer — every label here is
 * computed directly from `FlightOffer` fields already shown on the card
 * (price, ranking metadata, outbound departure time). Nothing here calls a
 * model, a provider, or a clock; the same offer set always produces the same
 * highlights, in any order, on the server or the client.
 */
export type HighlightKind =
  "cheapest" | "fastest" | "fewerStops" | "betterDeparture" | "balanced";

function compareOfferIds(a: FlightOffer, b: FlightOffer): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The offer with the strictly lowest `key(offer)` — `null` if two or more
 * offers tie for lowest, since a tied "only one" claim would be false.
 * Order-independent: a full pass compares every offer against the current
 * best, so the result never depends on the input array's order.
 */
function pickUniqueMinBy(
  offers: readonly FlightOffer[],
  key: (offer: FlightOffer) => number,
): FlightOffer | null {
  let best: FlightOffer | null = null;
  let tie = false;
  for (const offer of offers) {
    if (best === null || key(offer) < key(best)) {
      best = offer;
      tie = false;
    } else if (key(offer) === key(best)) {
      tie = true;
    }
  }
  return tie ? null : best;
}

/**
 * The offer with the lowest `rank(offer)` tuple, comparing entries in order
 * and falling back to the offer id as a final, fully deterministic tiebreak
 * — so the result never depends on traversal order or on two offers being
 * otherwise indistinguishable.
 */
function pickBestBy(
  offers: readonly FlightOffer[],
  rank: (offer: FlightOffer) => readonly number[],
): FlightOffer | null {
  let best: FlightOffer | null = null;
  for (const offer of offers) {
    if (best === null) {
      best = offer;
      continue;
    }
    const candidate = rank(offer);
    const current = rank(best);
    let cmp = 0;
    for (let index = 0; index < candidate.length; index += 1) {
      if (candidate[index] !== current[index]) {
        cmp = candidate[index] - current[index];
        break;
      }
    }
    if (cmp < 0 || (cmp === 0 && compareOfferIds(offer, best) < 0)) {
      best = offer;
    }
  }
  return best;
}

/** Lower is "more typical daytime" — morning first, then afternoon, then the fringes. */
const DEPARTURE_BUCKET_RANK: Record<
  ReturnType<typeof departureTimeBucketForOffer>,
  number
> = {
  morning: 0,
  afternoon: 1,
  earlyMorning: 2,
  evening: 3,
};

/**
 * At most one highlight per offer, so a card is never cluttered with
 * overlapping badges. Priority (highest first): Cheapest, Fastest, Fewer
 * stops, Better departure time, Balanced — an offer already claimed by a
 * higher-priority label is never reconsidered for a lower one. A label is
 * only ever awarded when the offer is the *unique* best on that dimension,
 * or (for the tuple-ranked labels) the unambiguous winner once id ties are
 * broken — this module never asserts "the cheapest" when two offers are
 * tied on price.
 *
 * Requires at least two offers: a single result has nothing to be compared
 * against, so no highlight is awarded.
 */
export function computeHighlights(
  offers: readonly FlightOffer[],
): ReadonlyMap<string, HighlightKind> {
  const highlights = new Map<string, HighlightKind>();
  if (offers.length < 2) return highlights;

  const cheapest = pickUniqueMinBy(offers, (offer) => offer.totalPrice);
  if (cheapest) highlights.set(cheapest.id, "cheapest");

  const fastest = pickUniqueMinBy(
    offers,
    (offer) => offer.rankingMetadata.totalDurationMinutes,
  );
  if (fastest && !highlights.has(fastest.id)) {
    highlights.set(fastest.id, "fastest");
  }

  const fewerStops = pickUniqueMinBy(
    offers,
    (offer) => offer.rankingMetadata.totalStopCount,
  );
  if (fewerStops && !highlights.has(fewerStops.id)) {
    highlights.set(fewerStops.id, "fewerStops");
  }

  const remainingForDeparture = offers.filter((offer) => !highlights.has(offer.id));
  const betterDeparture = pickBestBy(remainingForDeparture, (offer) => [
    DEPARTURE_BUCKET_RANK[departureTimeBucketForOffer(offer)],
    outboundItinerary(offer).departure.epochMinutes,
  ]);
  if (betterDeparture) highlights.set(betterDeparture.id, "betterDeparture");

  const remainingForBalanced = offers.filter((offer) => !highlights.has(offer.id));
  if (remainingForBalanced.length > 0) {
    const bounds = computeRankingBounds(offers);
    const balanced = pickBestBy(remainingForBalanced, (offer) => [
      // Higher score is better; negate so the shared "lowest tuple wins" rule applies.
      -bestScore(offer, bounds),
    ]);
    if (balanced) highlights.set(balanced.id, "balanced");
  }

  return highlights;
}
