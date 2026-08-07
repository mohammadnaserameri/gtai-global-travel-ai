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

interface PexelsProviderOptions {
  readonly apiKey: string;
  readonly fetcher?: typeof fetch;
  readonly now?: () => Date;
}

export class PexelsTravelImageProvider implements TravelImageProvider {
  readonly providerId = "pexels" as const;
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;

  constructor(options: PexelsProviderOptions) {
    this.apiKey = options.apiKey;
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async search(
    query: string,
    options: TravelImageProviderSearchOptions = {},
  ): Promise<readonly TravelImageAsset[]> {
    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", "12");
    url.searchParams.set("orientation", "landscape");

    const response = await this.fetcher(url, {
      ...safeProviderFetchInit(options),
      headers: { Accept: "application/json", Authorization: this.apiKey },
    });
    if (!response.ok) return [];

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.photos)) return [];

    const fetchedAt = this.now().toISOString();
    return payload.photos.flatMap((value): readonly TravelImageAsset[] => {
      if (!isRecord(value) || !isRecord(value.src)) return [];
      const rawId = value.id;
      const id =
        typeof rawId === "number" || typeof rawId === "string"
          ? String(rawId)
          : null;
      const width = readNumber(value, "width");
      const height = readNumber(value, "height");
      const src =
        readString(value.src, "large2x") ?? readString(value.src, "large");
      const thumbnailSrc =
        readString(value.src, "medium") ?? readString(value.src, "small");
      const creatorName = readString(value, "photographer");
      if (!id || !width || !height || !src || !thumbnailSrc || !creatorName) {
        return [];
      }
      return [
        {
          id: `pexels:${id}`,
          provider: this.providerId,
          src,
          thumbnailSrc,
          width,
          height,
          alt: readString(value, "alt") ?? query,
          attribution: {
            creatorName,
            creatorUrl: readString(value, "photographer_url"),
            providerName: "Pexels",
            providerUrl: "https://www.pexels.com",
          },
          sourcePageUrl: readString(value, "url"),
          query,
          fetchedAt,
          isFallback: false,
        },
      ];
    });
  }
}
