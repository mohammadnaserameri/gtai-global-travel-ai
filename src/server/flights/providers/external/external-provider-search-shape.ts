import "../../../server-only";

import type {
  CabinClass,
  FlightSearchIntent,
  FlightTripType,
  TravelerCounts,
} from "../../../../features/flights/search-intent-types";

/**
 * The provider-neutral description of a search.
 *
 * GTAI's own `FlightSearchIntent` is deliberately narrower than what providers
 * accept: it models one-way and round-trip only, because the product has no
 * multi-city leg model yet and inventing one in the intent would be a public
 * behaviour change. But a live provider contract has to be able to *express*
 * multi-city, or the first integration that supports it forces a rewrite of
 * this whole layer.
 *
 * So this module adds a strictly additive shape. `FlightSearchIntent` is
 * untouched; `deriveNeutralSearch` widens a validated intent into the neutral
 * form, and a future multi-city caller constructs the neutral form directly.
 * Nothing narrows in the other direction, so no code path can smuggle a
 * three-leg search into a two-leg product type.
 *
 * The trip shape is read from `FlightSearchIntent.tripType`, which is already a
 * proper discriminated union (`"roundTrip" | "oneWay"`). There is no cast
 * anywhere in this file — an earlier draft used one, and it was hiding nothing
 * but the author's failure to check that the field was already typed.
 */

/** Superset of `FlightTripType`. The extra member is future-only. */
export type ExternalTripShape = FlightTripType | "multiCity";

/** One directional leg. Round-trip is two legs; multi-city is three or more. */
export interface ExternalSearchLeg {
  /** IATA-style code for the origin entity. Never a provider identifier. */
  readonly originCode: string;
  readonly destinationCode: string;
  /** ISO date, `YYYY-MM-DD`. */
  readonly departureDate: string;
}

/**
 * Everything a provider is allowed to be told about a search.
 *
 * The absences are the design. There is no traveller name, no email, no
 * passport, no payment instrument, no account id, no cookie, no inbound
 * header, no IP and no user agent — not filtered out at build time, but absent
 * from the type, so a future contributor cannot add one by accident and a
 * verification sweep over the type's own fields is meaningful.
 */
export interface ExternalNeutralSearch {
  readonly tripShape: ExternalTripShape;
  /** Ordered. One entry for one-way, two for round-trip, 3..N for multi-city. */
  readonly legs: readonly ExternalSearchLeg[];
  readonly travelers: TravelerCounts;
  readonly cabinClass: CabinClass;
  readonly directOnly: boolean;
  /** ISO 3166-1 alpha-2. Which market's inventory and pricing rules apply. */
  readonly market: string;
  /** BCP-47. The language the *content* is in — what GTAI will render. */
  readonly contentLocale: string;
  /**
   * BCP-47. What the visitor asked for, which can differ from the content
   * locale on an unauthored locale. Providers negotiate on the requested value,
   * so collapsing the two would ask a provider for the wrong language.
   */
  readonly requestedLocale: string;
  /** ISO 4217. */
  readonly currency: string;
  /** Opaque, server-generated. Never derived from the search. */
  readonly requestId: string;
  /** Total milliseconds this search may consume, across retries. */
  readonly timeoutBudgetMs: number;
}

/** Legs required for a shape. `multiCity` has no fixed count, hence `null`. */
export function expectedLegCount(shape: ExternalTripShape): number | null {
  switch (shape) {
    case "oneWay":
      return 1;
    case "roundTrip":
      return 2;
    case "multiCity":
      return null;
  }
}

export type SearchShapeRejection =
  | "legCountMismatch"
  | "multiCityTooFewLegs"
  | "emptyLegs"
  | "invalidLegCode"
  | "invalidLegDate"
  | "nonChronologicalLegs";

/**
 * Validates a neutral search's internal consistency.
 *
 * Returns reasons rather than a boolean so an unsupported search produces a
 * typed failure naming what was wrong, which §5 requires instead of silent
 * coercion. Silent coercion here would be the worst option available: a
 * three-leg search quietly truncated to two returns confidently wrong prices.
 */
export function validateNeutralSearch(
  search: ExternalNeutralSearch,
): readonly SearchShapeRejection[] {
  const reasons: SearchShapeRejection[] = [];

  if (search.legs.length === 0) {
    reasons.push("emptyLegs");
    return reasons;
  }

  const expected = expectedLegCount(search.tripShape);
  if (expected !== null && search.legs.length !== expected) {
    reasons.push("legCountMismatch");
  }
  if (search.tripShape === "multiCity" && search.legs.length < 3) {
    reasons.push("multiCityTooFewLegs");
  }

  const codePattern = /^[A-Z]{3}$/;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  for (const leg of search.legs) {
    if (
      !codePattern.test(leg.originCode) ||
      !codePattern.test(leg.destinationCode)
    ) {
      reasons.push("invalidLegCode");
      break;
    }
  }
  for (const leg of search.legs) {
    if (!datePattern.test(leg.departureDate)) {
      reasons.push("invalidLegDate");
      break;
    }
  }

  // Legs must not travel backwards in time. A provider handed a return before
  // its outbound will either error or, worse, answer with something plausible.
  for (let index = 1; index < search.legs.length; index += 1) {
    const previous = search.legs[index - 1];
    const current = search.legs[index];
    if (
      datePattern.test(previous.departureDate) &&
      datePattern.test(current.departureDate) &&
      current.departureDate < previous.departureDate
    ) {
      reasons.push("nonChronologicalLegs");
      break;
    }
  }

  return reasons;
}

export interface NeutralSearchContext {
  readonly market: string;
  readonly contentLocale: string;
  readonly requestedLocale: string;
  readonly requestId: string;
  readonly timeoutBudgetMs: number;
  readonly directOnly?: boolean;
}

/**
 * Widens a validated `FlightSearchIntent` into the neutral form.
 *
 * The trip shape comes straight from `intent.tripType` — no cast, no lookup
 * table, no string comparison against a loosely-typed field. `returnDate` is
 * `IsoDate | null` and is only read on the round-trip branch, so a one-way
 * search cannot produce a second leg even if a stale return date is present.
 *
 * Airport codes prefer `iataCode` and fall back to `cityCode`: a city entity
 * has no IATA code of its own, and a provider asked for a city needs the city
 * code. `""` is returned when neither exists, which `validateNeutralSearch`
 * then rejects as `invalidLegCode` rather than sending an empty parameter.
 */
export function deriveNeutralSearch(
  intent: FlightSearchIntent,
  context: NeutralSearchContext,
): ExternalNeutralSearch {
  const originCode = intent.origin.iataCode ?? intent.origin.cityCode ?? "";
  const destinationCode =
    intent.destination.iataCode ?? intent.destination.cityCode ?? "";

  const outbound: ExternalSearchLeg = {
    originCode,
    destinationCode,
    departureDate: intent.departureDate,
  };

  const legs: ExternalSearchLeg[] = [outbound];
  if (intent.tripType === "roundTrip" && intent.returnDate !== null) {
    legs.push({
      originCode: destinationCode,
      destinationCode: originCode,
      departureDate: intent.returnDate,
    });
  }

  return {
    tripShape: intent.tripType,
    legs,
    travelers: intent.travelers,
    cabinClass: intent.cabinClass,
    directOnly: context.directOnly ?? false,
    market: context.market,
    contentLocale: context.contentLocale,
    requestedLocale: context.requestedLocale,
    currency: intent.currency,
    requestId: context.requestId,
    timeoutBudgetMs: context.timeoutBudgetMs,
  };
}

/** Total seated travellers. Lap infants are excluded — they occupy no seat. */
export function seatedTravelerCount(travelers: TravelerCounts): number {
  return travelers.adults + travelers.children + travelers.infantsInSeat;
}

export function totalTravelerCount(travelers: TravelerCounts): number {
  return seatedTravelerCount(travelers) + travelers.infantsOnLap;
}
