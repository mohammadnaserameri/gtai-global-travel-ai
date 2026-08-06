import "../../../server-only";

import type { CurrencyCode } from "../../../../config/currencies";
import type { CabinClass } from "../../../../features/flights/search-intent-types";
import type {
  ExternalProviderActivationState,
  ExternalProviderSecretReference,
} from "../external/external-provider-types";

/** Contract identity only. This provider is not registered or runnable. */
export const DUFFEL_PROVIDER_ID = "duffel-test-contract";
export const DUFFEL_SOURCE_ATTRIBUTION = "Duffel test contract fixture";
export const DUFFEL_ACTIVATION_STATE: ExternalProviderActivationState =
  "unavailable";

/** Documented allowlist for a future transport. No shipped code calls it. */
export const DUFFEL_API_ORIGIN = "https://api.duffel.com";
export const DUFFEL_VERSION = "v2";
export const DUFFEL_CREATE_OFFER_REQUEST_PATH = "/air/offer_requests";
export const DUFFEL_LIST_OFFERS_PATH = "/air/offers";

/** A reference, never a value. V2.8-C does not resolve or read this variable. */
export const DUFFEL_ACCESS_TOKEN_REFERENCE: ExternalProviderSecretReference =
  Object.freeze({
    secretId: "duffel-access-token",
    environmentVariable: "DUFFEL_ACCESS_TOKEN",
    placement: "bearerToken",
    parameterName: "Authorization",
    required: false,
  });

export type DuffelCabinClass = "first" | "business" | "premium_economy" | "economy";

export interface DuffelRequestSlice {
  readonly origin: string;
  readonly destination: string;
  readonly departure_date: string;
}

export interface DuffelRequestPassenger {
  readonly type: "adult";
}

export interface DuffelCreateOfferRequestBody {
  readonly data: {
    readonly slices: readonly DuffelRequestSlice[];
    readonly passengers: readonly DuffelRequestPassenger[];
    readonly max_connections: 0 | 1;
    readonly cabin_class: DuffelCabinClass;
  };
}

export interface DuffelCreateOfferRequestContract {
  readonly method: "POST";
  readonly path: typeof DUFFEL_CREATE_OFFER_REQUEST_PATH;
  readonly headers: Readonly<Record<string, string>>;
  readonly query: Readonly<{
    return_offers: "false";
    supplier_timeout: "10000";
  }>;
  readonly body: DuffelCreateOfferRequestBody;
}

export type DuffelOfferSort =
  "total_amount" | "total_duration" | "-total_amount" | "-total_duration";

export interface DuffelListOffersRequestContract {
  readonly method: "GET";
  readonly path: typeof DUFFEL_LIST_OFFERS_PATH;
  readonly headers: Readonly<Record<string, string>>;
  readonly query: Readonly<{
    offer_request_id: string;
    limit: string;
    sort?: DuffelOfferSort;
    max_connections?: "0" | "1";
    after?: string;
    before?: string;
  }>;
}

/* Minimal provider response subset. No passenger identity or commerce fields. */

export interface DuffelAirport {
  readonly name: string;
  readonly iata_code: string;
  readonly city_name: string;
  readonly time_zone: string;
}

export interface DuffelCarrier {
  readonly name: string;
  readonly iata_code: string;
}

export interface DuffelBaggage {
  readonly type: string;
  readonly quantity: number;
}

export interface DuffelSegmentPassenger {
  readonly cabin_class: DuffelCabinClass;
  readonly cabin_class_marketing_name: string;
  readonly baggages: readonly DuffelBaggage[];
}

export interface DuffelSegment {
  readonly id: string;
  readonly origin: DuffelAirport;
  readonly destination: DuffelAirport;
  readonly departing_at: string;
  readonly arriving_at: string;
  readonly duration: string;
  readonly marketing_carrier: DuffelCarrier;
  readonly operating_carrier: DuffelCarrier;
  readonly marketing_carrier_flight_number: string;
  readonly operating_carrier_flight_number: string;
  readonly passengers: readonly DuffelSegmentPassenger[];
}

export interface DuffelSlice {
  readonly id: string;
  readonly origin: DuffelAirport;
  readonly destination: DuffelAirport;
  readonly duration: string;
  readonly segments: readonly DuffelSegment[];
}

export interface DuffelOfferOwner {
  readonly name: string;
  readonly iata_code: string;
}

export interface DuffelOffer {
  readonly id: string;
  readonly total_amount: string;
  readonly total_currency: string;
  readonly base_amount: string;
  readonly base_currency: string;
  readonly tax_amount: string;
  readonly tax_currency: string;
  readonly owner: DuffelOfferOwner;
  readonly slices: readonly DuffelSlice[];
  readonly expires_at: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly live_mode: boolean;
  readonly partial: boolean;
}

export interface DuffelListOffersResponse {
  readonly data: readonly DuffelOffer[];
}

export interface DuffelMappedBaggage {
  readonly carryOnIncluded: boolean;
  readonly checkedBagIncluded: boolean;
}

export interface DuffelMappedSegment {
  readonly segmentId: string;
  readonly originCode: string;
  readonly destinationCode: string;
  readonly departureAt: string;
  readonly arrivalAt: string;
  readonly durationMinutes: number;
  readonly marketingCarrierCode: string;
  readonly marketingCarrierName: string;
  readonly operatingCarrierCode: string;
  readonly operatingCarrierName: string;
  readonly marketingFlightNumber: string;
  readonly operatingFlightNumber: string;
  readonly cabinClass: CabinClass;
  readonly baggage: DuffelMappedBaggage;
}

export interface DuffelMappedLeg {
  readonly sliceId: string;
  readonly originCode: string;
  readonly destinationCode: string;
  readonly departureAt: string;
  readonly arrivalAt: string;
  readonly durationMinutes: number;
  readonly stopCount: number;
  readonly segments: readonly DuffelMappedSegment[];
}

export type DuffelMappingWarning =
  "partialOffer" | "offerCountTruncated" | "duplicateOfferDiscarded";

/** GTAI-owned server mapping. It is never returned by the current public API. */
export interface DuffelMappedOffer {
  readonly offerId: string;
  readonly providerId: typeof DUFFEL_PROVIDER_ID;
  readonly sourceAttribution: typeof DUFFEL_SOURCE_ATTRIBUTION;
  readonly providerOfferReference: string;
  readonly ownerName: string;
  readonly ownerIataCode: string;
  readonly totalAmountMinorUnits: number;
  readonly baseAmountMinorUnits: number;
  readonly taxAmountMinorUnits: number;
  readonly currency: CurrencyCode;
  readonly legs: readonly DuffelMappedLeg[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
  readonly liveMode: false;
  readonly partial: boolean;
  readonly warnings: readonly DuffelMappingWarning[];
}

export const DUFFEL_MAPPED_OFFER_FIELDS: readonly string[] = [
  "offerId",
  "providerId",
  "sourceAttribution",
  "providerOfferReference",
  "ownerName",
  "ownerIataCode",
  "totalAmountMinorUnits",
  "baseAmountMinorUnits",
  "taxAmountMinorUnits",
  "currency",
  "legs",
  "createdAt",
  "updatedAt",
  "expiresAt",
  "liveMode",
  "partial",
  "warnings",
];
