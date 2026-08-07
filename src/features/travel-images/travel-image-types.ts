export const TRAVEL_IMAGE_CATEGORIES = [
  "hero",
  "destination",
  "explore",
  "flights",
  "stays",
  "cars",
  "packages",
] as const;

export type TravelImageCategory = (typeof TRAVEL_IMAGE_CATEGORIES)[number];

export type TravelImageProviderId =
  "unsplash" | "pexels" | "pixabay" | "gtai-static";

export interface TravelImageAttribution {
  readonly creatorName: string;
  readonly creatorUrl: string | null;
  readonly providerName: string;
  readonly providerUrl: string | null;
}

export interface TravelImageAsset {
  readonly id: string;
  readonly provider: TravelImageProviderId;
  readonly src: string;
  readonly thumbnailSrc: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  readonly attribution: TravelImageAttribution;
  readonly sourcePageUrl: string | null;
  readonly query: string;
  readonly fetchedAt: string;
  readonly isFallback: boolean;
}

export interface TravelImageRequest {
  readonly category: TravelImageCategory;
  readonly destination?: string;
  readonly country?: string;
}
