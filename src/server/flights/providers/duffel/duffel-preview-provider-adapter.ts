import "../../../server-only";

import type {
  FlightOffer,
  FlightItinerary,
  FlightSegment,
  LocalDateTime,
} from "../../../../features/flights/flight-offer-types";
import { toLocalDateTime } from "../../../../features/flights/utc-timeline";
import { resolveAirportTimeZone } from "../../../../features/flights/airport-timezone";
import { isCanonicalFlightOfferForIntent } from "../../../../features/flights/flight-offer-intent-validation";
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
import { recordDuffelPreviewDiagnostic } from "./duffel-preview-diagnostics";

function localDateTime(instant: string, airportCode: string): LocalDateTime {
  const epochMinutes = Math.floor(Date.parse(instant) / 60_000);
  const timeZone = resolveAirportTimeZone(airportCode);
  if (timeZone === null) throw new Error("unknown airport timezone");
  return { ...toLocalDateTime(epochMinutes, timeZone), epochMinutes };
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
      departure: localDateTime(segment.departureAt, segment.originCode),
      arrival: localDateTime(segment.arrivalAt, segment.destinationCode),
      durationMinutes: segment.durationMinutes,
      aircraftType: "narrowbody",
      cabinClass: segment.cabinClass,
    }));
    return {
      direction: legIndex === 0 ? "outbound" : "inbound",
      segments,
      departure: localDateTime(leg.departureAt, leg.originCode),
      arrival: localDateTime(leg.arrivalAt, leg.destinationCode),
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
  readonly diagnosticsEnabled?: boolean;
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
        recordDuffelPreviewDiagnostic(options.diagnosticsEnabled === true, {
          phase: "createOfferRequest",
          category: "invalidRequest",
          httpStatus: null,
          retryable: false,
          offerRequestIdPresent: false,
          responseParsed: false,
          mappedOfferCount: 0,
          rejectedOfferCount: 0,
          safeReasonCode: "create-request-rejected",
        });
        return { ok: false as const, failure: { code: "configuration" as const } };
      }
      const execution = {
        signal: context.signal,
        requestId: context.searchContextId,
        deadlineAt: Date.now() + 20_000,
      };
      const created = await transport.execute(create, execution);
      if (!created.ok) {
        recordDuffelPreviewDiagnostic(options.diagnosticsEnabled === true, {
          phase: created.failure.category === "timeout" ? "timeout" : "transport",
          category: created.failure.category,
          httpStatus: created.failure.statusCode,
          retryable: created.failure.retryable,
          offerRequestIdPresent: false,
          responseParsed: false,
          mappedOfferCount: 0,
          rejectedOfferCount: 0,
          safeReasonCode: "create-transport-failed",
        });
        return {
          ok: false as const,
          failure: { code: failureCode(created.failure.category) },
        };
      }
      const body = created.body as { data?: { id?: unknown } };
      if (typeof body?.data?.id !== "string") {
        recordDuffelPreviewDiagnostic(options.diagnosticsEnabled === true, {
          phase: "createOfferRequest",
          category: "malformedResponse",
          httpStatus: created.statusCode,
          retryable: false,
          offerRequestIdPresent: false,
          responseParsed: true,
          mappedOfferCount: 0,
          rejectedOfferCount: 0,
          safeReasonCode: "offer-request-id-missing",
        });
        return {
          ok: false as const,
          failure: { code: "malformedResponse" as const },
        };
      }
      let list;
      try {
        list = buildDuffelListOffersRequest({
          offerRequestId: body.data.id,
          limit: 60,
          maxConnections: neutral.directOnly ? 0 : 1,
        });
      } catch {
        recordDuffelPreviewDiagnostic(options.diagnosticsEnabled === true, {
          phase: "listOffers",
          category: "invalidRequest",
          httpStatus: null,
          retryable: false,
          offerRequestIdPresent: true,
          responseParsed: true,
          mappedOfferCount: 0,
          rejectedOfferCount: 0,
          safeReasonCode: "list-request-rejected",
        });
        return {
          ok: false as const,
          failure: { code: "malformedResponse" as const },
        };
      }
      const listed = await transport.execute(list, execution);
      if (!listed.ok) {
        recordDuffelPreviewDiagnostic(options.diagnosticsEnabled === true, {
          phase: listed.failure.category === "timeout" ? "timeout" : "transport",
          category: listed.failure.category,
          httpStatus: listed.failure.statusCode,
          retryable: listed.failure.retryable,
          offerRequestIdPresent: true,
          responseParsed: false,
          mappedOfferCount: 0,
          rejectedOfferCount: 0,
          safeReasonCode: "list-transport-failed",
        });
        return {
          ok: false as const,
          failure: { code: failureCode(listed.failure.category) },
        };
      }
      const mapped = mapDuffelListOffers({
        response: listed.body,
        tripShape: neutral.tripShape,
        requestId: context.searchContextId,
        occurredAt: new Date().toISOString(),
        maximumOffers: 60,
      });
      if (!mapped.ok) {
        recordDuffelPreviewDiagnostic(options.diagnosticsEnabled === true, {
          phase: "mapping",
          category: mapped.failure.category,
          httpStatus: mapped.failure.statusCode,
          retryable: mapped.failure.retryable,
          offerRequestIdPresent: true,
          responseParsed: true,
          mappedOfferCount: 0,
          rejectedOfferCount: mapped.rejected?.length ?? 0,
          safeReasonCode: "provider-offer-mapping-failed",
        });
        return {
          ok: false as const,
          failure: { code: "malformedResponse" as const },
        };
      }
      const travelers =
        context.intent.travelers.adults +
        context.intent.travelers.children +
        context.intent.travelers.infantsInSeat;
      const offers = mapped.offers.map((offer) => canonical(offer, travelers));
      const rejectedCanonical = offers.filter(
        (offer) => !isCanonicalFlightOfferForIntent(offer, context.intent),
      ).length;
      if (rejectedCanonical > 0) {
        recordDuffelPreviewDiagnostic(options.diagnosticsEnabled === true, {
          phase: "mapping",
          category: "mappingFailure",
          httpStatus: listed.statusCode,
          retryable: false,
          offerRequestIdPresent: true,
          responseParsed: true,
          mappedOfferCount: offers.length - rejectedCanonical,
          rejectedOfferCount: mapped.rejected.length + rejectedCanonical,
          safeReasonCode: "canonical-offer-rejected",
        });
        return {
          ok: false as const,
          failure: { code: "malformedResponse" as const },
        };
      }
      recordDuffelPreviewDiagnostic(options.diagnosticsEnabled === true, {
        phase: "mapping",
        category: "unknown",
        httpStatus: listed.statusCode,
        retryable: false,
        offerRequestIdPresent: true,
        responseParsed: true,
        mappedOfferCount: offers.length,
        rejectedOfferCount: mapped.rejected.length,
        safeReasonCode: "preview-search-mapped",
      });
      return {
        ok: true as const,
        offers,
      };
    },
  });
}
