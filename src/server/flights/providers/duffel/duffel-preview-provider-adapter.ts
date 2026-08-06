import "../../../server-only";

import type {
  FlightOffer,
  FlightItinerary,
  FlightSegment,
  LocalDateTime,
} from "../../../../features/flights/flight-offer-types";
import { toLocalDateTime } from "../../../../features/flights/utc-timeline";
import { deriveNeutralSearch } from "../external/external-provider-search-shape";
import type {
  FlightProviderAdapter,
  ProviderFailureCode,
  ProviderSearchContext,
} from "../provider-runtime-types";
import {
  buildDuffelCreateOfferRequest,
  buildDuffelListOffersRequest,
} from "./duffel-request-builder";
import { mapDuffelListOffers } from "./duffel-response-mapper";
import {
  createDuffelRuntimeTransport,
  type DuffelFetchLike,
} from "./duffel-runtime-transport";
import type { DuffelCredentialCapsule } from "./duffel-credential-resolver";
import type { DuffelMappedOffer } from "./duffel-contract";

function localDateTime(instant: string): LocalDateTime {
  const epochMinutes = Math.floor(Date.parse(instant) / 60_000);
  return { ...toLocalDateTime(epochMinutes, "UTC"), epochMinutes };
}
function canonical(offer: DuffelMappedOffer, travelers: number): FlightOffer {
  const itineraries: FlightItinerary[] = offer.legs.map((leg, legIndex) => {
    const segments: FlightSegment[] = leg.segments.map((segment) => ({
      id: `duffel:${segment.segmentId}`,
      carrierId: segment.marketingCarrierCode,
      carrierName: segment.marketingCarrierName,
      flightNumber: `${segment.marketingCarrierCode}${segment.marketingFlightNumber}`,
      originCode: segment.originCode,
      destinationCode: segment.destinationCode,
      departure: localDateTime(segment.departureAt),
      arrival: localDateTime(segment.arrivalAt),
      durationMinutes: segment.durationMinutes,
      aircraftType: "narrowbody",
      cabinClass: segment.cabinClass,
    }));
    return {
      direction: legIndex === 0 ? "outbound" : "inbound",
      segments,
      departure: localDateTime(leg.departureAt),
      arrival: localDateTime(leg.arrivalAt),
      durationMinutes: leg.durationMinutes,
      stopCount: leg.stopCount,
      layovers: segments.slice(0, -1).map((segment, index) => ({
        airportCode: segment.destinationCode,
        durationMinutes:
          segments[index + 1].departure.epochMinutes - segment.arrival.epochMinutes,
      })),
    };
  });
  const operatingCarrierNames = [
    ...new Set(
      offer.legs.flatMap((leg) =>
        leg.segments.map((segment) => segment.operatingCarrierName),
      ),
    ),
  ];
  return {
    id: offer.offerId,
    currency: offer.currency,
    totalPrice: offer.totalAmountMinorUnits,
    pricePerTraveler: Math.max(
      1,
      Math.round(offer.totalAmountMinorUnits / Math.max(1, travelers)),
    ),
    itineraries,
    validatingCarrierId: offer.ownerIataCode,
    validatingCarrierName: offer.ownerName,
    operatingCarrierNames,
    provider: "Duffel test inventory",
    baggage: {
      carryOnIncluded: offer.legs.every((leg) =>
        leg.segments.every((segment) => segment.baggage.carryOnIncluded),
      ),
      checkedBagIncluded: offer.legs.every((leg) =>
        leg.segments.every((segment) => segment.baggage.checkedBagIncluded),
      ),
    },
    fare: { refundable: false, changeable: false },
    rankingMetadata: {
      totalDurationMinutes: offer.legs.reduce(
        (sum, leg) => sum + leg.durationMinutes,
        0,
      ),
      totalStopCount: offer.legs.reduce((sum, leg) => sum + leg.stopCount, 0),
    },
    isDemonstration: false,
  };
}
function failureCode(category: string): ProviderFailureCode {
  return category === "authentication"
    ? "authentication"
    : category === "rateLimited"
      ? "rateLimited"
      : category === "timeout"
        ? "timeout"
        : category === "malformedResponse" || category === "mappingFailure"
          ? "malformedResponse"
          : "unavailable";
}

export function createDuffelPreviewProviderAdapter(options: {
  readonly credential: DuffelCredentialCapsule;
  readonly fetch: DuffelFetchLike;
}): FlightProviderAdapter {
  const transport = createDuffelRuntimeTransport(options);
  return Object.freeze({
    providerId: "duffel-test-contract",
    async search(context: ProviderSearchContext) {
      const neutral = deriveNeutralSearch(context.intent, {
        market: "CA",
        contentLocale: context.intent.locale,
        requestedLocale: context.intent.locale,
        requestId: context.searchContextId,
        timeoutBudgetMs: 20_000,
      });
      let create;
      try {
        create = buildDuffelCreateOfferRequest(neutral);
      } catch {
        return { ok: false as const, failure: { code: "configuration" as const } };
      }
      const execution = {
        signal: context.signal,
        requestId: context.searchContextId,
        deadlineAt: Date.now() + 20_000,
      };
      const created = await transport.execute(create, execution);
      if (!created.ok)
        return {
          ok: false as const,
          failure: { code: failureCode(created.failure.category) },
        };
      const body = created.body as { data?: { id?: unknown } };
      if (typeof body?.data?.id !== "string")
        return {
          ok: false as const,
          failure: { code: "malformedResponse" as const },
        };
      let list;
      try {
        list = buildDuffelListOffersRequest({
          offerRequestId: body.data.id,
          limit: 60,
          maxConnections: neutral.directOnly ? 0 : 1,
        });
      } catch {
        return {
          ok: false as const,
          failure: { code: "malformedResponse" as const },
        };
      }
      const listed = await transport.execute(list, execution);
      if (!listed.ok)
        return {
          ok: false as const,
          failure: { code: failureCode(listed.failure.category) },
        };
      const mapped = mapDuffelListOffers({
        response: listed.body,
        tripShape: neutral.tripShape,
        requestId: context.searchContextId,
        occurredAt: new Date().toISOString(),
        maximumOffers: 60,
      });
      if (!mapped.ok)
        return {
          ok: false as const,
          failure: { code: "malformedResponse" as const },
        };
      const travelers =
        context.intent.travelers.adults +
        context.intent.travelers.children +
        context.intent.travelers.infantsInSeat;
      return {
        ok: true as const,
        offers: mapped.offers.map((offer) => canonical(offer, travelers)),
      };
    },
  });
}
