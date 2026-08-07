import "../server-only";

import type {
  TravelImageAsset,
  TravelImageCategory,
  TravelImageRequest,
} from "../../features/travel-images/travel-image-types";
import { resolveTravelImageEnvironment } from "./travel-image-env";
import {
  travelImageMetadataCache,
  type TravelImageMetadataCache,
} from "./travel-image-cache";
import { generateTravelImageQueries } from "./travel-image-query";
import { rankTravelImageAssets } from "./travel-image-ranking";
import type { TravelImageProvider } from "./providers/travel-image-provider";
import { UnsplashTravelImageProvider } from "./providers/unsplash-provider";
import { PexelsTravelImageProvider } from "./providers/pexels-provider";
import { PixabayTravelImageProvider } from "./providers/pixabay-provider";

const FALLBACK_PATHS: Readonly<Record<TravelImageCategory, string>> = Object.freeze(
  {
    hero: "/images/travel/hero-fallback.svg",
    destination: "/images/travel/destination-fallback.svg",
    explore: "/images/travel/explore-fallback.svg",
    flights: "/images/travel/flights-fallback.svg",
    stays: "/images/travel/stays-fallback.svg",
    cars: "/images/travel/cars-fallback.svg",
    packages: "/images/travel/packages-fallback.svg",
  },
);

export function createFallbackTravelImage(
  request: TravelImageRequest,
): TravelImageAsset {
  const destination = request.destination?.trim() || "Travel";
  return Object.freeze({
    id: `gtai-static:${request.category}`,
    provider: "gtai-static",
    src: FALLBACK_PATHS[request.category],
    thumbnailSrc: FALLBACK_PATHS[request.category],
    width: 1_600,
    height: 900,
    alt: `${destination} travel illustration`,
    attribution: {
      creatorName: "GTAI",
      creatorUrl: null,
      providerName: "GTAI",
      providerUrl: null,
    },
    sourcePageUrl: null,
    query: "",
    fetchedAt: "static",
    isFallback: true,
  });
}

function cacheKey(request: TravelImageRequest): string {
  return [
    request.category,
    request.destination?.normalize("NFKC").toLocaleLowerCase().trim() ?? "",
    request.country?.normalize("NFKC").toLocaleLowerCase().trim() ?? "",
  ].join(":");
}

export class TravelImageEngine {
  private readonly enabled: boolean;
  private readonly providers: readonly TravelImageProvider[];
  private readonly cache: TravelImageMetadataCache;

  constructor(options: {
    readonly enabled: boolean;
    readonly providers: readonly TravelImageProvider[];
    readonly cache?: TravelImageMetadataCache;
  }) {
    this.enabled = options.enabled;
    this.providers = options.providers;
    this.cache = options.cache ?? travelImageMetadataCache;
  }

  async resolve(
    request: TravelImageRequest,
    options: { readonly forceRefresh?: boolean } = {},
  ): Promise<TravelImageAsset> {
    const fallback = createFallbackTravelImage(request);
    if (!this.enabled || this.providers.length === 0) return fallback;

    const key = cacheKey(request);
    if (!options.forceRefresh) {
      const cached = this.cache.get(key);
      if (cached) return cached;
    }

    const queries = generateTravelImageQueries(request);
    const settled = await Promise.allSettled(
      this.providers.map((provider, index) =>
        provider.search(queries[index % queries.length] ?? queries[0] ?? "travel", {
          forceRefresh: options.forceRefresh,
        }),
      ),
    );
    const candidates = settled.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    );
    const selected = rankTravelImageAssets(candidates, request)[0] ?? fallback;
    this.cache.set(key, selected);
    return selected;
  }

  async resolveMany(
    requests: readonly TravelImageRequest[],
    options: { readonly forceRefresh?: boolean } = {},
  ): Promise<readonly TravelImageAsset[]> {
    return Promise.all(requests.map((request) => this.resolve(request, options)));
  }
}

export function createTravelImageProviders(
  environment = resolveTravelImageEnvironment(),
): readonly TravelImageProvider[] {
  const providers: TravelImageProvider[] = [];
  if (environment.unsplashAccessKey) {
    providers.push(
      new UnsplashTravelImageProvider({
        accessKey: environment.unsplashAccessKey,
      }),
    );
  }
  if (environment.pexelsApiKey) {
    providers.push(
      new PexelsTravelImageProvider({ apiKey: environment.pexelsApiKey }),
    );
  }
  if (environment.pixabayApiKey) {
    providers.push(
      new PixabayTravelImageProvider({ apiKey: environment.pixabayApiKey }),
    );
  }
  return providers;
}

let runtimeEngine: TravelImageEngine | null = null;

export function getTravelImageEngine(): TravelImageEngine {
  if (!runtimeEngine) {
    const environment = resolveTravelImageEnvironment();
    runtimeEngine = new TravelImageEngine({
      enabled: environment.enabled,
      providers: createTravelImageProviders(environment),
    });
  }
  return runtimeEngine;
}

export async function resolveTravelImage(
  request: TravelImageRequest,
): Promise<TravelImageAsset> {
  return getTravelImageEngine().resolve(request);
}

export async function resolveTravelImages(
  requests: readonly TravelImageRequest[],
): Promise<readonly TravelImageAsset[]> {
  return getTravelImageEngine().resolveMany(requests);
}
