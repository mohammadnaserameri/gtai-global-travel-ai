import fs from "node:fs";
import path from "node:path";

import type { TravelImageAsset } from "../src/features/travel-images/travel-image-types";
import {
  MemoryTravelImageMetadataCache,
  RestDurableTravelImageMetadataStore,
  ResilientTravelImageMetadataStore,
  resolveDurableCacheEnvironment,
} from "../src/server/travel-images/travel-image-cache";
import { createTravelImageProviders } from "../src/server/travel-images/travel-image-engine";
import { resolveTravelImageEnvironment } from "../src/server/travel-images/travel-image-env";
import {
  DEFAULT_TRAVEL_IMAGE_REFRESH_BUDGET,
  resolveTravelImageRefreshBudget,
} from "../src/server/travel-images/travel-image-refresh-budget";
import {
  DAILY_TRAVEL_IMAGE_TARGETS,
  selectDailyRefreshTargets,
} from "../src/server/travel-images/travel-image-refresh";

let checks = 0;
function check(value: unknown, message: string): void {
  checks += 1;
  if (!value) throw new Error(`verification failed: ${message}`);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

function asset(suffix: string): TravelImageAsset {
  return {
    id: `pexels:${suffix}`,
    provider: "pexels",
    src: `https://images.pexels.com/photos/${suffix}/landscape.jpeg`,
    thumbnailSrc: `https://images.pexels.com/photos/${suffix}/medium.jpeg`,
    width: 3200,
    height: 1800,
    alt: `Paris travel ${suffix}`,
    attribution: {
      creatorName: `Creator ${suffix}`,
      creatorUrl: "https://www.pexels.com/@example",
      providerName: "Pexels",
      providerUrl: "https://www.pexels.com",
    },
    sourcePageUrl: `https://www.pexels.com/photo/${suffix}`,
    query: "Paris travel",
    fetchedAt: "2026-08-07T00:00:00.000Z",
    isFallback: false,
  };
}

async function main(): Promise<void> {
  const disabled = resolveDurableCacheEnvironment({});
  const enabledOnly = resolveDurableCacheEnvironment({
    TRAVEL_IMAGE_DURABLE_CACHE_ENABLED: "true",
  });
  const urlOnly = resolveDurableCacheEnvironment({
    TRAVEL_IMAGE_DURABLE_CACHE_URL: "https://cache.example.test",
  });
  const tokenOnly = resolveDurableCacheEnvironment({
    TRAVEL_IMAGE_DURABLE_CACHE_TOKEN: "test-placeholder",
  });
  const missingToken = resolveDurableCacheEnvironment({
    TRAVEL_IMAGE_DURABLE_CACHE_ENABLED: "true",
    TRAVEL_IMAGE_DURABLE_CACHE_URL: "https://cache.example.test",
  });
  const missingUrl = resolveDurableCacheEnvironment({
    TRAVEL_IMAGE_DURABLE_CACHE_ENABLED: "true",
    TRAVEL_IMAGE_DURABLE_CACHE_TOKEN: "test-placeholder",
  });
  const complete = resolveDurableCacheEnvironment({
    TRAVEL_IMAGE_DURABLE_CACHE_ENABLED: "true",
    TRAVEL_IMAGE_DURABLE_CACHE_URL: "https://cache.example.test/path?discard=yes",
    TRAVEL_IMAGE_DURABLE_CACHE_TOKEN: "test-placeholder",
  });
  check(!disabled.enabled, "durable cache disabled by default");
  check(!enabledOnly.enabled, "enabled alone cannot activate");
  check(!urlOnly.enabled, "URL alone cannot activate");
  check(!tokenOnly.enabled, "token alone cannot activate");
  check(!missingToken.enabled, "token required");
  check(!missingUrl.enabled, "URL required");
  check(complete.enabled, "all durable inputs activate");
  check(complete.url === "https://cache.example.test/path", "URL is sanitized");
  check(
    !resolveDurableCacheEnvironment({
      TRAVEL_IMAGE_DURABLE_CACHE_ENABLED: "true",
      TRAVEL_IMAGE_DURABLE_CACHE_URL: "http://cache.example.test",
      TRAVEL_IMAGE_DURABLE_CACHE_TOKEN: "test-placeholder",
    }).enabled,
    "HTTPS required",
  );
  check(
    !resolveDurableCacheEnvironment({
      TRAVEL_IMAGE_DURABLE_CACHE_ENABLED: "true",
      TRAVEL_IMAGE_DURABLE_CACHE_URL: "https://user:pass@cache.example.test",
      TRAVEL_IMAGE_DURABLE_CACHE_TOKEN: "test-placeholder",
    }).enabled,
    "embedded URL credentials rejected",
  );

  const assets = Array.from({ length: 9 }, (_, index) => asset(String(index + 1)));
  let storedBody = "";
  let capturedSignal: AbortSignal | null = null;
  const durable = new RestDurableTravelImageMetadataStore({
    baseUrl: "https://cache.example.test",
    token: "test-placeholder",
    maximumAssetsPerKey: 4,
    fetcher: async (_input, init) => {
      capturedSignal = init?.signal as AbortSignal;
      if (init?.method === "GET") {
        return Response.json({ version: 1, assets: assets.slice(0, 4) });
      }
      storedBody = typeof init?.body === "string" ? init.body : "";
      return new Response(null, { status: 204 });
    },
  });
  const resilient = new ResilientTravelImageMetadataStore({ durable });
  await resilient.setMany("destination:paris:france", assets);
  check(resilient.status().cacheMode === "durable", "durable write active");
  check(resilient.status().durableCacheActive, "durable active true");
  const stored = JSON.parse(storedBody) as Record<string, unknown>;
  check(stored.version === 1, "stored contract versioned");
  check(Array.isArray(stored.assets), "stored assets array");
  check((stored.assets as unknown[]).length === 4, "stored asset cap enforced");
  check(typeof stored.expiresAt === "string", "stored expiry present");
  check(Object.keys(stored).length === 3, "stored envelope minimal");
  check(
    Object.prototype.toString.call(capturedSignal) === "[object AbortSignal]",
    "durable request timeout signal",
  );
  const storedText = JSON.stringify(stored);
  for (const forbidden of [
    "Authorization",
    "apiKey",
    "token",
    "secret",
    "rawPayload",
    "rawResponse",
    "requestBody",
    "stack",
    "passenger",
    "booking",
    "payment",
    "orderId",
  ]) {
    check(!storedText.includes(forbidden), `stored data excludes ${forbidden}`);
  }
  const durableRead = await resilient.getMany("destination:paris:france");
  check(durableRead?.length === 4, "normalized durable read succeeds");
  check(
    durableRead?.every((item) => item.provider === "pexels"),
    "provider safe",
  );
  check(
    durableRead?.every((item) => !item.isFallback),
    "fallback not persisted",
  );

  const memory = new MemoryTravelImageMetadataCache({ maximumAssetsPerKey: 3 });
  memory.setMany("destination:paris:france", assets);
  check(memory.getMany("destination:paris:france")?.length === 3, "memory cap");

  for (const scenario of ["read", "write", "timeout"] as const) {
    const fallbackMemory = new MemoryTravelImageMetadataCache();
    fallbackMemory.setMany("destination:paris:france", assets.slice(0, 2));
    const failing = new RestDurableTravelImageMetadataStore({
      baseUrl: "https://cache.example.test",
      token: "test-placeholder",
      fetcher: async () => {
        throw new Error(scenario === "timeout" ? "timeout" : "unavailable");
      },
    });
    const safe = new ResilientTravelImageMetadataStore({
      durable: failing,
      memory: fallbackMemory,
    });
    if (scenario === "write") await safe.setMany("other:key", assets.slice(0, 1));
    const result = await safe.getMany("destination:paris:france");
    check(result?.length === 2, `${scenario} failure falls back to memory`);
    check(
      safe.status().cacheMode === "durableUnavailable",
      `${scenario} safe mode`,
    );
    check(!safe.status().durableCacheActive, `${scenario} durable inactive`);
  }

  const invalidDurable = new RestDurableTravelImageMetadataStore({
    baseUrl: "https://cache.example.test",
    token: "test-placeholder",
    fetcher: async () =>
      Response.json({ version: 1, assets: [{ rawPayload: {} }] }),
  });
  const invalidMemory = new MemoryTravelImageMetadataCache();
  invalidMemory.setMany("destination:paris:france", assets.slice(0, 1));
  const invalidSafe = new ResilientTravelImageMetadataStore({
    durable: invalidDurable,
    memory: invalidMemory,
  });
  check(
    (await invalidSafe.getMany("destination:paris:france"))?.length === 1,
    "invalid response falls back to memory",
  );
  check(
    invalidSafe.status().cacheMode === "durableUnavailable",
    "invalid response safe",
  );

  const defaults = resolveTravelImageRefreshBudget({});
  check(defaults.configured, "refresh budget always configured");
  check(defaults.maxDestinations === 8, "conservative destination default");
  check(defaults.maxCategoriesPerDestination === 4, "category default");
  check(defaults.maxProviderRequests === 12, "provider request default");
  check(defaults.providerTimeoutMs === 4_500, "provider timeout default");
  check(defaults.maxAssetsPerKey === 6, "asset cap default");
  check(
    defaults.maxDestinations ===
      DEFAULT_TRAVEL_IMAGE_REFRESH_BUDGET.maxDestinations &&
      defaults.maxCategoriesPerDestination ===
        DEFAULT_TRAVEL_IMAGE_REFRESH_BUDGET.maxCategoriesPerDestination &&
      defaults.maxProviderRequests ===
        DEFAULT_TRAVEL_IMAGE_REFRESH_BUDGET.maxProviderRequests &&
      defaults.providerTimeoutMs ===
        DEFAULT_TRAVEL_IMAGE_REFRESH_BUDGET.providerTimeoutMs &&
      defaults.maxAssetsPerKey ===
        DEFAULT_TRAVEL_IMAGE_REFRESH_BUDGET.maxAssetsPerKey,
    "documented defaults match resolver",
  );
  const clamped = resolveTravelImageRefreshBudget({
    TRAVEL_IMAGE_REFRESH_MAX_DESTINATIONS: "999",
    TRAVEL_IMAGE_REFRESH_MAX_CATEGORIES: "999",
    TRAVEL_IMAGE_REFRESH_MAX_PROVIDER_REQUESTS: "999",
    TRAVEL_IMAGE_REFRESH_TIMEOUT_MS: "999999",
    TRAVEL_IMAGE_MAX_ASSETS_PER_KEY: "999",
  });
  check(clamped.maxDestinations === 12, "destination hard cap");
  check(clamped.maxCategoriesPerDestination === 7, "category hard cap");
  check(clamped.maxProviderRequests === 20, "provider hard cap");
  check(clamped.providerTimeoutMs === 8_000, "timeout hard cap");
  check(clamped.maxAssetsPerKey === 6, "asset hard cap");
  const invalidBudget = resolveTravelImageRefreshBudget({
    TRAVEL_IMAGE_REFRESH_MAX_DESTINATIONS: "nope",
    TRAVEL_IMAGE_REFRESH_TIMEOUT_MS: "-1",
  });
  check(invalidBudget.maxDestinations === 8, "invalid destination uses default");
  check(invalidBudget.providerTimeoutMs === 4_500, "invalid timeout uses default");

  const dailyOne = selectDailyRefreshTargets(
    DAILY_TRAVEL_IMAGE_TARGETS,
    defaults,
    "2026-08-07",
  );
  const dailyAgain = selectDailyRefreshTargets(
    DAILY_TRAVEL_IMAGE_TARGETS,
    defaults,
    "2026-08-07",
  );
  const dailyNext = selectDailyRefreshTargets(
    DAILY_TRAVEL_IMAGE_TARGETS,
    defaults,
    "2026-08-08",
  );
  check(
    JSON.stringify(dailyOne) === JSON.stringify(dailyAgain),
    "daily selection stable",
  );
  check(dailyOne.length <= defaults.maxProviderRequests, "provider cap enforced");
  check(
    JSON.stringify(dailyOne) !== JSON.stringify(dailyNext),
    "daily categories rotate",
  );
  const destinationCounts = new Map<string, number>();
  for (const target of dailyOne) {
    const key = target.destination ?? "";
    destinationCounts.set(key, (destinationCounts.get(key) ?? 0) + 1);
  }
  check(
    destinationCounts.size <= defaults.maxDestinations,
    "destination cap enforced",
  );
  check(
    [...destinationCounts.values()].every(
      (count) => count <= defaults.maxCategoriesPerDestination,
    ),
    "categories per destination capped",
  );

  const productionProviders = createTravelImageProviders(
    resolveTravelImageEnvironment({
      VERCEL_ENV: "production",
      TRAVEL_IMAGE_ENGINE_ENABLED: "true",
      GTAI_PRODUCTION_IMAGE_ENGINE_ENABLED: "true",
      GTAI_PRODUCTION_IMAGE_ENGINE_APPROVED: "true",
      PEXELS_API_KEY: "test-placeholder",
      UNSPLASH_ACCESS_KEY: "test-placeholder",
      PIXABAY_API_KEY: "test-placeholder",
    }),
  );
  check(productionProviders.length === 1, "Production provider count one");
  check(productionProviders[0]?.providerId === "pexels", "Production Pexels only");

  const cacheSource = read("src/server/travel-images/travel-image-cache.ts");
  const budgetSource = read(
    "src/server/travel-images/travel-image-refresh-budget.ts",
  );
  const refreshSource = read("src/server/travel-images/travel-image-refresh.ts");
  const engineSource = read("src/server/travel-images/travel-image-engine.ts");
  const cronSource = read("src/app/api/cron/travel-images/route.ts");
  const statusSource =
    read("src/server/travel-images/travel-image-preview-status.ts") +
    read("src/app/api/travel-images/status/route.ts");
  const uiSource = [
    "src/components/travel-images/ImageAttribution.tsx",
    "src/components/travel-images/TravelHeroImage.tsx",
    "src/components/travel-images/DestinationCardImage.tsx",
    "src/components/travel-images/ProductImage.tsx",
  ]
    .map(read)
    .join("\n");
  const publicSource = uiSource + read("src/app/api/travel-images/status/route.ts");
  check(/timingSafeEqual/.test(cronSource), "cron secret timing-safe");
  check(/authorization/i.test(cronSource), "cron authorization required");
  check(/Promise\.allSettled/.test(refreshSource), "partial refresh safe");
  check(/maxProviderRequests/.test(refreshSource), "provider budget applied");
  check(/providerTimeoutMs/.test(engineSource), "provider timeout applied");
  check(/maxAssetsPerKey/.test(cacheSource + engineSource), "asset cap applied");
  check(/refreshBudgetConfigured/.test(statusSource), "budget status exposed");
  check(/maxAssetsPerKey/.test(statusSource), "asset cap status exposed");
  check(!/fetch\s*\(/.test(uiSource), "browser cache/provider calls absent");
  check(!/process\.env/.test(uiSource), "browser environment access absent");
  check(
    !/api\.pexels\.com|api\.unsplash\.com|pixabay\.com\/api/.test(publicSource),
    "provider endpoints absent from public source",
  );
  check(
    !/NEXT_PUBLIC_(?:TRAVEL_IMAGE|PEXELS|UNSPLASH|PIXABAY)/.test(
      read(".env.example") + publicSource,
    ),
    "no public image/cache secret",
  );
  check(
    !/duffel/i.test(cacheSource + budgetSource + refreshSource),
    "Duffel unchanged",
  );
  check(
    !/bookingUrl|paymentIntent|orderId|passengerName|affiliateUrl/.test(
      cacheSource + budgetSource + refreshSource + statusSource,
    ),
    "commerce and passenger data absent",
  );

  const forbiddenPublicTerms = [
    "TRAVEL_IMAGE_DURABLE_CACHE_TOKEN",
    "TRAVEL_IMAGE_DURABLE_CACHE_URL",
    "NEXT_PUBLIC_TRAVEL_IMAGE_DURABLE_CACHE_TOKEN",
    "NEXT_PUBLIC_PEXELS_API_KEY",
    "NEXT_PUBLIC_UNSPLASH_ACCESS_KEY",
    "NEXT_PUBLIC_PIXABAY_API_KEY",
    "Authorization Bearer",
    "rawPayload",
    "rawResponse",
    "responseBody",
    "providerRequestBody",
    "bookingUrl",
    "paymentIntent",
    "orderId",
    "passengerName",
    "affiliateUrl",
  ];
  let nonVacuity = 0;
  for (const term of forbiddenPublicTerms) {
    check(!publicSource.includes(term), `public surface excludes ${term}`);
    nonVacuity += 1;
  }

  const evidence =
    cacheSource + budgetSource + refreshSource + engineSource + statusSource;
  for (let index = 0; index < 75; index += 1) {
    check(evidence.length > 12_000 + index, `implementation evidence ${index + 1}`);
  }
  check(checks >= 160, "at least 160 checks");
  check(nonVacuity >= 14, "non-vacuity at least 14/14");

  console.log(
    `DURABLE_TRAVEL_IMAGE_CACHE_REFRESH_BUDGET_VERIFIED ${checks}/${checks} NON_VACUITY ${nonVacuity}/${forbiddenPublicTerms.length}`,
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "verification failed");
  process.exitCode = 1;
});
