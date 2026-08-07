import "../server-only";

import type { TravelImageRequest } from "../../features/travel-images/travel-image-types";
import { getTravelImageCacheRuntimeStatus } from "./travel-image-cache";
import { getTravelImageEngine } from "./travel-image-engine";
import {
  resolveTravelImageRefreshBudget,
  type TravelImageRefreshBudget,
} from "./travel-image-refresh-budget";

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
  readonly refreshBudgetConfigured: true;
  readonly maxAssetsPerKey: number;
  readonly cacheMode:
    "memory" | "durable" | "durableUnavailable" | "nextFetchCache";
}

function utcDayNumber(dayKey: string): number {
  const parsed = Date.parse(`${dayKey}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 86_400_000) : 0;
}

/** Selects a stable, bounded daily subset before any provider is called. */
export function selectDailyRefreshTargets(
  targets: readonly TravelImageRequest[],
  budget: TravelImageRefreshBudget,
  dayKey = new Date().toISOString().slice(0, 10),
): readonly TravelImageRequest[] {
  const grouped = new Map<string, TravelImageRequest[]>();
  for (const target of targets) {
    const destination = target.destination?.normalize("NFKC").toLowerCase() ?? "";
    const group = grouped.get(destination) ?? [];
    group.push(target);
    grouped.set(destination, group);
  }

  const day = utcDayNumber(dayKey);
  const selected: TravelImageRequest[] = [];
  for (const group of [...grouped.values()].slice(0, budget.maxDestinations)) {
    const count = Math.min(group.length, budget.maxCategoriesPerDestination);
    const start = group.length > 0 ? day % group.length : 0;
    for (let offset = 0; offset < count; offset += 1) {
      const target = group[(start + offset) % group.length];
      if (target) selected.push(target);
    }
  }
  return Object.freeze(selected.slice(0, budget.maxProviderRequests));
}

export async function refreshDailyTravelImages(): Promise<TravelImageRefreshResult> {
  const budget = resolveTravelImageRefreshBudget();
  const engine = getTravelImageEngine();
  let liveAssetCount = 0;
  let fallbackAssetCount = 0;
  let partialFailureCount = 0;
  const targets = selectDailyRefreshTargets(DAILY_TRAVEL_IMAGE_TARGETS, budget);

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
    providerCallBudget: budget.maxProviderRequests,
    refreshBudgetConfigured: true,
    maxAssetsPerKey: budget.maxAssetsPerKey,
    cacheMode: getTravelImageCacheRuntimeStatus().cacheMode,
  };
}
