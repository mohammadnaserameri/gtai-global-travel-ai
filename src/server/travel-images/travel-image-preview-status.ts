import "../server-only";

import type { TravelImageAsset } from "../../features/travel-images/travel-image-types";
import { resolveTravelImage } from "./travel-image-engine";
import {
  resolveTravelImageEnvironment,
  type TravelImageEnvironment,
} from "./travel-image-env";
import type { TravelImageCacheMode } from "./travel-image-cache";

export type TravelImageEngineMode =
  "disabled" | "fallback" | "livePreview" | "liveProduction";
export type TravelImageProviderScope =
  "none" | "configuredProviders" | "pexelsOnly";
export type TravelImageRuntimeSafeReasonCode =
  | "productionDisabled"
  | "previewFlagDisabled"
  | "providerNotConfigured"
  | "liveAssetVerified"
  | "normalizedAssetUnavailable"
  | "providerUnavailable";

export interface TravelImageRuntimeVerification {
  readonly imageEngineMode: TravelImageEngineMode;
  readonly providerCallAttempted: boolean;
  readonly providerCallSucceeded: boolean;
  readonly normalizedAssetCount: number;
  readonly attributionPresent: boolean;
  readonly fallbackActive: boolean;
  readonly cacheMode: TravelImageCacheMode;
  readonly providerScope: TravelImageProviderScope;
  readonly safeReasonCode: TravelImageRuntimeSafeReasonCode;
}

interface RuntimeVerificationOptions {
  readonly environment?: TravelImageEnvironment;
  readonly resolveAsset?: () => Promise<TravelImageAsset>;
  readonly cacheMode?: TravelImageCacheMode;
}

function providerScope(
  environment: TravelImageEnvironment,
): TravelImageProviderScope {
  if (!environment.enabled) return "none";
  return environment.productionEligible ? "pexelsOnly" : "configuredProviders";
}

export async function verifyTravelImageRuntime(
  options: RuntimeVerificationOptions = {},
): Promise<TravelImageRuntimeVerification> {
  const environment = options.environment ?? resolveTravelImageEnvironment();
  const cacheMode = options.cacheMode ?? "memory";

  if (!environment.enabled) {
    return Object.freeze({
      imageEngineMode: "disabled",
      providerCallAttempted: false,
      providerCallSucceeded: false,
      normalizedAssetCount: 0,
      attributionPresent: false,
      fallbackActive: true,
      cacheMode,
      providerScope: "none",
      safeReasonCode: environment.productionBlocked
        ? "productionDisabled"
        : "previewFlagDisabled",
    });
  }

  if (
    !environment.unsplashAccessKey &&
    !environment.pexelsApiKey &&
    !environment.pixabayApiKey
  ) {
    return Object.freeze({
      imageEngineMode: "fallback",
      providerCallAttempted: false,
      providerCallSucceeded: false,
      normalizedAssetCount: 0,
      attributionPresent: false,
      fallbackActive: true,
      cacheMode,
      providerScope: "none",
      safeReasonCode: "providerNotConfigured",
    });
  }

  try {
    const asset = await (
      options.resolveAsset ??
      (() => resolveTravelImage({ category: "hero", destination: "Global" }))
    )();
    const attributionPresent =
      !asset.isFallback &&
      asset.attribution.creatorName.trim().length > 0 &&
      asset.attribution.providerName.trim().length > 0;
    const verified = !asset.isFallback && attributionPresent;

    return Object.freeze({
      imageEngineMode: verified
        ? environment.productionEligible
          ? "liveProduction"
          : "livePreview"
        : "fallback",
      providerCallAttempted: true,
      providerCallSucceeded: verified,
      normalizedAssetCount: verified ? 1 : 0,
      attributionPresent,
      fallbackActive: !verified,
      cacheMode,
      providerScope: providerScope(environment),
      safeReasonCode: verified ? "liveAssetVerified" : "normalizedAssetUnavailable",
    });
  } catch {
    return Object.freeze({
      imageEngineMode: "fallback",
      providerCallAttempted: true,
      providerCallSucceeded: false,
      normalizedAssetCount: 0,
      attributionPresent: false,
      fallbackActive: true,
      cacheMode,
      providerScope: providerScope(environment),
      safeReasonCode: "providerUnavailable",
    });
  }
}

export const getTravelImagePreviewStatus = verifyTravelImageRuntime;
