import "../server-only";

import { resolveTravelImage } from "./travel-image-engine";
import { resolveTravelImageEnvironment } from "./travel-image-env";
import { travelImageMetadataCache } from "./travel-image-cache";

export type TravelImageEngineMode = "disabled" | "fallback" | "livePreview";

export interface TravelImagePreviewStatus {
  readonly imageEngineMode: TravelImageEngineMode;
  readonly providersConfigured: {
    readonly primary: boolean;
    readonly secondary: boolean;
    readonly tertiary: boolean;
  };
  readonly cachedAssetCount: number;
  readonly fallbackActive: boolean;
  readonly providerRequestsServerSideOnly: true;
  readonly lastRefreshSafeStatus: "disabled" | "fallback" | "live";
}

export async function getTravelImagePreviewStatus(): Promise<TravelImagePreviewStatus> {
  const environment = resolveTravelImageEnvironment();
  const providersConfigured = Object.freeze({
    primary: environment.unsplashAccessKey !== null,
    secondary: environment.pexelsApiKey !== null,
    tertiary: environment.pixabayApiKey !== null,
  });

  if (!environment.enabled) {
    return Object.freeze({
      imageEngineMode: "disabled",
      providersConfigured,
      cachedAssetCount: travelImageMetadataCache.size(),
      fallbackActive: true,
      providerRequestsServerSideOnly: true,
      lastRefreshSafeStatus: "disabled",
    });
  }

  const asset = await resolveTravelImage({
    category: "hero",
    destination: "Global",
  });
  const live = !asset.isFallback;

  return Object.freeze({
    imageEngineMode: live ? "livePreview" : "fallback",
    providersConfigured,
    cachedAssetCount: travelImageMetadataCache.size(),
    fallbackActive: !live,
    providerRequestsServerSideOnly: true,
    lastRefreshSafeStatus: live ? "live" : "fallback",
  });
}
