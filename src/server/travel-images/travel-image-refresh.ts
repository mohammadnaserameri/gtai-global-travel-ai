import "../server-only";

import type { TravelImageRequest } from "../../features/travel-images/travel-image-types";
import { getTravelImageEngine } from "./travel-image-engine";

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
}

export async function refreshDailyTravelImages(): Promise<TravelImageRefreshResult> {
  const engine = getTravelImageEngine();
  let liveAssetCount = 0;
  let fallbackAssetCount = 0;

  for (let index = 0; index < DAILY_TRAVEL_IMAGE_TARGETS.length; index += 3) {
    const batch = DAILY_TRAVEL_IMAGE_TARGETS.slice(index, index + 3);
    const assets = await engine.resolveMany(batch, { forceRefresh: true });
    for (const asset of assets) {
      if (asset.isFallback) fallbackAssetCount += 1;
      else liveAssetCount += 1;
    }
  }

  return {
    ok: true,
    targetCount: DAILY_TRAVEL_IMAGE_TARGETS.length,
    liveAssetCount,
    fallbackAssetCount,
  };
}
