import "../server-only";

type Environment = Readonly<Record<string, string | undefined>>;

export const DEFAULT_TRAVEL_IMAGE_REFRESH_BUDGET = Object.freeze({
  maxDestinations: 8,
  maxCategoriesPerDestination: 4,
  maxProviderRequests: 12,
  providerTimeoutMs: 4_500,
  maxAssetsPerKey: 6,
});

export interface TravelImageRefreshBudget {
  readonly configured: true;
  readonly maxDestinations: number;
  readonly maxCategoriesPerDestination: number;
  readonly maxProviderRequests: number;
  readonly providerTimeoutMs: number;
  readonly maxAssetsPerKey: number;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!value || !/^\d+$/.test(value.trim())) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

/**
 * Resolves server-only refresh limits without returning any source env value.
 * Every value is clamped to a hard ceiling so configuration can reduce or
 * moderately tune a run, but can never make one unbounded.
 */
export function resolveTravelImageRefreshBudget(
  environment: Environment = process.env,
): TravelImageRefreshBudget {
  return Object.freeze({
    configured: true,
    maxDestinations: boundedInteger(
      environment.TRAVEL_IMAGE_REFRESH_MAX_DESTINATIONS,
      DEFAULT_TRAVEL_IMAGE_REFRESH_BUDGET.maxDestinations,
      1,
      12,
    ),
    maxCategoriesPerDestination: boundedInteger(
      environment.TRAVEL_IMAGE_REFRESH_MAX_CATEGORIES,
      DEFAULT_TRAVEL_IMAGE_REFRESH_BUDGET.maxCategoriesPerDestination,
      1,
      7,
    ),
    maxProviderRequests: boundedInteger(
      environment.TRAVEL_IMAGE_REFRESH_MAX_PROVIDER_REQUESTS,
      DEFAULT_TRAVEL_IMAGE_REFRESH_BUDGET.maxProviderRequests,
      1,
      20,
    ),
    providerTimeoutMs: boundedInteger(
      environment.TRAVEL_IMAGE_REFRESH_TIMEOUT_MS,
      DEFAULT_TRAVEL_IMAGE_REFRESH_BUDGET.providerTimeoutMs,
      1_000,
      8_000,
    ),
    maxAssetsPerKey: boundedInteger(
      environment.TRAVEL_IMAGE_MAX_ASSETS_PER_KEY,
      DEFAULT_TRAVEL_IMAGE_REFRESH_BUDGET.maxAssetsPerKey,
      1,
      6,
    ),
  });
}
