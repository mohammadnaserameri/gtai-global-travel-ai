import "../server-only";

import type { TravelImageAsset } from "../../features/travel-images/travel-image-types";
import { resolveTravelImage } from "./travel-image-engine";
import {
  resolveTravelImageEnvironment,
  type TravelImageEnvironment,
} from "./travel-image-env";
import type { TravelImageCacheMode } from "./travel-image-cache";

export type TravelImageEngineMode = "disabled" | "fallback" | "livePreview";
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
  readonly providerNamesConfigured: {
    readonly primary: boolean;
    readonly secondary: boolean;
    readonly tertiary: boolean;
  };
  readonly lastSafeReasonCode: TravelImageRuntimeSafeReasonCode;
}

interface RuntimeVerificationOptions {
  readonly environment?: TravelImageEnvironment;
  readonly resolveAsset?: () => Promise<TravelImageAsset>;
  readonly cacheMode?: TravelImageCacheMode;
}

function configuredProviders(environment: TravelImageEnvironment) {
  return Object.freeze({
    primary: environment.unsplashAccessKey !== null,
    secondary: environment.pexelsApiKey !== null,
    tertiary: environment.pixabayApiKey !== null,
  });
}

function safeResult(
  values: Omit<TravelImageRuntimeVerification, "providerNamesConfigured">,
  environment: TravelImageEnvironment,
): TravelImageRuntimeVerification {
  return Object.freeze({
    ...values,
    providerNamesConfigured: configuredProviders(environment),
  });
}

export async function verifyTravelImageRuntime(
  options: RuntimeVerificationOptions = {},
): Promise<TravelImageRuntimeVerification> {
  const environment = options.environment ?? resolveTravelImageEnvironment();
  const cacheMode = options.cacheMode ?? "memory";

  if (!environment.enabled) {
    return safeResult(
      {
        imageEngineMode: "disabled",
        providerCallAttempted: false,
        providerCallSucceeded: false,
        normalizedAssetCount: 0,
        attributionPresent: false,
        fallbackActive: true,
        cacheMode,
        lastSafeReasonCode: environment.productionBlocked
          ? "productionDisabled"
          : "previewFlagDisabled",
      },
      environment,
    );
  }

  const providers = configuredProviders(environment);
  if (!providers.primary && !providers.secondary && !providers.tertiary) {
    return safeResult(
      {
        imageEngineMode: "fallback",
        providerCallAttempted: false,
        providerCallSucceeded: false,
        normalizedAssetCount: 0,
        attributionPresent: false,
        fallbackActive: true,
        cacheMode,
        lastSafeReasonCode: "providerNotConfigured",
      },
      environment,
    );
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

    return safeResult(
      {
        imageEngineMode: verified ? "livePreview" : "fallback",
        providerCallAttempted: true,
        providerCallSucceeded: verified,
        normalizedAssetCount: verified ? 1 : 0,
        attributionPresent,
        fallbackActive: !verified,
        cacheMode,
        lastSafeReasonCode: verified
          ? "liveAssetVerified"
          : "normalizedAssetUnavailable",
      },
      environment,
    );
  } catch {
    return safeResult(
      {
        imageEngineMode: "fallback",
        providerCallAttempted: true,
        providerCallSucceeded: false,
        normalizedAssetCount: 0,
        attributionPresent: false,
        fallbackActive: true,
        cacheMode,
        lastSafeReasonCode: "providerUnavailable",
      },
      environment,
    );
  }
}

export const getTravelImagePreviewStatus = verifyTravelImageRuntime;
