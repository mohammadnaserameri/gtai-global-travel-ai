import "../../../server-only";

import type { CabinClass } from "../../../../features/flights/search-intent-types";
import {
  validateNeutralSearch,
  type ExternalNeutralSearch,
} from "../external/external-provider-search-shape";
import {
  DUFFEL_CREATE_OFFER_REQUEST_PATH,
  DUFFEL_LIST_OFFERS_PATH,
  DUFFEL_VERSION,
  type DuffelCabinClass,
  type DuffelCreateOfferRequestContract,
  type DuffelListOffersRequestContract,
  type DuffelOfferSort,
} from "./duffel-contract";

export type DuffelRequestRejection =
  | "invalidSearch"
  | "unsupportedSearch"
  | "unsupportedChildren"
  | "unsupportedInfants"
  | "unsupportedCabin"
  | "invalidOfferRequestId"
  | "invalidLimit"
  | "invalidSort"
  | "invalidMaxConnections"
  | "invalidCursor";

export class DuffelRequestContractError extends Error {
  readonly reason: DuffelRequestRejection;

  constructor(reason: DuffelRequestRejection) {
    super(`Duffel request contract rejected: ${reason}`);
    this.name = "DuffelRequestContractError";
    this.reason = reason;
  }
}

const CABIN_MAP: Readonly<Record<CabinClass, DuffelCabinClass>> = Object.freeze({
  economy: "economy",
  premiumEconomy: "premium_economy",
  business: "business",
  first: "first",
});

export function mapDuffelCabinClass(value: unknown): DuffelCabinClass {
  if (
    value !== "economy" &&
    value !== "premiumEconomy" &&
    value !== "business" &&
    value !== "first"
  ) {
    throw new DuffelRequestContractError("unsupportedCabin");
  }
  return CABIN_MAP[value];
}

export function buildDuffelCreateOfferRequest(
  search: ExternalNeutralSearch,
): DuffelCreateOfferRequestContract {
  if (validateNeutralSearch(search).length > 0) {
    throw new DuffelRequestContractError("invalidSearch");
  }
  if (search.travelers.children > 0) {
    throw new DuffelRequestContractError("unsupportedChildren");
  }
  if (search.travelers.infantsInSeat > 0 || search.travelers.infantsOnLap > 0) {
    throw new DuffelRequestContractError("unsupportedInfants");
  }
  if (
    !Number.isInteger(search.travelers.adults) ||
    search.travelers.adults < 1 ||
    search.travelers.adults > 9
  ) {
    throw new DuffelRequestContractError("unsupportedSearch");
  }

  return Object.freeze({
    method: "POST",
    path: DUFFEL_CREATE_OFFER_REQUEST_PATH,
    headers: Object.freeze({
      Accept: "application/json",
      "Content-Type": "application/json",
      "Duffel-Version": DUFFEL_VERSION,
    }),
    query: Object.freeze({
      return_offers: "false",
      supplier_timeout: "10000",
    }),
    body: Object.freeze({
      data: Object.freeze({
        slices: Object.freeze(
          search.legs.map((leg) =>
            Object.freeze({
              origin: leg.originCode,
              destination: leg.destinationCode,
              departure_date: leg.departureDate,
            }),
          ),
        ),
        passengers: Object.freeze(
          Array.from({ length: search.travelers.adults }, () =>
            Object.freeze({ type: "adult" as const }),
          ),
        ),
        max_connections: search.directOnly ? (0 as const) : (1 as const),
        cabin_class: mapDuffelCabinClass(search.cabinClass),
      }),
    }),
  });
}

export interface BuildDuffelListOffersInput {
  readonly offerRequestId: string;
  readonly limit?: number;
  readonly sort?: string;
  readonly maxConnections?: number;
  readonly after?: string;
  readonly before?: string;
}

const ALLOWED_SORTS: readonly DuffelOfferSort[] = [
  "total_amount",
  "total_duration",
  "-total_amount",
  "-total_duration",
];
const OFFER_REQUEST_ID_PATTERN = /^orq_[A-Za-z0-9_]+$/;
const MAX_CURSOR_LENGTH = 512;

function validateCursor(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (
    value.length === 0 ||
    value.length > MAX_CURSOR_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new DuffelRequestContractError("invalidCursor");
  }
  return value;
}

export function buildDuffelListOffersRequest(
  input: BuildDuffelListOffersInput,
): DuffelListOffersRequestContract {
  if (!OFFER_REQUEST_ID_PATTERN.test(input.offerRequestId)) {
    throw new DuffelRequestContractError("invalidOfferRequestId");
  }
  const limit = input.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new DuffelRequestContractError("invalidLimit");
  }
  if (
    input.sort !== undefined &&
    !ALLOWED_SORTS.includes(input.sort as DuffelOfferSort)
  ) {
    throw new DuffelRequestContractError("invalidSort");
  }
  if (
    input.maxConnections !== undefined &&
    input.maxConnections !== 0 &&
    input.maxConnections !== 1
  ) {
    throw new DuffelRequestContractError("invalidMaxConnections");
  }

  const after = validateCursor(input.after);
  const before = validateCursor(input.before);
  const query: {
    offer_request_id: string;
    limit: string;
    sort?: DuffelOfferSort;
    max_connections?: "0" | "1";
    after?: string;
    before?: string;
  } = {
    offer_request_id: input.offerRequestId,
    limit: String(limit),
  };
  if (input.sort !== undefined) query.sort = input.sort as DuffelOfferSort;
  if (input.maxConnections !== undefined) {
    query.max_connections = input.maxConnections === 0 ? "0" : "1";
  }
  if (after !== undefined) query.after = after;
  if (before !== undefined) query.before = before;

  return Object.freeze({
    method: "GET",
    path: DUFFEL_LIST_OFFERS_PATH,
    headers: Object.freeze({
      Accept: "application/json",
      "Duffel-Version": DUFFEL_VERSION,
    }),
    query: Object.freeze(query),
  });
}
