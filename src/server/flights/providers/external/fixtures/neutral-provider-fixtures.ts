import "../../../../server-only";

import type { ExternalNeutralSearch } from "../external-provider-search-shape";
import type { ExternalProviderSearchResponse } from "../external-provider-types";

/**
 * Deterministic neutral fixtures.
 *
 * These are the inputs the V2.8-B contracts are exercised against. Every one is
 * invented: no real travel provider's name, hostname, logo or proprietary
 * response schema appears anywhere. That is not caution for its own sake — a
 * fixture built from a real provider's schema is that provider's schema, and
 * the "neutral" contract quietly becomes a client for whoever the fixtures were
 * copied from.
 *
 * The reserved `.invalid` hostname appears only as inert data inside a response
 * body, to prove that a URL arriving *from* a provider is discarded rather than
 * followed. Nothing here is ever called.
 *
 * Fixtures are frozen and pure. A fixture that reads the clock makes every test
 * above it time-dependent, and the first flaky failure gets "fixed" by loosening
 * the assertion.
 */

const BASE_SEARCH: ExternalNeutralSearch = Object.freeze({
  tripShape: "oneWay",
  legs: Object.freeze([
    Object.freeze({
      originCode: "YUL",
      destinationCode: "CDG",
      departureDate: "2026-09-15",
    }),
  ]) as ExternalNeutralSearch["legs"],
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
  requestId: "11111111-2222-3333-4444-555555555555",
  timeoutBudgetMs: 20_000,
});

/* --------------------------------------------------------------------- */
/* Searches                                                              */
/* --------------------------------------------------------------------- */

export const oneWaySearch: ExternalNeutralSearch = BASE_SEARCH;

export const roundTripSearch: ExternalNeutralSearch = Object.freeze({
  ...BASE_SEARCH,
  tripShape: "roundTrip",
  legs: Object.freeze([
    Object.freeze({
      originCode: "YUL",
      destinationCode: "CDG",
      departureDate: "2026-09-15",
    }),
    Object.freeze({
      originCode: "CDG",
      destinationCode: "YUL",
      departureDate: "2026-09-22",
    }),
  ]) as ExternalNeutralSearch["legs"],
});

export const multiCitySearch: ExternalNeutralSearch = Object.freeze({
  ...BASE_SEARCH,
  tripShape: "multiCity",
  legs: Object.freeze([
    Object.freeze({
      originCode: "YUL",
      destinationCode: "CDG",
      departureDate: "2026-09-15",
    }),
    Object.freeze({
      originCode: "CDG",
      destinationCode: "FCO",
      departureDate: "2026-09-18",
    }),
    Object.freeze({
      originCode: "FCO",
      destinationCode: "YUL",
      departureDate: "2026-09-24",
    }),
  ]) as ExternalNeutralSearch["legs"],
});

/** Declares `multiCity` but carries two legs — the shape contradicts itself. */
export const unsupportedTripShapeSearch: ExternalNeutralSearch = Object.freeze({
  ...multiCitySearch,
  legs: Object.freeze([
    Object.freeze({
      originCode: "YUL",
      destinationCode: "CDG",
      departureDate: "2026-09-15",
    }),
    Object.freeze({
      originCode: "CDG",
      destinationCode: "YUL",
      departureDate: "2026-09-22",
    }),
  ]) as ExternalNeutralSearch["legs"],
});

/* --------------------------------------------------------------------- */
/* Raw offer building blocks                                             */
/* --------------------------------------------------------------------- */

const SEGMENT_YUL_CDG = Object.freeze({
  originCode: "YUL",
  destinationCode: "CDG",
  carrierCode: "QQ",
  departureAt: "2026-09-15T18:00:00.000Z",
  arrivalAt: "2026-09-16T06:30:00.000Z",
});

const SEGMENT_CDG_YUL = Object.freeze({
  originCode: "CDG",
  destinationCode: "YUL",
  carrierCode: "QQ",
  departureAt: "2026-09-22T10:00:00.000Z",
  arrivalAt: "2026-09-22T20:15:00.000Z",
});

const SEGMENT_CDG_FCO = Object.freeze({
  originCode: "CDG",
  destinationCode: "FCO",
  carrierCode: "ZR",
  departureAt: "2026-09-18T09:00:00.000Z",
  arrivalAt: "2026-09-18T11:10:00.000Z",
});

const SEGMENT_FCO_YUL = Object.freeze({
  originCode: "FCO",
  destinationCode: "YUL",
  carrierCode: "ZR",
  departureAt: "2026-09-24T07:00:00.000Z",
  arrivalAt: "2026-09-24T18:40:00.000Z",
});

const outboundLeg = Object.freeze({
  segments: Object.freeze([SEGMENT_YUL_CDG]),
  durationMinutes: 750,
  stopCount: 0,
});

const returnLeg = Object.freeze({
  segments: Object.freeze([SEGMENT_CDG_YUL]),
  durationMinutes: 615,
  stopCount: 0,
});

/** Shared shape for a valid offer, so each fixture varies exactly one thing. */
function offer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    providerOfferReference: "ref-1",
    totalAmountMinorUnits: 89_900,
    currency: "CAD",
    cabinClass: "economy",
    observedAt: "2026-08-05T00:00:00.000Z",
    expiresAt: "2026-08-05T00:30:00.000Z",
    legs: [outboundLeg],
    travellerPricing: [
      { travellerType: "adult", count: 1, amountMinorUnits: 89_900 },
    ],
    ...overrides,
  };
}

/* --------------------------------------------------------------------- */
/* Valid offers                                                          */
/* --------------------------------------------------------------------- */

export const validOneWayOffer = Object.freeze(offer());

export const validRoundTripOffer = Object.freeze(
  offer({
    providerOfferReference: "ref-rt",
    legs: [outboundLeg, returnLeg],
    totalAmountMinorUnits: 142_500,
    travellerPricing: [
      { travellerType: "adult", count: 1, amountMinorUnits: 142_500 },
    ],
  }),
);

export const validMultiCityOffer = Object.freeze(
  offer({
    providerOfferReference: "ref-mc",
    legs: [
      outboundLeg,
      { segments: [SEGMENT_CDG_FCO], durationMinutes: 130, stopCount: 0 },
      { segments: [SEGMENT_FCO_YUL], durationMinutes: 700, stopCount: 0 },
    ],
    totalAmountMinorUnits: 210_000,
    travellerPricing: [
      { travellerType: "adult", count: 1, amountMinorUnits: 210_000 },
    ],
  }),
);

/** Two segments, one stop — exercises segment chaining and stop recomputation. */
export const validConnectingOffer = Object.freeze(
  offer({
    providerOfferReference: "ref-conn",
    legs: [
      {
        segments: [
          {
            originCode: "YUL",
            destinationCode: "CDG",
            carrierCode: "QQ",
            departureAt: "2026-09-15T18:00:00.000Z",
            arrivalAt: "2026-09-16T06:30:00.000Z",
          },
          SEGMENT_CDG_FCO,
        ],
        stopCount: 1,
      },
    ],
  }),
);

/* --------------------------------------------------------------------- */
/* Malformed offers — one defect each                                    */
/* --------------------------------------------------------------------- */

export const malformedCurrencyOffer = Object.freeze(
  offer({ providerOfferReference: "ref-cur", currency: "dollars" }),
);

export const malformedDateOffer = Object.freeze(
  offer({ providerOfferReference: "ref-date", observedAt: "August 5th 2026" }),
);

export const malformedDurationOffer = Object.freeze(
  offer({
    providerOfferReference: "ref-dur",
    // Declares 60 minutes for a 750-minute itinerary.
    legs: [{ segments: [SEGMENT_YUL_CDG], durationMinutes: 60, stopCount: 0 }],
  }),
);

export const negativePriceOffer = Object.freeze(
  offer({ providerOfferReference: "ref-neg", totalAmountMinorUnits: -100 }),
);

export const zeroPriceOffer = Object.freeze(
  offer({
    providerOfferReference: "ref-zero",
    totalAmountMinorUnits: 0,
    travellerPricing: [],
  }),
);

export const unknownAirportOffer = Object.freeze(
  offer({
    providerOfferReference: "ref-airport",
    legs: [
      {
        segments: [{ ...SEGMENT_YUL_CDG, destinationCode: "NOT-AN-AIRPORT" }],
        stopCount: 0,
      },
    ],
  }),
);

export const unknownCarrierOffer = Object.freeze(
  offer({
    providerOfferReference: "ref-carrier",
    legs: [
      {
        segments: [{ ...SEGMENT_YUL_CDG, carrierCode: "not-a-carrier" }],
        stopCount: 0,
      },
    ],
  }),
);

export const inconsistentStopCountOffer = Object.freeze(
  offer({
    providerOfferReference: "ref-stops",
    // One segment, so zero stops — but the provider claims three.
    legs: [{ segments: [SEGMENT_YUL_CDG], stopCount: 3 }],
  }),
);

export const inconsistentTravellerPricingOffer = Object.freeze(
  offer({
    providerOfferReference: "ref-pricing",
    totalAmountMinorUnits: 89_900,
    // Breakdown sums to 50,000, contradicting the stated total.
    travellerPricing: [
      { travellerType: "adult", count: 1, amountMinorUnits: 50_000 },
    ],
  }),
);

/**
 * Carries a deep link. The link must be discarded and the offer still accepted,
 * with a `bookingLinkDiscarded` warning recorded.
 *
 * The `.invalid` host is inert fixture data proving that a URL arriving from a
 * provider is dropped — never followed, never forwarded to a browser.
 */
export const offerWithBookingLink = Object.freeze(
  offer({
    providerOfferReference: "ref-link",
    bookingLink: "https://neutral-fixture.invalid/book/abc123",
  }),
);

/* --------------------------------------------------------------------- */
/* Responses                                                             */
/* --------------------------------------------------------------------- */

function response(
  overrides: Partial<ExternalProviderSearchResponse> = {},
): ExternalProviderSearchResponse {
  return Object.freeze({
    statusCode: 200,
    headers: Object.freeze({ "content-type": "application/json" }),
    body: Object.freeze({}),
    durationMs: 240,
    receivedAt: "2026-08-05T00:00:00.000Z",
    ...overrides,
  });
}

export const validResponse = response({
  body: { data: { offers: [validOneWayOffer], hasMore: false } },
});

/** Three offers, one of them malformed. Two must survive. */
export const partiallyMalformedResponse = response({
  body: {
    data: {
      offers: [validOneWayOffer, malformedCurrencyOffer, validRoundTripOffer],
      hasMore: false,
    },
  },
});

/** Every offer malformed — a shape mismatch, not an empty result. */
export const fullyMalformedResponse = response({
  body: { data: { offers: [malformedCurrencyOffer, negativePriceOffer] } },
});

export const duplicateOfferResponse = response({
  body: {
    data: { offers: [validOneWayOffer, validOneWayOffer, validOneWayOffer] },
  },
});

export const zeroResultResponse = response({
  body: { data: { offers: [], hasMore: false } },
});

export const partialResultResponse = response({
  body: { data: { offers: [validOneWayOffer], hasMore: true } },
});

/** More offers than any cap should allow through. */
export const excessiveOfferResponse = response({
  body: {
    data: {
      offers: Array.from({ length: 400 }, (_unused, index) => ({
        ...validOneWayOffer,
        providerOfferReference: `bulk-${index}`,
      })),
    },
  },
});

export const rateLimitedResponse = response({
  statusCode: 429,
  headers: { "retry-after": "3", "content-type": "application/json" },
  body: { error: { message: "UPSTREAM-ONLY-TOKEN quota exceeded" } },
});

export const unauthorizedResponse = response({
  statusCode: 401,
  body: { error: { message: "invalid credential" } },
});

export const forbiddenResponse = response({
  statusCode: 403,
  body: { error: { message: "not entitled to this market" } },
});

export const invalidRequestResponse = response({
  statusCode: 400,
  body: { error: { message: "unknown parameter" } },
});

export const upstreamUnavailableResponse = response({
  statusCode: 503,
  body: { error: { message: "upstream maintenance" } },
});

export const timeoutResponse = response({
  statusCode: 504,
  body: { error: { message: "gateway timeout" } },
});

/** A 200 whose body is not the expected shape at all. */
export const unparseableResponse = response({
  body: "<html><body>proxy error</body></html>",
});

/** Every fixture name, so verification can assert the set is complete. */
export const FIXTURE_NAMES: readonly string[] = [
  "oneWaySearch",
  "roundTripSearch",
  "multiCitySearch",
  "unsupportedTripShapeSearch",
  "validOneWayOffer",
  "validRoundTripOffer",
  "validMultiCityOffer",
  "validConnectingOffer",
  "malformedCurrencyOffer",
  "malformedDateOffer",
  "malformedDurationOffer",
  "negativePriceOffer",
  "zeroPriceOffer",
  "unknownAirportOffer",
  "unknownCarrierOffer",
  "inconsistentStopCountOffer",
  "inconsistentTravellerPricingOffer",
  "offerWithBookingLink",
  "validResponse",
  "partiallyMalformedResponse",
  "fullyMalformedResponse",
  "duplicateOfferResponse",
  "zeroResultResponse",
  "partialResultResponse",
  "excessiveOfferResponse",
  "rateLimitedResponse",
  "unauthorizedResponse",
  "forbiddenResponse",
  "invalidRequestResponse",
  "upstreamUnavailableResponse",
  "timeoutResponse",
  "unparseableResponse",
];
