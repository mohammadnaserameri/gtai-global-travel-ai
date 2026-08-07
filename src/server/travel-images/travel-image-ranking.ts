import "../server-only";

import type {
  TravelImageAsset,
  TravelImageRequest,
} from "../../features/travel-images/travel-image-types";

const TRAVEL_TERMS =
  /\b(travel|city|skyline|landmark|hotel|apartment|airport|airplane|road|car|vacation|holiday|landscape|architecture|scenic)\b/i;
const REJECTED_TERMS =
  /\b(logo|watermark|vector|illustration|clipart|template|mockup|selfie|portrait|food menu|text overlay|isolated)\b/i;

function normalizedText(asset: TravelImageAsset): string {
  return `${asset.alt} ${asset.query}`.normalize("NFKC").toLocaleLowerCase();
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function isAcceptableTravelImage(asset: TravelImageAsset): boolean {
  if (asset.isFallback) return true;
  if (
    asset.width < 1_000 ||
    asset.height < 600 ||
    asset.width / asset.height < 1.2
  ) {
    return false;
  }
  if (
    !asset.src.startsWith("https://") ||
    !asset.thumbnailSrc.startsWith("https://")
  ) {
    return false;
  }
  if (
    !asset.attribution.creatorName.trim() ||
    !asset.attribution.providerName.trim()
  ) {
    return false;
  }
  const text = normalizedText(asset);
  return TRAVEL_TERMS.test(text) && !REJECTED_TERMS.test(text);
}

export function scoreTravelImage(
  asset: TravelImageAsset,
  request: TravelImageRequest,
): number {
  const text = normalizedText(asset);
  const destination = request.destination?.normalize("NFKC").toLocaleLowerCase();
  const country = request.country?.normalize("NFKC").toLocaleLowerCase();
  let score = 0;

  if (destination && text.includes(destination)) score += 80;
  if (country && text.includes(country)) score += 25;
  if (TRAVEL_TERMS.test(text)) score += 25;
  if (asset.width >= 2_000) score += 18;
  if (asset.width >= 3_000) score += 8;
  const ratio = asset.width / asset.height;
  if (ratio >= 1.4 && ratio <= 2.2) score += 22;
  if (asset.attribution.creatorUrl) score += 6;
  if (asset.sourcePageUrl) score += 6;
  if (!REJECTED_TERMS.test(text)) score += 10;

  return score;
}

export function rankTravelImageAssets(
  assets: readonly TravelImageAsset[],
  request: TravelImageRequest,
): readonly TravelImageAsset[] {
  const deduplicated = new Map<string, TravelImageAsset>();
  for (const asset of assets) {
    if (!isAcceptableTravelImage(asset)) continue;
    const canonicalUrl = asset.src.split("?")[0]?.toLocaleLowerCase() ?? asset.src;
    const key = `${asset.provider}:${canonicalUrl}`;
    if (!deduplicated.has(key)) deduplicated.set(key, asset);
  }

  return [...deduplicated.values()].sort((left, right) => {
    const scoreDifference =
      scoreTravelImage(right, request) - scoreTravelImage(left, request);
    if (scoreDifference !== 0) return scoreDifference;
    return stableHash(left.id) - stableHash(right.id);
  });
}
