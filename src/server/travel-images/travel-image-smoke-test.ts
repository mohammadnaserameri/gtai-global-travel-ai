import "../server-only";

import type { TravelImageAsset } from "../../features/travel-images/travel-image-types";
import { MemoryTravelImageMetadataCache } from "./travel-image-cache";
import {
  createTravelImageProviders,
  TravelImageEngine,
} from "./travel-image-engine";
import { resolveTravelImageEnvironment } from "./travel-image-env";
import type { TravelImageProvider } from "./providers/travel-image-provider";

export const TRAVEL_IMAGE_LIVE_SMOKE_TEST_ENV_NAME =
  "TRAVEL_IMAGE_LIVE_SMOKE_TEST_ENABLED" as const;

type SmokeTestMode = "disabled" | "local" | "preview";
type SmokeSafeReasonCode =
  | "smokeTestDisabled"
  | "productionForbidden"
  | "providerNotConfigured"
  | "liveAssetVerified"
  | "normalizedAssetUnavailable"
  | "providerUnavailable";

export interface TravelImageLiveSmokeResult {
  readonly smokeTestMode: SmokeTestMode;
  readonly providerCallAttempted: boolean;
  readonly providerCallSucceeded: boolean;
  readonly normalizedAssetCount: number;
  readonly destinationKey: "paris";
  readonly category: "destination";
  readonly attributionPresent: boolean;
  readonly fallbackActive: boolean;
  readonly imageUrlHostOnly: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly safeReasonCode: SmokeSafeReasonCode;
}

type Environment = Readonly<Record<string, string | undefined>>;

interface SmokeTestOptions {
  readonly environment?: Environment;
  readonly providers?: readonly TravelImageProvider[];
  readonly resolveAsset?: () => Promise<TravelImageAsset>;
}

const APPROVED_IMAGE_HOSTS = new Set([
  "images.unsplash.com",
  "images.pexels.com",
  "pixabay.com",
  "cdn.pixabay.com",
]);

function imageHostOnly(source: string): string | null {
  try {
    const url = new URL(source);
    return url.protocol === "https:" && APPROVED_IMAGE_HOSTS.has(url.hostname)
      ? url.hostname
      : null;
  } catch {
    return null;
  }
}

function result(
  values: Omit<TravelImageLiveSmokeResult, "destinationKey" | "category">,
): TravelImageLiveSmokeResult {
  return Object.freeze({
    ...values,
    destinationKey: "paris",
    category: "destination",
  });
}

export async function runTravelImageLiveSmokeTest(
  options: SmokeTestOptions = {},
): Promise<TravelImageLiveSmokeResult> {
  const environment = options.environment ?? process.env;
  if (environment.VERCEL_ENV === "production") {
    return result({
      smokeTestMode: "disabled",
      providerCallAttempted: false,
      providerCallSucceeded: false,
      normalizedAssetCount: 0,
      attributionPresent: false,
      fallbackActive: true,
      imageUrlHostOnly: null,
      width: null,
      height: null,
      safeReasonCode: "productionForbidden",
    });
  }
  if (environment[TRAVEL_IMAGE_LIVE_SMOKE_TEST_ENV_NAME] !== "true") {
    return result({
      smokeTestMode: "disabled",
      providerCallAttempted: false,
      providerCallSucceeded: false,
      normalizedAssetCount: 0,
      attributionPresent: false,
      fallbackActive: true,
      imageUrlHostOnly: null,
      width: null,
      height: null,
      safeReasonCode: "smokeTestDisabled",
    });
  }

  const imageEnvironment = resolveTravelImageEnvironment(environment);
  const providers =
    options.providers ?? createTravelImageProviders(imageEnvironment);
  const smokeTestMode = environment.VERCEL_ENV === "preview" ? "preview" : "local";
  if (providers.length === 0 && options.resolveAsset === undefined) {
    return result({
      smokeTestMode,
      providerCallAttempted: false,
      providerCallSucceeded: false,
      normalizedAssetCount: 0,
      attributionPresent: false,
      fallbackActive: true,
      imageUrlHostOnly: null,
      width: null,
      height: null,
      safeReasonCode: "providerNotConfigured",
    });
  }

  try {
    const asset = await (
      options.resolveAsset ??
      (() =>
        new TravelImageEngine({
          enabled: true,
          providers,
          cache: new MemoryTravelImageMetadataCache(),
        }).resolve(
          { category: "destination", destination: "Paris", country: "France" },
          { forceRefresh: true },
        ))
    )();
    const host = asset.isFallback ? null : imageHostOnly(asset.src);
    const attributionPresent =
      !asset.isFallback &&
      asset.attribution.creatorName.trim().length > 0 &&
      asset.attribution.providerName.trim().length > 0;
    const verified = !asset.isFallback && attributionPresent && host !== null;
    return result({
      smokeTestMode,
      providerCallAttempted: true,
      providerCallSucceeded: verified,
      normalizedAssetCount: verified ? 1 : 0,
      attributionPresent,
      fallbackActive: !verified,
      imageUrlHostOnly: host,
      width: verified ? asset.width : null,
      height: verified ? asset.height : null,
      safeReasonCode: verified ? "liveAssetVerified" : "normalizedAssetUnavailable",
    });
  } catch {
    return result({
      smokeTestMode,
      providerCallAttempted: true,
      providerCallSucceeded: false,
      normalizedAssetCount: 0,
      attributionPresent: false,
      fallbackActive: true,
      imageUrlHostOnly: null,
      width: null,
      height: null,
      safeReasonCode: "providerUnavailable",
    });
  }
}
