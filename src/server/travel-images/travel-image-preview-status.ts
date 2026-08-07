import "../server-only";

import type { TravelImageAsset } from "../../features/travel-images/travel-image-types";
import {
  getTravelImageEngine,
  type TravelImageRotationSelection,
} from "./travel-image-engine";
import {
  resolveTravelImageEnvironment,
  type TravelImageEnvironment,
} from "./travel-image-env";
import {
  getTravelImageCacheRuntimeStatus,
  type TravelImageCacheMode,
} from "./travel-image-cache";
import { resolveTravelImageRefreshBudget } from "./travel-image-refresh-budget";

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
  readonly durableCacheConfigured: boolean;
  readonly durableCacheActive: boolean;
  readonly refreshBudgetConfigured: boolean;
  readonly maxAssetsPerKey: number;
  readonly rotationEnabled: boolean;
  readonly rotationKey: string;
  readonly assetCount: number;
  readonly selectedIndex: number | null;
  readonly providerScope: TravelImageProviderScope;
  readonly safeReasonCode: TravelImageRuntimeSafeReasonCode;
}

interface RuntimeVerificationOptions {
  readonly environment?: TravelImageEnvironment;
  readonly resolveAsset?: () => Promise<TravelImageAsset>;
  readonly resolveSelection?: () => Promise<TravelImageRotationSelection>;
  readonly cacheMode?: TravelImageCacheMode;
  readonly rotationKey?: string;
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
  const initialCache = getTravelImageCacheRuntimeStatus();
  const refreshBudget = resolveTravelImageRefreshBudget();
  const rotationKey = options.rotationKey ?? new Date().toISOString().slice(0, 10);
  const cacheMode = options.cacheMode ?? initialCache.cacheMode;
  const cacheFields = {
    cacheMode,
    durableCacheConfigured: initialCache.durableCacheConfigured,
    durableCacheActive: initialCache.durableCacheActive,
    refreshBudgetConfigured: refreshBudget.configured,
    maxAssetsPerKey: refreshBudget.maxAssetsPerKey,
  } as const;

  if (!environment.enabled) {
    return Object.freeze({
      imageEngineMode: "disabled",
      providerCallAttempted: false,
      providerCallSucceeded: false,
      normalizedAssetCount: 0,
      attributionPresent: false,
      fallbackActive: true,
      ...cacheFields,
      rotationEnabled: false,
      rotationKey,
      assetCount: 0,
      selectedIndex: null,
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
      ...cacheFields,
      rotationEnabled: true,
      rotationKey,
      assetCount: 0,
      selectedIndex: null,
      providerScope: "none",
      safeReasonCode: "providerNotConfigured",
    });
  }

  try {
    let selection: TravelImageRotationSelection;
    if (options.resolveSelection) {
      selection = await options.resolveSelection();
    } else if (options.resolveAsset) {
      const asset = await options.resolveAsset();
      selection = {
        asset,
        rotationKey,
        selectedIndex: asset.isFallback ? null : 0,
        assetCount: asset.isFallback ? 0 : 1,
        rotatedAtSafeDate: rotationKey,
        cacheHit: false,
      };
    } else {
      selection = await getTravelImageEngine().resolveWithMetadata({
        category: "hero",
        destination: "Global",
      });
    }
    const asset = selection.asset;
    const attributionPresent =
      !asset.isFallback &&
      asset.attribution.creatorName.trim().length > 0 &&
      asset.attribution.providerName.trim().length > 0;
    const verified = !asset.isFallback && attributionPresent;

    const currentCache = getTravelImageCacheRuntimeStatus();
    return Object.freeze({
      imageEngineMode: verified
        ? environment.productionEligible
          ? "liveProduction"
          : "livePreview"
        : "fallback",
      providerCallAttempted: true,
      providerCallSucceeded: verified,
      normalizedAssetCount: verified ? selection.assetCount : 0,
      attributionPresent,
      fallbackActive: !verified,
      cacheMode: options.cacheMode ?? currentCache.cacheMode,
      durableCacheConfigured: currentCache.durableCacheConfigured,
      durableCacheActive: currentCache.durableCacheActive,
      refreshBudgetConfigured: refreshBudget.configured,
      maxAssetsPerKey: refreshBudget.maxAssetsPerKey,
      rotationEnabled: true,
      rotationKey: selection.rotationKey,
      assetCount: selection.assetCount,
      selectedIndex: selection.selectedIndex,
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
      ...cacheFields,
      rotationEnabled: true,
      rotationKey,
      assetCount: 0,
      selectedIndex: null,
      providerScope: providerScope(environment),
      safeReasonCode: "providerUnavailable",
    });
  }
}

export const getTravelImagePreviewStatus = verifyTravelImageRuntime;
