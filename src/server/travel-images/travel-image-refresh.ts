import "../server-only";

import type { TravelImageRequest } from "../../features/travel-images/travel-image-types";
import { getTravelImageCacheRuntimeStatus } from "./travel-image-cache";
import { getTravelImageEngine } from "./travel-image-engine";

export const DAILY_REFRESH_BATCH_SIZE = 3;
export const DAILY_REFRESH_PROVIDER_CALL_BUDGET = 14;

export const DAILY_TRAVEL_IMAGE_TARGETS: readonly TravelImageRequest[] =
  Object.freeze([
    { category: "hero", destination: "Global" },
    { category: "explore", destination: "Global" },
    { category: "flights", destination: "Global" },
    { category: "stays", destination: "Global" },
    { category: "cars", destination: "Global" },
    { category: "packages", destination: "Global" },
    { category: "destination", destination: "Toronto", country: "Canada" },
    { category: "destination", destination: "Vancouver", country: "Canada" },
    {
      category: "destination",
      destination: "London",
      country: "United Kingdom",
    },
    { category: "destination", destination: "Paris", country: "France" },
    {
      category: "destination",
      destination: "Dubai",
      country: "United Arab Emirates",
    },
    { category: "destination", destination: "Tokyo", country: "Japan" },
    { category: "destination", destination: "Istanbul", country: "Turkey" },
    { category: "destination", destination: "Barcelona", country: "Spain" },
  ]);

export interface TravelImageRefreshResult {
  readonly ok: true;
  readonly targetCount: number;
  readonly liveAssetCount: number;
  readonly fallbackAssetCount: number;
  readonly partialFailureCount: number;
  readonly providerCallBudget: number;
  readonly cacheMode:
    "memory" | "durable" | "durableUnavailable" | "nextFetchCache";
}

export async function refreshDailyTravelImages(): Promise<TravelImageRefreshResult> {
  const engine = getTravelImageEngine();
  let liveAssetCount = 0;
  let fallbackAssetCount = 0;
  let partialFailureCount = 0;
  const targets = DAILY_TRAVEL_IMAGE_TARGETS.slice(
    0,
    DAILY_REFRESH_PROVIDER_CALL_BUDGET,
  );

  for (let index = 0; index < targets.length; index += DAILY_REFRESH_BATCH_SIZE) {
    const batch = targets.slice(index, index + DAILY_REFRESH_BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map((request) => engine.resolve(request, { forceRefresh: true })),
    );
    for (const result of settled) {
      if (result.status === "rejected") {
        partialFailureCount += 1;
        fallbackAssetCount += 1;
      } else if (result.value.isFallback) {
        fallbackAssetCount += 1;
      } else {
        liveAssetCount += 1;
      }
    }
  }

  return {
    ok: true,
    targetCount: targets.length,
    liveAssetCount,
    fallbackAssetCount,
    partialFailureCount,
    providerCallBudget: DAILY_REFRESH_PROVIDER_CALL_BUDGET,
    cacheMode: getTravelImageCacheRuntimeStatus().cacheMode,
  };
}
