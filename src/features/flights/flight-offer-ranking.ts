import type { FlightOffer } from "./flight-offer-types";

export type SortOption = "best" | "cheapest" | "fastest";

export const SORT_OPTIONS: readonly SortOption[] = ["best", "cheapest", "fastest"];

const WEIGHT_PRICE = 0.5;
const WEIGHT_DURATION = 0.3;
const WEIGHT_STOPS = 0.2;

export interface RankingBounds {
  readonly minPrice: number;
  readonly maxPrice: number;
  readonly minDuration: number;
  readonly maxDuration: number;
  readonly minStops: number;
  readonly maxStops: number;
}

/** Min/max read fresh from the current result set — Best never uses a fixed scale. */
export function computeRankingBounds(
  offers: readonly FlightOffer[],
): RankingBounds {
  const prices = offers.map((offer) => offer.totalPrice);
  const durations = offers.map(
    (offer) => offer.rankingMetadata.totalDurationMinutes,
  );
  const stops = offers.map((offer) => offer.rankingMetadata.totalStopCount);
  return {
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    minDuration: Math.min(...durations),
    maxDuration: Math.max(...durations),
    minStops: Math.min(...stops),
    maxStops: Math.max(...stops),
  };
}

/** 0 (worst in this set) to 1 (best), lower raw value is always better. */
function desirability(value: number, min: number, max: number): number {
  if (max <= min) return 1;
  return 1 - (value - min) / (max - min);
}

/**
 * The transparent, non-commercial "Best" score.
 *
 * Reads only `totalPrice` and `rankingMetadata` — nothing about `provider`,
 * `validatingCarrierName` or any commission ever enters the formula. Two
 * offers with identical price, duration and stop count always score
 * identically no matter which provider or carrier they carry.
 */
export function bestScore(offer: FlightOffer, bounds: RankingBounds): number {
  const price = desirability(offer.totalPrice, bounds.minPrice, bounds.maxPrice);
  const duration = desirability(
    offer.rankingMetadata.totalDurationMinutes,
    bounds.minDuration,
    bounds.maxDuration,
  );
  const stops = desirability(
    offer.rankingMetadata.totalStopCount,
    bounds.minStops,
    bounds.maxStops,
  );
  return price * WEIGHT_PRICE + duration * WEIGHT_DURATION + stops * WEIGHT_STOPS;
}

function compareIds(a: FlightOffer, b: FlightOffer): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Sorts a fixed result set without ever adding, dropping or deduplicating an
 * offer — the array's length and membership are identical before and after.
 * Every comparator ends in an offer-ID tiebreaker, so the order is fully
 * deterministic even when two offers are otherwise indistinguishable.
 */
export function sortOffers(
  offers: readonly FlightOffer[],
  sort: SortOption,
): readonly FlightOffer[] {
  const copy = [...offers];

  if (sort === "cheapest") {
    return copy.sort((a, b) => {
      if (a.totalPrice !== b.totalPrice) return a.totalPrice - b.totalPrice;
      if (
        a.rankingMetadata.totalDurationMinutes !==
        b.rankingMetadata.totalDurationMinutes
      ) {
        return (
          a.rankingMetadata.totalDurationMinutes -
          b.rankingMetadata.totalDurationMinutes
        );
      }
      return compareIds(a, b);
    });
  }

  if (sort === "fastest") {
    return copy.sort((a, b) => {
      if (
        a.rankingMetadata.totalDurationMinutes !==
        b.rankingMetadata.totalDurationMinutes
      ) {
        return (
          a.rankingMetadata.totalDurationMinutes -
          b.rankingMetadata.totalDurationMinutes
        );
      }
      if (a.totalPrice !== b.totalPrice) return a.totalPrice - b.totalPrice;
      return compareIds(a, b);
    });
  }

  const bounds = computeRankingBounds(offers);
  const scored = copy.map((offer) => ({ offer, score: bestScore(offer, bounds) }));
  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.offer.totalPrice !== b.offer.totalPrice)
      return a.offer.totalPrice - b.offer.totalPrice;
    return compareIds(a.offer, b.offer);
  });
  return scored.map((entry) => entry.offer);
}
