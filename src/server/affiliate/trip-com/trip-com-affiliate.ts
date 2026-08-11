import "../../server-only";

import { createHash, randomUUID } from "node:crypto";

const PROVIDER_ID = "trip-com-affiliate";
const TRIP_COM_HOSTS = new Set(["trip.com", "www.trip.com"]);
const REQUIRED_TEMPLATE_FIELDS = [
  "origin",
  "destination",
  "trip_sub1",
  "affiliateId",
  "sid",
] as const;
const ALLOWED_TEMPLATE_FIELDS = new Set([
  ...REQUIRED_TEMPLATE_FIELDS,
  "departureDate",
  "returnDate",
  "tripType",
  "cabinClass",
  "adults",
  "children",
  "locale",
  "currency",
]);

type Environment = Readonly<Record<string, string | undefined>>;

export interface TripComAffiliateProviderMetadata {
  readonly id: "trip-com-affiliate";
  readonly displayName: "Trip.com";
  readonly providerType: "affiliateRedirect";
  readonly configured: boolean;
  readonly enabled: boolean;
  readonly active: boolean;
  readonly capabilities: readonly ["flightRedirect", "trackedOutboundClick"];
  readonly flightRedirectAvailable: boolean;
  readonly bookingAvailable: false;
  readonly paymentAvailable: false;
  readonly orderAvailable: false;
}

interface TripComAffiliateConfiguration {
  readonly enabled: boolean;
  readonly configured: boolean;
  readonly active: boolean;
  readonly baseUrl: string | null;
  readonly template: string | null;
  readonly affiliateId: string | null;
  readonly sid: string | null;
  readonly defaultLanguage: string;
  readonly defaultCurrency: string;
}

export interface TripComFlightRedirectInput {
  readonly origin: string;
  readonly destination: string;
  readonly departureDate: string;
  readonly returnDate: string | null;
  readonly tripType: "oneWay" | "roundTrip";
  readonly cabinClass: "economy" | "premiumEconomy" | "business" | "first";
  readonly adults: number;
  readonly children: number;
  readonly locale: string;
  readonly currency: string;
}

export interface TripComFlightRedirect {
  readonly destination: URL;
  readonly clickId: string;
  readonly attributionToken: string;
}

export interface AffiliateClickEvent {
  readonly clickId: string;
  readonly providerId: "trip-com-affiliate";
  readonly origin: string;
  readonly destination: string;
  readonly departureDate: string;
  readonly returnDate: string | null;
  readonly locale: string;
  readonly currency: string;
  readonly createdAt: string;
  readonly result: "redirected";
}

const clickEvents: AffiliateClickEvent[] = [];
const MAX_CLICK_EVENTS = 256;

function value(input: string | undefined): string | null {
  const result = input?.trim();
  return result && result.length <= 2_048 ? result : null;
}

function safeCredential(input: string | null): string | null {
  return input && input.length <= 256 && !/[\u0000-\u001f\u007f]/.test(input)
    ? input
    : null;
}

function safeTripComBaseUrl(input: string | null): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    if (
      url.protocol !== "https:" ||
      !TRIP_COM_HOSTS.has(url.hostname) ||
      url.username ||
      url.password
    ) {
      return null;
    }
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function templateFields(template: string): readonly string[] | null {
  if (/[\r\n]/.test(template)) return null;
  const matches = [...template.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(
    (match) => match[1] ?? "",
  );
  if (matches.some((field) => !ALLOWED_TEMPLATE_FIELDS.has(field))) return null;
  if (REQUIRED_TEMPLATE_FIELDS.some((field) => !matches.includes(field))) {
    return null;
  }
  return matches;
}

function renderTemplate(
  template: string,
  values: Readonly<Record<string, string>>,
): string | null {
  if (!templateFields(template)) return null;
  const rendered = template.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, field) =>
    encodeURIComponent(values[field] ?? ""),
  );
  return /\{[^}]*\}/.test(rendered) ? null : rendered;
}

function validateTemplate(
  template: string | null,
  baseUrl: string | null,
): boolean {
  if (!template || !baseUrl || !templateFields(template)) return false;
  const rendered = renderTemplate(template, {
    origin: "YUL",
    destination: "YYZ",
    departureDate: "2030-01-01",
    returnDate: "2030-01-08",
    tripType: "roundTrip",
    cabinClass: "economy",
    adults: "1",
    children: "0",
    locale: "en",
    currency: "CAD",
    trip_sub1: "gtai_flight_validation",
    affiliateId: "validation",
    sid: "validation",
  });
  if (!rendered) return false;
  try {
    const url = new URL(rendered, baseUrl);
    return (
      url.protocol === "https:" &&
      TRIP_COM_HOSTS.has(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function resolveTripComAffiliateConfiguration(
  environment: Environment = process.env,
): TripComAffiliateConfiguration {
  const baseUrl = safeTripComBaseUrl(
    value(environment.TRIP_COM_AFFILIATE_BASE_URL),
  );
  const template = value(environment.TRIP_COM_AFFILIATE_TEMPLATE);
  const affiliateId = safeCredential(value(environment.TRIP_COM_AFFILIATE_ID));
  const sid = safeCredential(value(environment.TRIP_COM_AFFILIATE_SID));
  const configured =
    baseUrl !== null &&
    affiliateId !== null &&
    sid !== null &&
    validateTemplate(template, baseUrl);
  const enabled = environment.TRIP_COM_AFFILIATE_ENABLED === "true";
  return Object.freeze({
    enabled,
    configured,
    active: enabled && configured,
    baseUrl,
    template: configured ? template : null,
    affiliateId: configured ? affiliateId : null,
    sid: configured ? sid : null,
    defaultLanguage: /^[a-z]{2}(?:-[A-Z]{2})?$/.test(
      environment.TRIP_COM_AFFILIATE_DEFAULT_LANGUAGE ?? "",
    )
      ? String(environment.TRIP_COM_AFFILIATE_DEFAULT_LANGUAGE)
      : "en",
    defaultCurrency: /^[A-Z]{3}$/.test(
      environment.TRIP_COM_AFFILIATE_DEFAULT_CURRENCY ?? "",
    )
      ? String(environment.TRIP_COM_AFFILIATE_DEFAULT_CURRENCY)
      : "CAD",
  });
}

export function getTripComAffiliateProviderMetadata(
  environment: Environment = process.env,
): TripComAffiliateProviderMetadata {
  const configuration = resolveTripComAffiliateConfiguration(environment);
  return Object.freeze({
    id: PROVIDER_ID,
    displayName: "Trip.com",
    providerType: "affiliateRedirect",
    configured: configuration.configured,
    enabled: configuration.enabled,
    active: configuration.active,
    capabilities: Object.freeze([
      "flightRedirect",
      "trackedOutboundClick",
    ] as const),
    flightRedirectAvailable: configuration.active,
    bookingAvailable: false,
    paymentAvailable: false,
    orderAvailable: false,
  });
}

function validCode(input: string): boolean {
  return /^[A-Z]{3}$/.test(input);
}

function validDate(input: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
  const date = new Date(`${input}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === input;
}

function validInput(input: TripComFlightRedirectInput): boolean {
  if (!validCode(input.origin) || !validCode(input.destination)) return false;
  if (input.origin === input.destination || !validDate(input.departureDate)) {
    return false;
  }
  if (
    input.tripType === "roundTrip" &&
    (!input.returnDate ||
      !validDate(input.returnDate) ||
      input.returnDate < input.departureDate)
  ) {
    return false;
  }
  if (input.tripType === "oneWay" && input.returnDate !== null) return false;
  return (
    ["economy", "premiumEconomy", "business", "first"].includes(input.cabinClass) &&
    Number.isInteger(input.adults) &&
    input.adults >= 1 &&
    input.adults <= 9 &&
    Number.isInteger(input.children) &&
    input.children >= 0 &&
    input.children <= 8 &&
    input.adults + input.children <= 9 &&
    /^[a-z]{2}(?:-[A-Z]{2})?$/.test(input.locale) &&
    /^[A-Z]{3}$/.test(input.currency)
  );
}

function attribution(clickId: string): string {
  const digest = createHash("sha256").update(clickId).digest("hex").slice(0, 20);
  return `gtai_flight_${digest}`;
}

export function buildTripComFlightRedirect(
  input: TripComFlightRedirectInput,
  options: {
    readonly environment?: Environment;
    readonly createClickId?: () => string;
  } = {},
): TripComFlightRedirect | null {
  const configuration = resolveTripComAffiliateConfiguration(options.environment);
  if (
    !configuration.active ||
    !configuration.baseUrl ||
    !configuration.template ||
    !configuration.affiliateId ||
    !configuration.sid ||
    !validInput(input)
  ) {
    return null;
  }
  const rawClickId = (options.createClickId ?? randomUUID)();
  const clickId = rawClickId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  if (clickId.length < 8) return null;
  const attributionToken = attribution(clickId);
  const rendered = renderTemplate(configuration.template, {
    origin: input.origin,
    destination: input.destination,
    departureDate: input.departureDate,
    returnDate: input.returnDate ?? "",
    tripType: input.tripType,
    cabinClass: input.cabinClass,
    adults: String(input.adults),
    children: String(input.children),
    locale: input.locale || configuration.defaultLanguage,
    currency: input.currency || configuration.defaultCurrency,
    trip_sub1: attributionToken,
    affiliateId: configuration.affiliateId,
    sid: configuration.sid,
  });
  if (!rendered) return null;
  try {
    const destination = new URL(rendered, configuration.baseUrl);
    if (
      destination.protocol !== "https:" ||
      !TRIP_COM_HOSTS.has(destination.hostname) ||
      destination.username ||
      destination.password
    ) {
      return null;
    }
    return Object.freeze({ destination, clickId, attributionToken });
  } catch {
    return null;
  }
}

export function recordTripComAffiliateClick(event: AffiliateClickEvent): void {
  clickEvents.push(Object.freeze({ ...event }));
  if (clickEvents.length > MAX_CLICK_EVENTS) clickEvents.shift();
}

export function getTripComAffiliateClickCount(): number {
  return clickEvents.length;
}
