import "../../../server-only";

import type { ExternalNeutralSearch } from "../external/external-provider-search-shape";
import type { DuffelListOffersResponse, DuffelOffer } from "./duffel-contract";

const BASE_SEARCH: ExternalNeutralSearch = Object.freeze({
  tripShape: "oneWay",
  legs: Object.freeze([
    Object.freeze({
      originCode: "YUL",
      destinationCode: "CDG",
      departureDate: "2026-09-01",
    }),
  ]),
  travelers: Object.freeze({
    adults: 1,
    children: 0,
    infantsInSeat: 0,
    infantsOnLap: 0,
  }),
  cabinClass: "economy",
  directOnly: false,
  market: "CA",
  contentLocale: "en-CA",
  requestedLocale: "en-CA",
  currency: "CAD",
  requestId: "duffel-contract-request-1",
  timeoutBudgetMs: 20_000,
});

export const oneWaySearch = BASE_SEARCH;
export const directOnlySearch: ExternalNeutralSearch = Object.freeze({
  ...BASE_SEARCH,
  directOnly: true,
});
export const nonDirectSearch: ExternalNeutralSearch = Object.freeze({
  ...BASE_SEARCH,
  directOnly: false,
});
export const roundTripSearch: ExternalNeutralSearch = Object.freeze({
  ...BASE_SEARCH,
  tripShape: "roundTrip",
  legs: Object.freeze([
    BASE_SEARCH.legs[0],
    Object.freeze({
      originCode: "CDG",
      destinationCode: "YUL",
      departureDate: "2026-09-08",
    }),
  ]),
});
export const multiCitySearch: ExternalNeutralSearch = Object.freeze({
  ...BASE_SEARCH,
  tripShape: "multiCity",
  legs: Object.freeze([
    BASE_SEARCH.legs[0],
    Object.freeze({
      originCode: "CDG",
      destinationCode: "FCO",
      departureDate: "2026-09-05",
    }),
    Object.freeze({
      originCode: "FCO",
      destinationCode: "YUL",
      departureDate: "2026-09-10",
    }),
  ]),
});

const YUL = Object.freeze({
  name: "Contract Origin Airport",
  iata_code: "YUL",
  city_name: "Contract Origin City",
  time_zone: "America/Toronto",
});
const CDG = Object.freeze({
  name: "Contract Destination Airport",
  iata_code: "CDG",
  city_name: "Contract Destination City",
  time_zone: "Europe/Paris",
});
const CARRIER = Object.freeze({ name: "Contract Air", iata_code: "ZZ" });
const PASSENGER = Object.freeze({
  cabin_class: "economy" as const,
  cabin_class_marketing_name: "Contract Economy",
  baggages: Object.freeze([
    Object.freeze({ type: "carry_on", quantity: 1 }),
    Object.freeze({ type: "checked", quantity: 1 }),
  ]),
});
const SEGMENT = Object.freeze({
  id: "seg_contract_001",
  origin: YUL,
  destination: CDG,
  departing_at: "2026-09-01T18:00:00.000Z",
  arriving_at: "2026-09-02T01:30:00.000Z",
  duration: "PT7H30M",
  marketing_carrier: CARRIER,
  operating_carrier: CARRIER,
  marketing_carrier_flight_number: "101",
  operating_carrier_flight_number: "101",
  passengers: Object.freeze([PASSENGER]),
});
const SLICE = Object.freeze({
  id: "sli_contract_001",
  origin: YUL,
  destination: CDG,
  duration: "PT7H30M",
  segments: Object.freeze([SEGMENT]),
});

export const validOffer: DuffelOffer = Object.freeze({
  id: "off_contract_001",
  total_amount: "899.00",
  total_currency: "CAD",
  base_amount: "800.00",
  base_currency: "CAD",
  tax_amount: "99.00",
  tax_currency: "CAD",
  owner: CARRIER,
  slices: Object.freeze([SLICE]),
  expires_at: "2026-08-05T01:00:00.000Z",
  created_at: "2026-08-05T00:00:00.000Z",
  updated_at: "2026-08-05T00:05:00.000Z",
  live_mode: false,
  partial: false,
});

export const validOfferResponse = Object.freeze({ data: validOffer });
export const validListOffersResponse: DuffelListOffersResponse = Object.freeze({
  data: Object.freeze([validOffer]),
});
export const partialMalformedResponse = Object.freeze({
  data: Object.freeze([
    validOffer,
    Object.freeze({ ...validOffer, id: "off_contract_bad", total_amount: "bad" }),
  ]),
});
export const fullyMalformedResponse = Object.freeze({
  data: Object.freeze([
    Object.freeze({ ...validOffer, id: "off_contract_bad1", total_amount: "bad" }),
    Object.freeze({ ...validOffer, id: "off_contract_bad2", owner: undefined }),
  ]),
});
export const duplicateOfferIdsResponse = Object.freeze({
  data: Object.freeze([validOffer, validOffer]),
});
export const zeroResultsResponse = Object.freeze({ data: Object.freeze([]) });
export const invalidPriceOffer = Object.freeze({
  ...validOffer,
  total_amount: "x",
});
export const zeroPriceOffer = Object.freeze({
  ...validOffer,
  total_amount: "0.00",
  base_amount: "0.00",
  tax_amount: "0.00",
});
export const negativePriceOffer = Object.freeze({
  ...validOffer,
  total_amount: "-1.00",
});
export const invalidCurrencyOffer = Object.freeze({
  ...validOffer,
  total_currency: "cad",
});
export const invalidTimestampOffer = Object.freeze({
  ...validOffer,
  updated_at: "later",
});
export const invalidDurationOffer = Object.freeze({
  ...validOffer,
  slices: Object.freeze([Object.freeze({ ...SLICE, duration: "PT1H" })]),
});
export const missingOwnerOffer = Object.freeze({ ...validOffer, owner: undefined });
export const missingSegmentOffer = Object.freeze({
  ...validOffer,
  slices: Object.freeze([Object.freeze({ ...SLICE, segments: Object.freeze([]) })]),
});
export const missingAirportCodeOffer = Object.freeze({
  ...validOffer,
  slices: Object.freeze([
    Object.freeze({
      ...SLICE,
      segments: Object.freeze([
        Object.freeze({
          ...SEGMENT,
          origin: Object.freeze({ ...YUL, iata_code: "" }),
        }),
      ]),
    }),
  ]),
});
export const unsupportedCabinOffer = Object.freeze({
  ...validOffer,
  slices: Object.freeze([
    Object.freeze({
      ...SLICE,
      segments: Object.freeze([
        Object.freeze({
          ...SEGMENT,
          passengers: Object.freeze([
            Object.freeze({ ...PASSENGER, cabin_class: "contract_suite" }),
          ]),
        }),
      ]),
    }),
  ]),
});
export const partialOffer = Object.freeze({ ...validOffer, partial: true });

export const rateLimitedFailure = Object.freeze({
  statusCode: 429,
  retryAfterMs: 5_000,
});
export const unauthorizedFailure = Object.freeze({ statusCode: 401 });
export const forbiddenFailure = Object.freeze({ statusCode: 403 });
export const timeoutFailure = Object.freeze({ statusCode: 408 });
export const networkFailure = Object.freeze({ kind: "network" as const });
export const malformedJsonFailure = Object.freeze({
  kind: "malformedJson" as const,
});
export const abortedFailure = Object.freeze({ kind: "aborted" as const });

export const DUFFEL_FIXTURE_NAMES: readonly string[] = [
  "oneWaySearch",
  "roundTripSearch",
  "multiCitySearch",
  "directOnlySearch",
  "nonDirectSearch",
  "validOfferResponse",
  "validListOffersResponse",
  "partialMalformedResponse",
  "fullyMalformedResponse",
  "duplicateOfferIdsResponse",
  "zeroResultsResponse",
  "invalidPriceOffer",
  "zeroPriceOffer",
  "negativePriceOffer",
  "invalidCurrencyOffer",
  "invalidTimestampOffer",
  "invalidDurationOffer",
  "missingOwnerOffer",
  "missingSegmentOffer",
  "missingAirportCodeOffer",
  "unsupportedCabinOffer",
  "partialOffer",
  "rateLimitedFailure",
  "unauthorizedFailure",
  "forbiddenFailure",
  "timeoutFailure",
  "networkFailure",
  "malformedJsonFailure",
  "abortedFailure",
];
