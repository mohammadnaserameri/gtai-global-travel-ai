export type ViatorLocale = "en-US" | "fr-FR" | "ar-SA";

export interface ViatorDestination {
  readonly destinationId: string;
  readonly name: string;
  readonly type: string;
  readonly parentDestinationId: string | null;
  readonly defaultCurrencyCode: string | null;
  readonly timeZone: string | null;
  readonly coordinates: Readonly<{ latitude: number; longitude: number }> | null;
}

export interface ViatorTag {
  readonly tagId: number;
  readonly name: string;
  readonly parentTagIds: readonly number[];
}

export interface ViatorImage {
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

export interface ViatorProductSummary {
  readonly productCode: string;
  readonly title: string;
  readonly description: string | null;
  readonly images: readonly ViatorImage[];
  readonly rating: number | null;
  readonly reviewCount: number | null;
  readonly fromPrice: number | null;
  readonly currency: string | null;
  readonly tags: readonly number[];
  readonly destinations: readonly string[];
  readonly durationMinutes: Readonly<{ from: number; to: number }> | null;
  readonly freeCancellation: boolean;
}

export interface ViatorProductDetails extends ViatorProductSummary {
  readonly inclusions: readonly string[];
  readonly exclusions: readonly string[];
  readonly itinerarySummary: string | null;
  readonly logisticsSummary: string | null;
  readonly cancellationSummary: string | null;
  readonly productOptions: readonly Readonly<{ code: string; title: string }>[];
}

export interface ViatorSearchInput {
  readonly destinationId: string;
  readonly tags?: readonly number[];
  readonly startDate?: string;
  readonly endDate?: string;
  readonly lowestPrice?: number;
  readonly highestPrice?: number;
  readonly freeCancellation?: boolean;
  readonly sort?:
    | "DEFAULT"
    | "PRICE"
    | "TRAVELER_RATING"
    | "ITINERARY_DURATION"
    | "NEW_ON_VIATOR";
  readonly order?: "ASCENDING" | "DESCENDING";
  readonly page?: number;
  readonly count?: number;
  readonly currency?: string;
}

export interface ViatorSearchResult {
  readonly products: readonly ViatorProductSummary[];
  readonly totalCount: number;
  readonly page: number;
  readonly count: number;
  readonly rejectedCount: number;
}

export interface ViatorAvailabilitySummary {
  readonly supported: boolean;
  readonly productCode: string;
  readonly currency: string | null;
  readonly optionCount: number;
  readonly seasonCount: number;
  readonly hasScheduleData: boolean;
}

export interface ViatorAffiliateMetadata {
  readonly id: "viator-affiliate";
  readonly displayName: "Viator";
  readonly providerType: "affiliateContentRedirect";
  readonly configured: boolean;
  readonly enabled: boolean;
  readonly active: boolean;
  readonly environment: "sandbox";
  readonly capabilities: readonly [
    "destinations",
    "productSearch",
    "productDetails",
    "productTags",
    "productAvailabilitySchedule",
    "trackedProductRedirect",
  ];
  readonly destinationSearchAvailable: boolean;
  readonly productSearchAvailable: boolean;
  readonly productDetailsAvailable: boolean;
  readonly availabilityScheduleAvailable: boolean;
  readonly redirectAvailable: boolean;
  readonly bookingAvailable: false;
  readonly paymentAvailable: false;
  readonly orderAvailable: false;
  readonly ticketingAvailable: false;
  readonly refundAvailable: false;
  readonly travelerSubmissionAvailable: false;
}
