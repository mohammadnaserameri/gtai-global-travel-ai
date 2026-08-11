import "../../server-only";

import type { ViatorAffiliateMetadata, ViatorLocale } from "./viator-types";

export const VIATOR_SANDBOX_BASE_URL = "https://api.sandbox.viator.com/partner";
export const VIATOR_PRODUCTION_BASE_URL = "https://api.viator.com/partner";

type Environment = Readonly<Record<string, string | undefined>>;

export interface ViatorConfiguration {
  readonly enabled: boolean;
  readonly configured: boolean;
  readonly active: boolean;
  readonly apiKey: string | null;
  readonly baseUrl: typeof VIATOR_SANDBOX_BASE_URL;
}

function safeKey(input: string | undefined): string | null {
  const value = input?.trim();
  return value &&
    value.length >= 16 &&
    value.length <= 512 &&
    !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : null;
}

export function resolveViatorConfiguration(
  environment: Environment = process.env,
): ViatorConfiguration {
  const apiKey = safeKey(environment.VIATOR_API_KEY);
  const enabled = environment.VIATOR_AFFILIATE_ENABLED === "true";
  return Object.freeze({
    enabled,
    configured: apiKey !== null,
    active: enabled && apiKey !== null,
    apiKey,
    baseUrl: VIATOR_SANDBOX_BASE_URL,
  });
}

export function mapViatorLocale(locale: string): ViatorLocale {
  if (locale.toLowerCase().startsWith("fr")) return "fr-FR";
  if (locale.toLowerCase().startsWith("ar")) return "ar-SA";
  return "en-US";
}

export function getViatorAffiliateMetadata(
  environment: Environment = process.env,
): ViatorAffiliateMetadata {
  const configuration = resolveViatorConfiguration(environment);
  const available = configuration.active;
  return Object.freeze({
    id: "viator-affiliate",
    displayName: "Viator",
    providerType: "affiliateContentRedirect",
    configured: configuration.configured,
    enabled: configuration.enabled,
    active: configuration.active,
    environment: "sandbox",
    capabilities: Object.freeze([
      "destinations",
      "productSearch",
      "productDetails",
      "productTags",
      "productAvailabilitySchedule",
      "trackedProductRedirect",
    ] as const),
    destinationSearchAvailable: available,
    productSearchAvailable: available,
    productDetailsAvailable: available,
    availabilityScheduleAvailable: available,
    redirectAvailable: available,
    bookingAvailable: false,
    paymentAvailable: false,
    orderAvailable: false,
    ticketingAvailable: false,
    refundAvailable: false,
    travelerSubmissionAvailable: false,
  });
}
