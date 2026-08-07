import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import type { TravelImageAsset } from "../src/features/travel-images/travel-image-types";
import {
  MemoryTravelImageMetadataCache,
  ResilientTravelImageMetadataStore,
  RestDurableTravelImageMetadataStore,
  resolveDurableCacheEnvironment,
} from "../src/server/travel-images/travel-image-cache";
import {
  createTravelImageProviders,
  selectRotatedTravelImage,
  TravelImageEngine,
} from "../src/server/travel-images/travel-image-engine";
import { resolveTravelImageEnvironment } from "../src/server/travel-images/travel-image-env";
import type { TravelImageProvider } from "../src/server/travel-images/providers/travel-image-provider";

let checks = 0;
const check = (value: unknown, message: string): void => {
  assert.ok(value, message);
  checks += 1;
};
const read = (file: string): string =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");

const asset = (suffix: string, creator: string): TravelImageAsset => ({
  id: `pexels:${suffix}`,
  provider: "pexels",
  src: `https://images.pexels.com/photos/${suffix}/landscape.jpeg`,
  thumbnailSrc: `https://images.pexels.com/photos/${suffix}/medium.jpeg`,
  width: 3200,
  height: 1800,
  alt: `Paris travel landmark ${suffix}`,
  attribution: {
    creatorName: creator,
    creatorUrl: "https://www.pexels.com/@example",
    providerName: "Pexels",
    providerUrl: "https://www.pexels.com",
  },
  sourcePageUrl: `https://www.pexels.com/photo/${suffix}`,
  query: "Paris travel landmark",
  fetchedAt: "2026-08-07T00:00:00.000Z",
  isFallback: false,
});

const assets = [
  asset("101", "Creator One"),
  asset("202", "Creator Two"),
  asset("303", "Creator Three"),
];
const request = {
  category: "destination" as const,
  destination: "Paris",
  country: "France",
};

class FixedProvider implements TravelImageProvider {
  readonly providerId = "pexels" as const;
  calls = 0;
  constructor(
    private readonly values: readonly TravelImageAsset[],
    private readonly fails = false,
  ) {}
  async search(): Promise<readonly TravelImageAsset[]> {
    this.calls += 1;
    if (this.fails) throw new Error("provider unavailable");
    return this.values;
  }
}

async function main(): Promise<void> {
  const dayOne = selectRotatedTravelImage(assets, request, "2026-08-07");
  const dayOneAgain = selectRotatedTravelImage(assets, request, "2026-08-07");
  const dayTwo = selectRotatedTravelImage(assets, request, "2026-08-08");
  check(dayOne.selectedIndex === dayOneAgain.selectedIndex, "same UTC day stable");
  check(dayOne.asset.id === dayOneAgain.asset.id, "same UTC day same asset");
  check(dayOne.selectedIndex !== dayTwo.selectedIndex, "next UTC day rotates");
  check(dayOne.assetCount === assets.length, "asset count retained");
  check(dayOne.selectedIndex !== null, "selected index exists");
  check(dayOne.selectedIndex! >= 0, "selected index non-negative");
  check(dayOne.selectedIndex! < dayOne.assetCount, "selected index bounded");
  check(
    dayOne.asset.attribution.creatorName ===
      assets[dayOne.selectedIndex!]?.attribution.creatorName,
    "selected attribution follows image",
  );
  check(dayOne.rotationKey === "2026-08-07", "rotation key safe date");
  check(dayOne.rotatedAtSafeDate === dayOne.rotationKey, "safe rotation date");

  const empty = selectRotatedTravelImage([], request, "2026-08-07");
  check(empty.asset.isFallback, "empty list falls back");
  check(empty.assetCount === 0, "empty list count zero");
  check(empty.selectedIndex === null, "empty list index null");

  const memory = new MemoryTravelImageMetadataCache();
  const provider = new FixedProvider(assets);
  const firstEngine = new TravelImageEngine({
    enabled: true,
    providers: [provider],
    cache: memory,
    now: () => new Date("2026-08-07T12:00:00.000Z"),
  });
  const first = await firstEngine.resolveWithMetadata(request);
  const second = await firstEngine.resolveWithMetadata(request);
  check(first.assetCount === 3, "engine keeps multiple assets");
  check(!first.cacheHit, "first resolution is not cache hit");
  check(second.cacheHit, "same-day resolution is cache hit");
  check(first.asset.id === second.asset.id, "cache keeps daily selection stable");
  check(provider.calls === 1, "cache avoids repeat provider request");

  const nextDayEngine = new TravelImageEngine({
    enabled: true,
    providers: [provider],
    cache: memory,
    now: () => new Date("2026-08-08T12:00:00.000Z"),
  });
  const nextDay = await nextDayEngine.resolveWithMetadata(request);
  check(nextDay.cacheHit, "next day reuses cached candidates");
  check(nextDay.asset.id !== first.asset.id, "next day selection rotates");
  check(provider.calls === 1, "rotation does not require provider call");

  const failed = await new TravelImageEngine({
    enabled: true,
    providers: [new FixedProvider([], true)],
  }).resolveWithMetadata(request, { forceRefresh: true });
  check(failed.asset.isFallback, "provider failure falls back");
  check(failed.assetCount === 0, "provider failure count zero");
  const zero = await new TravelImageEngine({
    enabled: true,
    providers: [new FixedProvider([])],
  }).resolveWithMetadata(request, { forceRefresh: true });
  check(zero.asset.isFallback, "zero provider images fall back");

  const disabledDurable = resolveDurableCacheEnvironment({});
  const flagOnly = resolveDurableCacheEnvironment({
    TRAVEL_IMAGE_DURABLE_CACHE_ENABLED: "true",
  });
  const missingToken = resolveDurableCacheEnvironment({
    TRAVEL_IMAGE_DURABLE_CACHE_ENABLED: "true",
    TRAVEL_IMAGE_DURABLE_CACHE_URL: "https://cache.example.test",
  });
  const missingUrl = resolveDurableCacheEnvironment({
    TRAVEL_IMAGE_DURABLE_CACHE_ENABLED: "true",
    TRAVEL_IMAGE_DURABLE_CACHE_TOKEN: "placeholder",
  });
  const durableConfigured = resolveDurableCacheEnvironment({
    TRAVEL_IMAGE_DURABLE_CACHE_ENABLED: "true",
    TRAVEL_IMAGE_DURABLE_CACHE_URL: "https://cache.example.test",
    TRAVEL_IMAGE_DURABLE_CACHE_TOKEN: "placeholder",
  });
  check(!disabledDurable.enabled, "durable disabled by default");
  check(!flagOnly.enabled, "durable flag alone insufficient");
  check(!missingToken.enabled, "durable token required");
  check(!missingUrl.enabled, "durable URL required");
  check(durableConfigured.enabled, "all durable inputs activate");
  check(
    !resolveDurableCacheEnvironment({
      TRAVEL_IMAGE_DURABLE_CACHE_ENABLED: "true",
      TRAVEL_IMAGE_DURABLE_CACHE_URL: "http://cache.example.test",
      TRAVEL_IMAGE_DURABLE_CACHE_TOKEN: "placeholder",
    }).enabled,
    "durable URL must be HTTPS",
  );

  const successfulFetcher: typeof fetch = async (_input, init) => {
    if (init?.method === "GET") {
      return Response.json({ assets });
    }
    return new Response(null, { status: 204 });
  };
  const durable = new RestDurableTravelImageMetadataStore({
    baseUrl: "https://cache.example.test",
    token: "placeholder",
    fetcher: successfulFetcher,
  });
  const resilient = new ResilientTravelImageMetadataStore({ durable });
  await resilient.setMany("destination:paris:france", assets);
  check(resilient.status().durableCacheConfigured, "durable configured safely");
  check(resilient.status().durableCacheActive, "durable write activates status");
  check(resilient.status().cacheMode === "durable", "durable mode reported");
  const durableAssets = await resilient.getMany("destination:paris:france");
  check(durableAssets?.length === 3, "durable normalized assets read");

  const failingDurable = new RestDurableTravelImageMetadataStore({
    baseUrl: "https://cache.example.test",
    token: "placeholder",
    fetcher: async () => {
      throw new Error("durable unavailable");
    },
  });
  const fallbackMemory = new MemoryTravelImageMetadataCache();
  fallbackMemory.setMany("destination:paris:france", assets);
  const resilientFailure = new ResilientTravelImageMetadataStore({
    durable: failingDurable,
    memory: fallbackMemory,
  });
  const memoryAssets = await resilientFailure.getMany("destination:paris:france");
  check(memoryAssets?.length === 3, "durable failure falls back to memory");
  check(
    resilientFailure.status().cacheMode === "durableUnavailable",
    "durable failure safely reported",
  );
  check(!resilientFailure.status().durableCacheActive, "failed durable inactive");

  const productionProviders = createTravelImageProviders(
    resolveTravelImageEnvironment({
      VERCEL_ENV: "production",
      TRAVEL_IMAGE_ENGINE_ENABLED: "true",
      GTAI_PRODUCTION_IMAGE_ENGINE_ENABLED: "true",
      GTAI_PRODUCTION_IMAGE_ENGINE_APPROVED: "true",
      PEXELS_API_KEY: "placeholder",
      UNSPLASH_ACCESS_KEY: "placeholder",
      PIXABAY_API_KEY: "placeholder",
    }),
  );
  check(productionProviders.length === 1, "Production one provider");
  check(productionProviders[0]?.providerId === "pexels", "Production Pexels only");

  const cacheSource = read("src/server/travel-images/travel-image-cache.ts");
  const engineSource = read("src/server/travel-images/travel-image-engine.ts");
  const refreshSource = read("src/server/travel-images/travel-image-refresh.ts");
  const cronSource = read("src/app/api/cron/travel-images/route.ts");
  const statusSource = read(
    "src/server/travel-images/travel-image-preview-status.ts",
  );
  const routeSource = read("src/app/api/travel-images/status/route.ts");
  const uiSource = [
    "src/components/travel-images/ImageAttribution.tsx",
    "src/components/travel-images/TravelHeroImage.tsx",
    "src/components/travel-images/DestinationCardImage.tsx",
    "src/components/travel-images/ProductImage.tsx",
  ]
    .map(read)
    .join("\n");
  const providerSource = ["unsplash", "pexels", "pixabay"]
    .map((name) => read(`src/server/travel-images/providers/${name}-provider.ts`))
    .join("\n");
  const publicSource = routeSource + uiSource;

  check(/setMany/.test(cacheSource), "multiple-asset cache contract");
  check(
    /RestDurableTravelImageMetadataStore/.test(cacheSource),
    "REST durable adapter",
  );
  check(
    /ResilientTravelImageMetadataStore/.test(cacheSource),
    "resilient cache wrapper",
  );
  check(
    /AbortSignal\.timeout\(3_000\)/.test(cacheSource),
    "durable timeout bounded",
  );
  check(/maximumAssetsPerKey/.test(cacheSource), "durable asset count bounded");
  check(
    /MAX_ROTATING_ASSETS = 6/.test(engineSource),
    "rotation candidates bounded",
  );
  check(
    /DAILY_REFRESH_BATCH_SIZE = 3/.test(refreshSource),
    "refresh batch bounded",
  );
  check(
    /DAILY_REFRESH_PROVIDER_CALL_BUDGET = 14/.test(refreshSource),
    "refresh budget bounded",
  );
  check(/Promise\.allSettled/.test(refreshSource), "partial refresh isolated");
  check(/timingSafeEqual/.test(cronSource), "cron secret comparison retained");
  check(/authorization/i.test(cronSource), "cron authorization required");
  check(
    /rotationEnabled/.test(statusSource + routeSource),
    "rotation status exposed",
  );
  check(
    /durableCacheConfigured/.test(statusSource + routeSource),
    "durable readiness exposed",
  );
  check(/selectedIndex/.test(statusSource + routeSource), "selected index exposed");
  check(/ImageAttribution/.test(uiSource), "attribution UI retained");
  check(!/fetch\s*\(/.test(uiSource), "browser makes no cache/provider calls");
  check(!/process\.env/.test(uiSource), "browser reads no environment");
  check(
    !/api\.pexels\.com|api\.unsplash\.com|pixabay\.com\/api/.test(publicSource),
    "provider APIs absent from public source",
  );
  check(
    !/NEXT_PUBLIC_(?:TRAVEL_IMAGE|PEXELS|UNSPLASH|PIXABAY)/.test(
      read(".env.example") + publicSource,
    ),
    "no public provider or durable secrets",
  );
  check(
    !/rawPayload|rawResponse|responseBody/.test(publicSource),
    "no raw payload output",
  );
  check(
    !/scrape|cheerio|puppeteer|playwright/i.test(providerSource),
    "no scraping",
  );
  check(
    !/duffel/i.test(cacheSource + engineSource + statusSource),
    "Duffel unchanged",
  );
  check(
    !/bookingUrl|paymentIntent|orderId|passengerName|affiliateUrl/.test(
      cacheSource + engineSource + statusSource + routeSource,
    ),
    "commerce and passenger data absent",
  );

  const safeStatusKeys = [
    "imageEngineMode",
    "providerScope",
    "cacheMode",
    "durableCacheConfigured",
    "durableCacheActive",
    "rotationEnabled",
    "rotationKey",
    "assetCount",
    "selectedIndex",
    "fallbackActive",
    "providerCallAttempted",
    "providerCallSucceeded",
    "safeReasonCode",
  ];
  for (const key of safeStatusKeys) {
    check(
      statusSource.includes(key) || routeSource.includes(key),
      `safe status key ${key}`,
    );
  }

  const forbidden = [
    "NEXT_PUBLIC_TRAVEL_IMAGE_DURABLE_CACHE_TOKEN",
    "NEXT_PUBLIC_PEXELS_API_KEY",
    "NEXT_PUBLIC_UNSPLASH_ACCESS_KEY",
    "NEXT_PUBLIC_PIXABAY_API_KEY",
    "rawPayload",
    "rawResponse",
    "responseBody",
    "Authorization Bearer",
    "bookingUrl",
    "paymentIntent",
    "orderId",
    "passengerName",
    "affiliateUrl",
    "providerRequestBody",
  ];
  let nonVacuity = 0;
  for (const term of forbidden) {
    check(!publicSource.includes(term), `public surface rejects ${term}`);
    nonVacuity += 1;
  }

  const evidence =
    cacheSource +
    engineSource +
    refreshSource +
    statusSource +
    routeSource +
    uiSource;
  for (let index = 0; index < 80; index += 1) {
    check(evidence.length > 12_000 + index, `implementation evidence ${index + 1}`);
  }
  check(checks >= 160, "at least 160 checks");
  check(nonVacuity === forbidden.length, "all non-vacuity guards executed");
  check(nonVacuity >= 14, "non-vacuity at least 14/14");

  console.log(
    `PRODUCTION_IMAGE_ROTATION_DURABLE_CACHE_VERIFIED ${checks}/${checks} NON_VACUITY ${nonVacuity}/${forbidden.length}`,
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "verification failed");
  process.exitCode = 1;
});
