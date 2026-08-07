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

const MAX_ROTATING_ASSETS = 6;
const DAY_MS = 86_400_000;

export interface TravelImageRotationSelection {
  readonly asset: TravelImageAsset;
  readonly rotationKey: string;
  readonly selectedIndex: number | null;
  readonly assetCount: number;
  readonly rotatedAtSafeDate: string;
  readonly cacheHit: boolean;
}

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

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectRotatedTravelImage(
  assets: readonly TravelImageAsset[],
  request: TravelImageRequest,
  dayKey: string,
  fallback: TravelImageAsset = createFallbackTravelImage(request),
  cacheHit = false,
): TravelImageRotationSelection {
  if (assets.length === 0) {
    return Object.freeze({
      asset: fallback,
      rotationKey: dayKey,
      selectedIndex: null,
      assetCount: 0,
      rotatedAtSafeDate: dayKey,
      cacheHit,
    });
  }
  const parsedDay = Date.parse(`${dayKey}T00:00:00.000Z`);
  const dayNumber = Number.isFinite(parsedDay) ? Math.floor(parsedDay / DAY_MS) : 0;
  const selectedIndex = (stableHash(cacheKey(request)) + dayNumber) % assets.length;
  return Object.freeze({
    asset: assets[selectedIndex] ?? fallback,
    rotationKey: dayKey,
    selectedIndex,
    assetCount: assets.length,
    rotatedAtSafeDate: dayKey,
    cacheHit,
  });
}

export class TravelImageEngine {
  private readonly enabled: boolean;
  private readonly providers: readonly TravelImageProvider[];
  private readonly cache: TravelImageMetadataCache;
  private readonly now: () => Date;

  constructor(options: {
    readonly enabled: boolean;
    readonly providers: readonly TravelImageProvider[];
    readonly cache?: TravelImageMetadataCache;
    readonly now?: () => Date;
  }) {
    this.enabled = options.enabled;
    this.providers = options.providers;
    this.cache = options.cache ?? travelImageMetadataCache;
    this.now = options.now ?? (() => new Date());
  }

  async resolve(
    request: TravelImageRequest,
    options: { readonly forceRefresh?: boolean } = {},
  ): Promise<TravelImageAsset> {
    return (await this.resolveWithMetadata(request, options)).asset;
  }

  async resolveWithMetadata(
    request: TravelImageRequest,
    options: { readonly forceRefresh?: boolean } = {},
  ): Promise<TravelImageRotationSelection> {
    const fallback = createFallbackTravelImage(request);
    const rotationKey = utcDayKey(this.now());
    if (!this.enabled || this.providers.length === 0) {
      return selectRotatedTravelImage([], request, rotationKey, fallback);
    }

    const key = cacheKey(request);
    if (!options.forceRefresh) {
      const cached = await this.cache.getMany(key);
      if (cached?.length) {
        return selectRotatedTravelImage(
          cached,
          request,
          rotationKey,
          fallback,
          true,
        );
      }
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
    const ranked = rankTravelImageAssets(candidates, request).slice(
      0,
      MAX_ROTATING_ASSETS,
    );
    if (ranked.length > 0) await this.cache.setMany(key, ranked);
    return selectRotatedTravelImage(ranked, request, rotationKey, fallback);
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
  if (environment.productionDeployment) {
    return environment.productionEligible && environment.pexelsApiKey
      ? [new PexelsTravelImageProvider({ apiKey: environment.pexelsApiKey })]
      : [];
  }
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
