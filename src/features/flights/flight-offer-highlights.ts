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

function compareTuples(a: readonly number[], b: readonly number[]): number {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

/**
 * The offer with the strictly lowest `rank(offer)` tuple across the given
 * set — `null` if two or more offers tie for lowest. Offer id is never
 * consulted: a tie on the user-facing metric always means "no claim," never
 * an arbitrary pick. Order-independent — every offer is compared directly
 * against the current best, so the result never depends on the input
 * array's order.
 */
function pickUniqueBestBy(
  offers: readonly FlightOffer[],
  rank: (offer: FlightOffer) => readonly number[],
): FlightOffer | null {
  let best: FlightOffer | null = null;
  let bestRank: readonly number[] | null = null;
  let tie = false;
  for (const offer of offers) {
    const candidate = rank(offer);
    if (best === null || compareTuples(candidate, bestRank!) < 0) {
      best = offer;
      bestRank = candidate;
      tie = false;
    } else if (compareTuples(candidate, bestRank!) === 0) {
      tie = true;
    }
  }
  return tie ? null : best;
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
 * At most one highlight per offer. Every category's winner is determined
 * **once**, against the complete displayed set — never against whatever
 * offers happen to remain after a higher-priority label was assigned. That
 * distinction matters: an offer that is genuinely cheapest, fastest, has
 * the fewest stops, *and* the best departure time must never make a worse
 * offer look like the "Better departure time" pick just because the real
 * winner already carries a different label. Priority (Cheapest > Fastest >
 * Fewer stops > Better departure time > Balanced) only decides which single
 * label an offer that truly wins more than one category keeps — it never
 * hands a category to a runner-up. If the true winner of a category is
 * already labeled from a higher-priority category, that category is simply
 * left unawarded for this offer set, not reassigned.
 *
 * A category is only ever awarded when its true winner is unique — two
 * offers tied on price, duration, stops, the departure preference tuple, or
 * the Best score all result in that category being left unawarded. The
 * offer id is never used to break a tie for the purpose of awarding a
 * label (it may still be used elsewhere, e.g. Sort's own tiebreaker, but
 * never here) — a tied metric is never turned into a comparative claim.
 *
 * Requires at least two offers: a single result has nothing to be compared
 * against, so no highlight is awarded.
 */
export function computeHighlights(
  offers: readonly FlightOffer[],
): ReadonlyMap<string, HighlightKind> {
  const highlights = new Map<string, HighlightKind>();
  if (offers.length < 2) return highlights;

  const bounds = computeRankingBounds(offers);

  const winners: Record<HighlightKind, FlightOffer | null> = {
    cheapest: pickUniqueBestBy(offers, (offer) => [offer.totalPrice]),
    fastest: pickUniqueBestBy(offers, (offer) => [
      offer.rankingMetadata.totalDurationMinutes,
    ]),
    fewerStops: pickUniqueBestBy(offers, (offer) => [
      offer.rankingMetadata.totalStopCount,
    ]),
    betterDeparture: pickUniqueBestBy(offers, (offer) => [
      DEPARTURE_BUCKET_RANK[departureTimeBucketForOffer(offer)],
      outboundItinerary(offer).departure.epochMinutes,
    ]),
    balanced: pickUniqueBestBy(offers, (offer) => [-bestScore(offer, bounds)]),
  };

  const priorityOrder: readonly HighlightKind[] = [
    "cheapest",
    "fastest",
    "fewerStops",
    "betterDeparture",
    "balanced",
  ];
  for (const kind of priorityOrder) {
    const winner = winners[kind];
    if (!winner) continue;
    // The true winner of this category already carries a higher-priority
    // label — leave the category unawarded rather than handing it to
    // whichever offer happens to be second.
    if (highlights.has(winner.id)) continue;
    highlights.set(winner.id, kind);
  }

  return highlights;
}
