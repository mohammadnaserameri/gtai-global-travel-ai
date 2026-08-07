import "../../server-only";

import type { TravelImageAsset } from "../../../features/travel-images/travel-image-types";
import {
  isRecord,
  readNumber,
  readString,
  safeProviderFetchInit,
  type TravelImageProvider,
  type TravelImageProviderSearchOptions,
} from "./travel-image-provider";

interface PixabayProviderOptions {
  readonly apiKey: string;
  readonly fetcher?: typeof fetch;
  readonly now?: () => Date;
}

export class PixabayTravelImageProvider implements TravelImageProvider {
  readonly providerId = "pixabay" as const;
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;

  constructor(options: PixabayProviderOptions) {
    this.apiKey = options.apiKey;
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async search(
    query: string,
    options: TravelImageProviderSearchOptions = {},
  ): Promise<readonly TravelImageAsset[]> {
    const url = new URL("https://pixabay.com/api/");
    url.searchParams.set("key", this.apiKey);
    url.searchParams.set("q", query);
    url.searchParams.set("per_page", "20");
    url.searchParams.set("orientation", "horizontal");
    url.searchParams.set("image_type", "photo");
    url.searchParams.set("safesearch", "true");

    const response = await this.fetcher(url, {
      ...safeProviderFetchInit(options),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return [];

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.hits)) return [];

    const fetchedAt = this.now().toISOString();
    return payload.hits.flatMap((value): readonly TravelImageAsset[] => {
      if (!isRecord(value)) return [];
      const rawId = value.id;
      const id =
        typeof rawId === "number" || typeof rawId === "string"
          ? String(rawId)
          : null;
      const width =
        readNumber(value, "imageWidth") ?? readNumber(value, "webformatWidth");
      const height =
        readNumber(value, "imageHeight") ?? readNumber(value, "webformatHeight");
      const src =
        readString(value, "largeImageURL") ?? readString(value, "webformatURL");
      const thumbnailSrc =
        readString(value, "webformatURL") ?? readString(value, "previewURL");
      const creatorName = readString(value, "user");
      if (!id || !width || !height || !src || !thumbnailSrc || !creatorName) {
        return [];
      }
      return [
        {
          id: `pixabay:${id}`,
          provider: this.providerId,
          src,
          thumbnailSrc,
          width,
          height,
          alt: readString(value, "tags") ?? query,
          attribution: {
            creatorName,
            creatorUrl: readString(value, "pageURL"),
            providerName: "Pixabay",
            providerUrl: "https://pixabay.com",
          },
          sourcePageUrl: readString(value, "pageURL"),
          query,
          fetchedAt,
          isFallback: false,
        },
      ];
    });
  }
}
