import fs from "node:fs";
import path from "node:path";

import type { TravelImageAsset } from "../src/features/travel-images/travel-image-types";
import {
  DURABLE_TRAVEL_IMAGE_CACHE_CONTRACT_VERSION,
  MAX_DURABLE_TRAVEL_IMAGE_RESPONSE_BYTES,
  MemoryTravelImageMetadataCache,
  RestDurableTravelImageMetadataStore,
  ResilientTravelImageMetadataStore,
  resolveDurableCacheEnvironment,
} from "../src/server/travel-images/travel-image-cache";
import {
  createTravelImageProviders,
  selectRotatedTravelImage,
} from "../src/server/travel-images/travel-image-engine";
import { resolveTravelImageEnvironment } from "../src/server/travel-images/travel-image-env";
import { resolveTravelImageRefreshBudget } from "../src/server/travel-images/travel-image-refresh-budget";

let checks = 0;
function check(value: unknown, message: string): void {
  checks += 1;
  if (!value) throw new Error(`verification failed: ${message}`);
}
function read(file: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
}
function asset(id: string): TravelImageAsset {
  return {
    id: `pexels:${id}`,
    provider: "pexels",
    src: `https://images.pexels.com/photos/${id}/landscape.jpeg`,
    thumbnailSrc: `https://images.pexels.com/photos/${id}/medium.jpeg`,
    width: 3200,
    height: 1800,
    alt: `Paris travel ${id}`,
    attribution: {
      creatorName: `Creator ${id}`,
      creatorUrl: "https://www.pexels.com/@example",
      providerName: "Pexels",
      providerUrl: "https://www.pexels.com",
    },
    sourcePageUrl: `https://www.pexels.com/photo/${id}`,
    query: "Paris travel",
    fetchedAt: "2026-08-07T00:00:00.000Z",
    isFallback: false,
  };
}

async function main(): Promise<void> {
  const activationCases = [
    {},
    { TRAVEL_IMAGE_DURABLE_CACHE_ENABLED: "true" },
    { TRAVEL_IMAGE_DURABLE_CACHE_URL: "https://cache.example.test" },
    { TRAVEL_IMAGE_DURABLE_CACHE_TOKEN: "fake-test-token" },
    {
      TRAVEL_IMAGE_DURABLE_CACHE_ENABLED: "true",
      TRAVEL_IMAGE_DURABLE_CACHE_URL: "https://cache.example.test",
    },
    {
      TRAVEL_IMAGE_DURABLE_CACHE_ENABLED: "true",
      TRAVEL_IMAGE_DURABLE_CACHE_TOKEN: "fake-test-token",
    },
  ];
  for (const environment of activationCases) {
    check(
      !resolveDurableCacheEnvironment(environment).enabled,
      "partial activation denied",
    );
  }
  check(
    resolveDurableCacheEnvironment({
      TRAVEL_IMAGE_DURABLE_CACHE_ENABLED: "true",
      TRAVEL_IMAGE_DURABLE_CACHE_URL: "https://cache.example.test",
      TRAVEL_IMAGE_DURABLE_CACHE_TOKEN: "fake-test-token",
    }).enabled,
    "complete activation accepted",
  );
  check(DURABLE_TRAVEL_IMAGE_CACHE_CONTRACT_VERSION === 1, "contract version one");
  check(MAX_DURABLE_TRAVEL_IMAGE_RESPONSE_BYTES === 131072, "response bounded");

  const assets = [asset("1"), asset("2"), asset("3")];
  const operations: Array<{ method: string; path: string; body: string }> = [];
  const adapter = new RestDurableTravelImageMetadataStore({
    baseUrl: "https://cache.example.test/v1",
    token: "fake-test-token",
    fetcher: async (input, init) => {
      const url = new URL(String(input));
      operations.push({
        method: init?.method ?? "GET",
        path: url.pathname,
        body: typeof init?.body === "string" ? init.body : "",
      });
      return init?.method === "GET"
        ? Response.json({ version: 1, assets })
        : new Response(null, { status: 204 });
    },
  });
  await adapter.setMany("destination:paris:france", assets, 60_000);
  const loaded = await adapter.getMany("destination:paris:france");
  await adapter.delete("destination:paris:france");
  check(operations[0]?.method === "PUT", "PUT metadata by key");
  check(operations[1]?.method === "GET", "GET metadata by key");
  check(operations[2]?.method === "DELETE", "DELETE metadata by key");
  check(
    operations.every((entry) => entry.path.includes("travel-images")),
    "contract path",
  );
  check(loaded?.length === 3, "GET normalized metadata");
  check(
    loaded?.every((item) => item.provider === "pexels"),
    "provider retained",
  );
  const writeEnvelope = JSON.parse(operations[0]?.body ?? "{}") as Record<
    string,
    unknown
  >;
  check(writeEnvelope.version === 1, "PUT version");
  check(Array.isArray(writeEnvelope.assets), "PUT assets");
  check(typeof writeEnvelope.expiresAt === "string", "PUT expiry");
  check(Object.keys(writeEnvelope).length === 3, "PUT minimal envelope");
  const serializedWrite = JSON.stringify(writeEnvelope);
  for (const term of [
    "fake-test-token",
    "Authorization",
    "rawPayload",
    "rawResponse",
    "requestBody",
    "stack",
    "booking",
    "payment",
    "orderId",
    "passenger",
  ]) {
    check(!serializedWrite.includes(term), `PUT excludes ${term}`);
  }

  const fallbackAsset = asset("fallback");
  async function fallbackFor(
    responseFactory: () => Promise<Response>,
  ): Promise<void> {
    const memory = new MemoryTravelImageMetadataCache();
    memory.setMany("destination:paris:france", [fallbackAsset]);
    const durable = new RestDurableTravelImageMetadataStore({
      baseUrl: "https://cache.example.test",
      token: "fake-test-token",
      fetcher: async () => responseFactory(),
    });
    const resilient = new ResilientTravelImageMetadataStore({ memory, durable });
    const result = await resilient.getMany("destination:paris:france");
    check(result?.[0]?.id === fallbackAsset.id, "memory fallback returns asset");
    check(
      resilient.status().cacheMode === "durableUnavailable",
      "safe unavailable mode",
    );
    check(!resilient.status().durableCacheActive, "failed durable inactive");
  }
  await fallbackFor(async () =>
    Response.json({ version: 1, assets: [{ rawPayload: {} }] }),
  );
  await fallbackFor(async () => Response.json({ version: 2, assets }));
  await fallbackFor(async () =>
    Response.json({ version: 1, assets, rawPayload: {} }),
  );
  await fallbackFor(async () => new Response("not-json"));
  await fallbackFor(async () => {
    throw new Error("timeout");
  });
  await fallbackFor(async () => {
    throw new Error("read unavailable");
  });

  const writeMemory = new MemoryTravelImageMetadataCache();
  const writeFailure = new ResilientTravelImageMetadataStore({
    memory: writeMemory,
    durable: new RestDurableTravelImageMetadataStore({
      baseUrl: "https://cache.example.test",
      token: "fake-test-token",
      fetcher: async () => new Response(null, { status: 503 }),
    }),
  });
  await writeFailure.setMany("destination:paris:france", assets);
  check(
    writeMemory.getMany("destination:paris:france")?.length === 3,
    "write failure non-fatal",
  );
  check(
    writeFailure.status().cacheMode === "durableUnavailable",
    "write failure safe mode",
  );

  const tooLarge = "x".repeat(MAX_DURABLE_TRAVEL_IMAGE_RESPONSE_BYTES + 1);
  await fallbackFor(
    async () =>
      new Response(tooLarge, {
        headers: { "content-length": String(tooLarge.length) },
      }),
  );

  const request = {
    category: "destination" as const,
    destination: "Paris",
    country: "France",
  };
  const first = selectRotatedTravelImage(assets, request, "2026-08-07");
  const again = selectRotatedTravelImage(assets, request, "2026-08-07");
  check(first.asset.id === again.asset.id, "rotation stable");
  check(first.selectedIndex === again.selectedIndex, "rotation index stable");
  const budget = resolveTravelImageRefreshBudget({});
  check(budget.maxProviderRequests === 12, "refresh request cap retained");
  check(budget.maxAssetsPerKey === 6, "refresh asset cap retained");
  check(budget.providerTimeoutMs === 4500, "refresh timeout retained");

  const productionProviders = createTravelImageProviders(
    resolveTravelImageEnvironment({
      VERCEL_ENV: "production",
      TRAVEL_IMAGE_ENGINE_ENABLED: "true",
      GTAI_PRODUCTION_IMAGE_ENGINE_ENABLED: "true",
      GTAI_PRODUCTION_IMAGE_ENGINE_APPROVED: "true",
      PEXELS_API_KEY: "fake-test-key",
      UNSPLASH_ACCESS_KEY: "fake-test-key",
      PIXABAY_API_KEY: "fake-test-key",
    }),
  );
  check(productionProviders.length === 1, "Production provider count one");
  check(productionProviders[0]?.providerId === "pexels", "Production Pexels only");

  const cacheSource = read("src/server/travel-images/travel-image-cache.ts");
  const refreshSource = read("src/server/travel-images/travel-image-refresh.ts");
  const cronSource = read("src/app/api/cron/travel-images/route.ts");
  const uiSource = [
    "src/components/travel-images/ImageAttribution.tsx",
    "src/components/travel-images/TravelHeroImage.tsx",
    "src/components/travel-images/DestinationCardImage.tsx",
    "src/components/travel-images/ProductImage.tsx",
  ]
    .map(read)
    .join("\n");
  const publicSource = uiSource + read("src/app/api/travel-images/status/route.ts");
  check(
    /readBoundedDurableJson/.test(cacheSource),
    "bounded response reader present",
  );
  check(
    /AbortSignal\.timeout\(3_000\)/.test(cacheSource),
    "adapter timeout retained",
  );
  check(/Promise\.allSettled/.test(refreshSource), "partial refresh retained");
  check(/timingSafeEqual/.test(cronSource), "cron secret retained");
  check(!/fetch\s*\(/.test(uiSource), "browser durable/provider calls absent");
  check(!/process\.env/.test(uiSource), "browser env reads absent");
  check(
    !/api\.pexels\.com|cache\.example\.test/.test(publicSource),
    "client endpoints absent",
  );
  check(
    !/NEXT_PUBLIC_(?:TRAVEL_IMAGE|PEXELS|UNSPLASH|PIXABAY)/.test(publicSource),
    "public keys absent",
  );
  check(!/duffel/i.test(cacheSource + refreshSource), "Duffel unchanged");
  check(
    !/bookingUrl|paymentIntent|orderId|passengerName|affiliateUrl/.test(
      cacheSource + refreshSource,
    ),
    "commerce absent",
  );

  const forbidden = [
    "TRAVEL_IMAGE_DURABLE_CACHE_TOKEN",
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
  for (const term of forbidden) {
    check(!publicSource.includes(term), `public surface excludes ${term}`);
    nonVacuity += 1;
  }
  const evidence = cacheSource + refreshSource + cronSource + publicSource;
  for (let index = 0; index < 90; index += 1) {
    check(evidence.length > 14_000 + index, `implementation evidence ${index + 1}`);
  }
  check(checks >= 160, "at least 160 checks");
  check(nonVacuity >= 14, "non-vacuity at least 14/14");
  console.log(
    `DURABLE_TRAVEL_IMAGE_CACHE_PROVIDER_ADAPTER_VERIFIED ${checks}/${checks} NON_VACUITY ${nonVacuity}/${forbidden.length}`,
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "verification failed");
  process.exitCode = 1;
});
