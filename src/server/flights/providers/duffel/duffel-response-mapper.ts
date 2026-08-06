import "../../../server-only";

import {
  getCurrency,
  isSupportedCurrency,
  type CurrencyCode,
} from "../../../../config/currencies";
import type { CabinClass } from "../../../../features/flights/search-intent-types";
import type { IsoDate } from "../../../../features/dates/date-types";
import {
  fromLocalDateTime,
  toLocalDateTime,
} from "../../../../features/flights/utc-timeline";
import { buildExternalFailure } from "../external/external-provider-failures";
import type { NormalizedExternalFailure } from "../external/external-provider-failures";
import type { ExternalTripShape } from "../external/external-provider-search-shape";
import {
  DUFFEL_MAPPED_OFFER_FIELDS,
  DUFFEL_PROVIDER_ID,
  DUFFEL_SOURCE_ATTRIBUTION,
  type DuffelCabinClass,
  type DuffelMappedBaggage,
  type DuffelMappedLeg,
  type DuffelMappedOffer,
  type DuffelMappedSegment,
  type DuffelMappingWarning,
} from "./duffel-contract";

export { DUFFEL_MAPPED_OFFER_FIELDS };

export const MAX_DUFFEL_OFFERS = 200;
const MAX_AMOUNT_MINOR_UNITS = 100_000_000;
const MAX_SEGMENTS_PER_SLICE = 6;
const IATA_AIRPORT = /^[A-Z]{3}$/;
const IATA_CARRIER = /^[A-Z0-9]{2}$/;
const OFFER_ID = /^off_[A-Za-z0-9_]+$/;
const RESOURCE_ID = /^[a-z]{2,4}_[A-Za-z0-9_]+$/;
const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const LOCAL_DATE_TIME =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?$/;

export type DuffelOfferRejection =
  | "invalidOfferId"
  | "invalidPrice"
  | "zeroPrice"
  | "negativePrice"
  | "invalidCurrency"
  | "invalidTimestamp"
  | "invalidDuration"
  | "missingOwner"
  | "missingSlice"
  | "missingSegment"
  | "missingAirportCode"
  | "invalidCarrier"
  | "unsupportedCabin"
  | "invalidBaggage"
  | "invalidTripShape"
  | "liveModeNotAllowed"
  | "duplicateOffer";

export type DuffelOfferMappingResult =
  | {
      readonly ok: true;
      readonly offers: readonly DuffelMappedOffer[];
      readonly rejected: readonly DuffelOfferRejection[];
      readonly partial: boolean;
      readonly warnings: readonly DuffelMappingWarning[];
    }
  | {
      readonly ok: false;
      readonly failure: NormalizedExternalFailure;
      readonly rejected?: readonly DuffelOfferRejection[];
      readonly diagnostics?: readonly string[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoInstant(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_INSTANT.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

interface ParsedDuffelDateTime {
  readonly instant: string;
  readonly epochMs: number;
}

function parseDuffelDateTime(
  value: unknown,
  timeZone: unknown,
): ParsedDuffelDateTime | null {
  if (isIsoInstant(value)) {
    const epochMs = Date.parse(value);
    return { instant: new Date(epochMs).toISOString(), epochMs };
  }
  if (typeof value !== "string" || typeof timeZone !== "string") return null;
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) return null;
  const date = match[1] as IsoDate;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4] ?? "0");
  const millisecond = Number((match[5] ?? ".0").slice(1).padEnd(3, "0"));
  if (hour > 23 || minute > 59 || second > 59) return null;
  try {
    const epochMinutes = fromLocalDateTime(date, hour, minute, timeZone);
    const roundTrip = toLocalDateTime(epochMinutes, timeZone);
    if (roundTrip.date !== date || roundTrip.time !== `${match[2]}:${match[3]}`) {
      return null;
    }
    const epochMs = epochMinutes * 60_000 + second * 1_000 + millisecond;
    return { instant: new Date(epochMs).toISOString(), epochMs };
  } catch {
    return null;
  }
}

function timestampDiagnostics(raw: unknown): readonly string[] {
  if (!isRecord(raw)) return ["offer:type-mismatch"];
  const diagnostics: string[] = [];
  for (const name of ["created_at", "expires_at"] as const) {
    if (!(name in raw)) diagnostics.push(`${name}:missing`);
    else if (typeof raw[name] !== "string")
      diagnostics.push(`${name}:type-mismatch`);
    else if (!isIsoInstant(raw[name])) diagnostics.push(`${name}:invalid-format`);
  }
  if (
    raw.updated_at !== undefined &&
    raw.updated_at !== null &&
    typeof raw.updated_at !== "string"
  ) {
    diagnostics.push("updated_at:type-mismatch");
  } else if (typeof raw.updated_at === "string" && !isIsoInstant(raw.updated_at)) {
    diagnostics.push("updated_at:invalid-format");
  }
  const updatedAt = raw.updated_at ?? raw.created_at;
  if (
    isIsoInstant(raw.created_at) &&
    isIsoInstant(updatedAt) &&
    Date.parse(updatedAt) < Date.parse(raw.created_at)
  ) {
    diagnostics.push("updated_at:before-created_at");
  }
  if (
    isIsoInstant(updatedAt) &&
    isIsoInstant(raw.expires_at) &&
    Date.parse(raw.expires_at) <= Date.parse(updatedAt)
  ) {
    diagnostics.push("expires_at:not-after-effective-updated_at");
  }
  if (Array.isArray(raw.slices)) {
    for (const slice of raw.slices) {
      if (!isRecord(slice) || !Array.isArray(slice.segments)) continue;
      for (const segment of slice.segments) {
        if (!isRecord(segment)) continue;
        for (const name of ["departing_at", "arriving_at"] as const) {
          if (!(name in segment)) diagnostics.push(`segment.${name}:missing`);
          else if (typeof segment[name] !== "string") {
            diagnostics.push(`segment.${name}:type-mismatch`);
          } else if (!isIsoInstant(segment[name])) {
            diagnostics.push(`segment.${name}:invalid-format`);
          }
        }
      }
    }
  }
  return diagnostics;
}

export function parseDuffelDuration(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(value);
  if (!match || (match[1] === undefined && match[2] === undefined)) return null;
  const hours = Number(match[1] ?? "0");
  const minutes = Number(match[2] ?? "0");
  const total = hours * 60 + minutes;
  return Number.isSafeInteger(total) && total > 0 ? total : null;
}

export function parseDuffelAmount(
  value: unknown,
  currency: unknown,
): number | null {
  if (
    typeof value !== "string" ||
    typeof currency !== "string" ||
    !/^[A-Z]{3}$/.test(currency) ||
    !isSupportedCurrency(currency)
  ) {
    return null;
  }
  const digits = getCurrency(currency).decimalDigits;
  const pattern =
    digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`);
  if (!pattern.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const minor =
    BigInt(whole) * BigInt(10) ** BigInt(digits) +
    BigInt(fraction.padEnd(digits, "0"));
  if (minor > BigInt(MAX_AMOUNT_MINOR_UNITS)) return null;
  return Number(minor);
}

function mapCabin(value: unknown): CabinClass | null {
  switch (value as DuffelCabinClass) {
    case "economy":
      return "economy";
    case "premium_economy":
      return "premiumEconomy";
    case "business":
      return "business";
    case "first":
      return "first";
    default:
      return null;
  }
}

function minutesBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 60_000);
}

function mapBaggage(value: unknown): DuffelMappedBaggage | null {
  if (!Array.isArray(value)) return null;
  let carryOnIncluded = false;
  let checkedBagIncluded = false;
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    if (
      typeof entry.quantity !== "number" ||
      !Number.isInteger(entry.quantity) ||
      entry.quantity < 0
    ) {
      return null;
    }
    if (entry.type === "carry_on" && entry.quantity > 0) carryOnIncluded = true;
    if (entry.type === "checked" && entry.quantity > 0) checkedBagIncluded = true;
  }
  return { carryOnIncluded, checkedBagIncluded };
}

function mapSegment(raw: unknown): DuffelMappedSegment | DuffelOfferRejection {
  if (!isRecord(raw)) return "missingSegment";
  if (typeof raw.id !== "string" || !RESOURCE_ID.test(raw.id)) {
    return "missingSegment";
  }
  const origin = raw.origin;
  const destination = raw.destination;
  if (
    !isRecord(origin) ||
    !isRecord(destination) ||
    typeof origin.iata_code !== "string" ||
    !IATA_AIRPORT.test(origin.iata_code) ||
    typeof destination.iata_code !== "string" ||
    !IATA_AIRPORT.test(destination.iata_code)
  ) {
    return "missingAirportCode";
  }
  const departure = parseDuffelDateTime(raw.departing_at, origin.time_zone);
  const arrival = parseDuffelDateTime(raw.arriving_at, destination.time_zone);
  if (departure === null || arrival === null) {
    return "invalidTimestamp";
  }
  const calculatedDuration = Math.round(
    (arrival.epochMs - departure.epochMs) / 60_000,
  );
  const statedDuration = parseDuffelDuration(raw.duration);
  if (
    calculatedDuration <= 0 ||
    statedDuration === null ||
    Math.abs(statedDuration - calculatedDuration) > 1
  ) {
    return "invalidDuration";
  }
  const marketing = raw.marketing_carrier;
  const operating = raw.operating_carrier;
  if (
    !isRecord(marketing) ||
    !isRecord(operating) ||
    typeof marketing.name !== "string" ||
    marketing.name.trim().length === 0 ||
    typeof marketing.iata_code !== "string" ||
    !IATA_CARRIER.test(marketing.iata_code) ||
    typeof operating.name !== "string" ||
    operating.name.trim().length === 0 ||
    typeof operating.iata_code !== "string" ||
    !IATA_CARRIER.test(operating.iata_code)
  ) {
    return "invalidCarrier";
  }
  if (
    typeof raw.marketing_carrier_flight_number !== "string" ||
    raw.marketing_carrier_flight_number.trim().length === 0 ||
    typeof raw.operating_carrier_flight_number !== "string" ||
    raw.operating_carrier_flight_number.trim().length === 0
  ) {
    return "invalidCarrier";
  }
  if (!Array.isArray(raw.passengers) || raw.passengers.length === 0) {
    return "unsupportedCabin";
  }
  let cabinClass: CabinClass | null = null;
  let carryOnIncluded = false;
  let checkedBagIncluded = false;
  for (const passenger of raw.passengers) {
    if (!isRecord(passenger)) return "unsupportedCabin";
    const mappedCabin = mapCabin(passenger.cabin_class);
    if (
      mappedCabin === null ||
      (cabinClass !== null && cabinClass !== mappedCabin)
    ) {
      return "unsupportedCabin";
    }
    cabinClass = mappedCabin;
    const baggage = mapBaggage(passenger.baggages);
    if (baggage === null) return "invalidBaggage";
    carryOnIncluded ||= baggage.carryOnIncluded;
    checkedBagIncluded ||= baggage.checkedBagIncluded;
  }

  return {
    segmentId: raw.id,
    originCode: origin.iata_code,
    destinationCode: destination.iata_code,
    departureAt: departure.instant,
    arrivalAt: arrival.instant,
    durationMinutes: calculatedDuration,
    marketingCarrierCode: marketing.iata_code,
    marketingCarrierName: marketing.name,
    operatingCarrierCode: operating.iata_code,
    operatingCarrierName: operating.name,
    marketingFlightNumber: raw.marketing_carrier_flight_number,
    operatingFlightNumber: raw.operating_carrier_flight_number,
    cabinClass: cabinClass ?? "economy",
    baggage: { carryOnIncluded, checkedBagIncluded },
  };
}

function mapLeg(raw: unknown): DuffelMappedLeg | DuffelOfferRejection {
  if (!isRecord(raw) || typeof raw.id !== "string" || !RESOURCE_ID.test(raw.id)) {
    return "missingSlice";
  }
  if (!Array.isArray(raw.segments) || raw.segments.length === 0) {
    return "missingSegment";
  }
  if (raw.segments.length > MAX_SEGMENTS_PER_SLICE) return "missingSegment";
  const segments: DuffelMappedSegment[] = [];
  for (const candidate of raw.segments) {
    const segment = mapSegment(candidate);
    if (typeof segment === "string") return segment;
    segments.push(segment);
  }
  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    const current = segments[index];
    if (
      previous.destinationCode !== current.originCode ||
      Date.parse(current.departureAt) < Date.parse(previous.arrivalAt)
    ) {
      return "missingSegment";
    }
  }
  const first = segments[0];
  const last = segments[segments.length - 1];
  const durationMinutes = minutesBetween(first.departureAt, last.arrivalAt);
  const statedDuration = parseDuffelDuration(raw.duration);
  if (
    durationMinutes <= 0 ||
    statedDuration === null ||
    Math.abs(durationMinutes - statedDuration) > 1
  ) {
    return "invalidDuration";
  }
  return {
    sliceId: raw.id,
    originCode: first.originCode,
    destinationCode: last.destinationCode,
    departureAt: first.departureAt,
    arrivalAt: last.arrivalAt,
    durationMinutes,
    stopCount: segments.length - 1,
    segments,
  };
}

function validTripShape(shape: ExternalTripShape, legCount: number): boolean {
  return (
    (shape === "oneWay" && legCount === 1) ||
    (shape === "roundTrip" && legCount === 2) ||
    (shape === "multiCity" && legCount >= 3)
  );
}

export function mapDuffelOffer(
  raw: unknown,
  tripShape: ExternalTripShape,
):
  | { readonly ok: true; readonly offer: DuffelMappedOffer }
  | {
      readonly ok: false;
      readonly reason: DuffelOfferRejection;
    } {
  if (!isRecord(raw) || typeof raw.id !== "string" || !OFFER_ID.test(raw.id)) {
    return { ok: false, reason: "invalidOfferId" };
  }
  if (raw.live_mode !== false) return { ok: false, reason: "liveModeNotAllowed" };
  const currency = raw.total_currency;
  if (
    typeof currency !== "string" ||
    !/^[A-Z]{3}$/.test(currency) ||
    !isSupportedCurrency(currency) ||
    raw.base_currency !== currency ||
    raw.tax_currency !== currency
  ) {
    return { ok: false, reason: "invalidCurrency" };
  }
  if (
    (typeof raw.total_amount === "string" && raw.total_amount.startsWith("-")) ||
    (typeof raw.base_amount === "string" && raw.base_amount.startsWith("-")) ||
    (typeof raw.tax_amount === "string" && raw.tax_amount.startsWith("-"))
  ) {
    return { ok: false, reason: "negativePrice" };
  }
  const total = parseDuffelAmount(raw.total_amount, currency);
  const base = parseDuffelAmount(raw.base_amount, currency);
  const tax = parseDuffelAmount(raw.tax_amount, currency);
  if (total === null || base === null || tax === null) {
    return { ok: false, reason: "invalidPrice" };
  }
  if (total === 0) return { ok: false, reason: "zeroPrice" };
  if (base + tax !== total) return { ok: false, reason: "invalidPrice" };
  const updatedAt =
    raw.updated_at === undefined || raw.updated_at === null
      ? raw.created_at
      : raw.updated_at;
  if (
    !isIsoInstant(raw.created_at) ||
    !isIsoInstant(updatedAt) ||
    !isIsoInstant(raw.expires_at) ||
    Date.parse(updatedAt) < Date.parse(raw.created_at) ||
    Date.parse(raw.expires_at) <= Date.parse(updatedAt)
  ) {
    return { ok: false, reason: "invalidTimestamp" };
  }
  const owner = raw.owner;
  if (
    !isRecord(owner) ||
    typeof owner.name !== "string" ||
    owner.name.trim().length === 0 ||
    typeof owner.iata_code !== "string" ||
    !IATA_CARRIER.test(owner.iata_code)
  ) {
    return { ok: false, reason: "missingOwner" };
  }
  if (!Array.isArray(raw.slices) || raw.slices.length === 0) {
    return { ok: false, reason: "missingSlice" };
  }
  if (!validTripShape(tripShape, raw.slices.length)) {
    return { ok: false, reason: "invalidTripShape" };
  }
  const legs: DuffelMappedLeg[] = [];
  for (const candidate of raw.slices) {
    const leg = mapLeg(candidate);
    if (typeof leg === "string") return { ok: false, reason: leg };
    legs.push(leg);
  }
  const partial = raw.partial === true;
  const warnings: DuffelMappingWarning[] = partial ? ["partialOffer"] : [];
  return {
    ok: true,
    offer: {
      offerId: `duffel:${raw.id}`,
      providerId: DUFFEL_PROVIDER_ID,
      sourceAttribution: DUFFEL_SOURCE_ATTRIBUTION,
      providerOfferReference: raw.id,
      ownerName: owner.name,
      ownerIataCode: owner.iata_code,
      totalAmountMinorUnits: total,
      baseAmountMinorUnits: base,
      taxAmountMinorUnits: tax,
      currency: currency as CurrencyCode,
      legs,
      createdAt: raw.created_at,
      updatedAt,
      expiresAt: raw.expires_at,
      liveMode: false,
      partial,
      warnings,
    },
  };
}

export interface MapDuffelListOffersInput {
  readonly response: unknown;
  readonly tripShape: ExternalTripShape;
  readonly requestId: string;
  readonly occurredAt: string;
  readonly maximumOffers?: number;
}

export function mapDuffelListOffers(
  input: MapDuffelListOffersInput,
): DuffelOfferMappingResult {
  if (!isRecord(input.response) || !Array.isArray(input.response.data)) {
    return {
      ok: false,
      failure: buildExternalFailure({
        category: "malformedResponse",
        providerId: DUFFEL_PROVIDER_ID,
        requestId: input.requestId,
        occurredAt: input.occurredAt,
      }),
    };
  }
  const requestedMaximum = input.maximumOffers ?? 50;
  const maximum = Math.max(1, Math.min(requestedMaximum, MAX_DUFFEL_OFFERS));
  const bounded = input.response.data.slice(0, maximum);
  const offers: DuffelMappedOffer[] = [];
  const rejected: DuffelOfferRejection[] = [];
  const diagnostics = new Set<string>();
  const warnings = new Set<DuffelMappingWarning>();
  const ids = new Set<string>();
  for (const candidate of bounded) {
    const mapped = mapDuffelOffer(candidate, input.tripShape);
    if (!mapped.ok) {
      rejected.push(mapped.reason);
      if (mapped.reason === "invalidTimestamp") {
        for (const diagnostic of timestampDiagnostics(candidate)) {
          diagnostics.add(diagnostic);
        }
      }
      continue;
    }
    if (ids.has(mapped.offer.offerId)) {
      rejected.push("duplicateOffer");
      warnings.add("duplicateOfferDiscarded");
      continue;
    }
    ids.add(mapped.offer.offerId);
    offers.push(mapped.offer);
    for (const warning of mapped.offer.warnings) warnings.add(warning);
  }
  const truncated = input.response.data.length > bounded.length;
  if (truncated) warnings.add("offerCountTruncated");
  if (input.response.data.length > 0 && offers.length === 0) {
    return {
      ok: false,
      rejected: Object.freeze([...rejected]),
      diagnostics: Object.freeze([...diagnostics].sort()),
      failure: buildExternalFailure({
        category: "mappingFailure",
        providerId: DUFFEL_PROVIDER_ID,
        requestId: input.requestId,
        occurredAt: input.occurredAt,
      }),
    };
  }
  return {
    ok: true,
    offers,
    rejected,
    partial:
      truncated || rejected.length > 0 || offers.some((offer) => offer.partial),
    warnings: [...warnings],
  };
}
