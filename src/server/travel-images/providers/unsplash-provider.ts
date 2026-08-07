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

interface UnsplashProviderOptions {
  readonly accessKey: string;
  readonly fetcher?: typeof fetch;
  readonly now?: () => Date;
}

export class UnsplashTravelImageProvider implements TravelImageProvider {
  readonly providerId = "unsplash" as const;
  private readonly accessKey: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;

  constructor(options: UnsplashProviderOptions) {
    this.accessKey = options.accessKey;
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async search(
    query: string,
    options: TravelImageProviderSearchOptions = {},
  ): Promise<readonly TravelImageAsset[]> {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", "12");
    url.searchParams.set("orientation", "landscape");
    url.searchParams.set("content_filter", "high");

    const response = await this.fetcher(url, {
      ...safeProviderFetchInit(options),
      headers: {
        Accept: "application/json",
        Authorization: `Client-ID ${this.accessKey}`,
      },
    });
    if (!response.ok) return [];

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.results)) return [];

    const fetchedAt = this.now().toISOString();
    return payload.results.flatMap((value): readonly TravelImageAsset[] => {
      if (!isRecord(value) || !isRecord(value.urls) || !isRecord(value.user)) {
        return [];
      }
      const id = readString(value, "id");
      const width = readNumber(value, "width");
      const height = readNumber(value, "height");
      const src = readString(value.urls, "regular");
      const thumbnailSrc = readString(value.urls, "small");
      const sourcePageUrl = isRecord(value.links)
        ? readString(value.links, "html")
        : null;
      const creatorName =
        readString(value.user, "name") ?? readString(value.user, "username");
      const creatorUrl = isRecord(value.user.links)
        ? readString(value.user.links, "html")
        : null;
      if (!id || !width || !height || !src || !thumbnailSrc || !creatorName) {
        return [];
      }
      return [
        {
          id: `unsplash:${id}`,
          provider: this.providerId,
          src,
          thumbnailSrc,
          width,
          height,
          alt:
            readString(value, "alt_description") ??
            readString(value, "description") ??
            query,
          attribution: {
            creatorName,
            creatorUrl,
            providerName: "Unsplash",
            providerUrl: "https://unsplash.com",
          },
          sourcePageUrl,
          query,
          fetchedAt,
          isFallback: false,
        },
      ];
    });
  }
}
