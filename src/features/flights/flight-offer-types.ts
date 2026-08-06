import type { CurrencyCode } from "../../config/currencies";
import type { IsoDate } from "../dates/date-types";
import type { CabinClass } from "./search-intent-types";

/**
 * A single instant, carried three ways: the UTC epoch minute (the only value
 * chronology comparisons or arithmetic may use), and the local calendar date
 * and wall-clock time *at the airport this value belongs to* — derived from
 * the epoch minute and that airport's IANA zone, never the other way around.
 */
export interface LocalDateTime {
  readonly date: IsoDate;
  /** 24-hour `"HH:mm"`, local to the relevant airport. */
  readonly time: string;
  /** UTC minutes since the Unix epoch — the authoritative instant. */
  readonly epochMinutes: number;
}

/** Original, unmistakably fictional aircraft categories — never a real model name. */
export type AircraftType = "widebody" | "narrowbody" | "regionalJet";

export interface FlightSegment {
  readonly id: string;
  /** Internal fictional carrier id, e.g. `"aurora"` — never a real airline designator. */
  readonly carrierId: string;
  readonly carrierName: string;
  /** Fictional, unmistakably demonstration-only, e.g. `"DEMO-AUR-483"`. */
  readonly flightNumber: string;
  readonly originCode: string;
  readonly destinationCode: string;
  readonly departure: LocalDateTime;
  readonly arrival: LocalDateTime;
  readonly durationMinutes: number;
  readonly aircraftType: AircraftType;
  readonly cabinClass: CabinClass;
}

export interface Layover {
  readonly airportCode: string;
  readonly durationMinutes: number;
}

export type ItineraryDirection = "outbound" | "inbound";

export interface FlightItinerary {
  readonly direction: ItineraryDirection;
  readonly segments: readonly FlightSegment[];
  readonly departure: LocalDateTime;
  readonly arrival: LocalDateTime;
  readonly durationMinutes: number;
  readonly stopCount: number;
  readonly layovers: readonly Layover[];
}

export interface BaggageSummary {
  readonly carryOnIncluded: boolean;
  readonly checkedBagIncluded: boolean;
}

export interface FareSummary {
  readonly refundable: boolean;
  readonly changeable: boolean;
}

/**
 * Denormalized totals used by sorting. Deliberately excludes anything
 * commercial — no commission, no provider weight — so "Best" can be computed
 * from this object alone and still be honest.
 */
export interface FlightOfferRankingMetadata {
  readonly totalDurationMinutes: number;
  readonly totalStopCount: number;
}

/**
 * A provider-independent flight offer. Every price, schedule and identifier
 * here is generated locally for interface demonstration — `isDemonstration`
 * is always `true`, and nothing on this type is a provider payload or a real
 * booking reference.
 */
export interface FlightOffer {
  readonly id: string;
  readonly currency: CurrencyCode;
  readonly totalPrice: number;
  readonly pricePerTraveler: number;
  /** One entry for one-way, two (outbound, inbound) for round trip. */
  readonly itineraries: readonly FlightItinerary[];
  readonly validatingCarrierId: string;
  readonly validatingCarrierName: string;
  readonly operatingCarrierNames: readonly string[];
  /** Fictional demonstration booking provider — never a real travel agency. */
  readonly provider: string;
  readonly baggage: BaggageSummary;
  readonly fare: FareSummary;
  readonly rankingMetadata: FlightOfferRankingMetadata;
  readonly isDemonstration: boolean;
}
