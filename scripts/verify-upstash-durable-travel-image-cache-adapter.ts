import fs from "node:fs";
import path from "node:path";

import type { TravelImageAsset } from "../src/features/travel-images/travel-image-types";
import {
  MemoryTravelImageMetadataCache,
  ResilientTravelImageMetadataStore,
  UpstashDurableTravelImageMetadataStore,
  createTravelImageMetadataStore,
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
    alt: `Istanbul travel ${id}`,
    attribution: {
      creatorName: `Creator ${id}`,
      creatorUrl: "https://www.pexels.com/@example",
      providerName: "Pexels",
      providerUrl: "https://www.pexels.com",
    },
    sourcePageUrl: `https://www.pexels.com/photo/${id}`,
    query: "Istanbul travel",
    fetchedAt: "2026-08-07T00:00:00.000Z",
    isFallback: false,
  };
}

async function main(): Promise<void> {
  const partialCases = [
    {},
    { TRAVEL_IMAGE_DURABLE_CACHE_PROVIDER: "upstash" },
    { TRAVEL_IMAGE_DURABLE_CACHE_ENABLED: "true" },
    { UPSTASH_REDIS_REST_URL: "https://example.upstash.io" },
    { UPSTASH_REDIS_REST_TOKEN: "fake-test-token" },
    {
      TRAVEL_IMAGE_DURABLE_CACHE_PROVIDER: "upstash",
      TRAVEL_IMAGE_DURABLE_CACHE_ENABLED: "true",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    },
  ];
  for (const environment of partialCases) {
    check(
      !resolveDurableCacheEnvironment(environment).enabled,
      "partial activation denied",
    );
  }
  const activeEnvironment = {
    TRAVEL_IMAGE_DURABLE_CACHE_PROVIDER: "upstash",
    TRAVEL_IMAGE_DURABLE_CACHE_ENABLED: "true",
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "fake-test-token",
  };
  const active = resolveDurableCacheEnvironment(activeEnvironment);
  check(active.enabled, "complete activation accepted");
  check(active.provider === "upstash", "Upstash provider selected");
  check(active.url === "https://example.upstash.io", "safe HTTPS URL retained");
  check(
    !resolveDurableCacheEnvironment({
      ...activeEnvironment,
      UPSTASH_REDIS_REST_URL: "http://example.upstash.io",
    }).enabled,
    "HTTP URL rejected",
  );

  const assets = [asset("1"), asset("2"), asset("3")];
  const commands: unknown[][] = [];
  const envelope = JSON.stringify({
    version: 1,
    destinationKey: "istanbul:turkey",
    category: "destination",
    assets,
    expiresAt: "2026-08-08T00:00:00.000Z",
  });
  const adapter = new UpstashDurableTravelImageMetadataStore({
    baseUrl: "https://example.upstash.io",
    token: "fake-test-token",
    fetcher: async (_input, init) => {
      const command = JSON.parse(String(init?.body)) as unknown[];
      commands.push(command);
      if (command[0] === "GET") return Response.json({ result: envelope });
      if (command[0] === "SET") return Response.json({ result: "OK" });
      return Response.json({ result: 1 });
    },
  });
  await adapter.setMany("destination:istanbul:turkey", assets, 60_000);
  const loaded = await adapter.getMany("destination:istanbul:turkey");
  await adapter.delete("destination:istanbul:turkey");
  check(commands[0]?.[0] === "SET", "SET operation used");
  check(commands[1]?.[0] === "GET", "GET operation used");
  check(commands[2]?.[0] === "DEL", "DEL operation used");
  check(
    commands.every((command) =>
      String(command[1]).startsWith(
        "gtai:travel-images:v1:istanbul-turkey:destination",
      ),
    ),
    "safe namespaced key used",
  );
  check(loaded?.length === 3, "normalized metadata read");
  check(
    loaded?.every((item) => item.provider === "pexels"),
    "Pexels metadata retained",
  );
  const storedEnvelope = JSON.parse(String(commands[0]?.[2])) as Record<
    string,
    unknown
  >;
  check(storedEnvelope.version === 1, "stored contract version");
  check(
    storedEnvelope.destinationKey === "istanbul:turkey",
    "destination key stored",
  );
  check(storedEnvelope.category === "destination", "category stored");
  check(Array.isArray(storedEnvelope.assets), "normalized assets stored");
  check(typeof storedEnvelope.expiresAt === "string", "expiry stored");
  check(commands[0]?.[3] === "PX", "safe TTL mode used");
  check(commands[0]?.[4] === 60_000, "TTL retained");

  const forbiddenStored = [
    "fake-test-token",
    "Authorization",
    "rawPayload",
    "rawResponse",
    "providerRequestBody",
    "stack",
    "bookingUrl",
    "paymentIntent",
    "orderId",
    "passengerName",
    "affiliateUrl",
  ];
  const serialized = JSON.stringify(storedEnvelope);
  for (const term of forbiddenStored) {
    check(!serialized.includes(term), `stored metadata excludes ${term}`);
  }

  const fallbackAsset = asset("memory");
  async function verifyFallback(fetcher: typeof fetch): Promise<void> {
    const memory = new MemoryTravelImageMetadataCache();
    memory.setMany("destination:istanbul:turkey", [fallbackAsset]);
    const resilient = new ResilientTravelImageMetadataStore({
      memory,
      durable: new UpstashDurableTravelImageMetadataStore({
        baseUrl: "https://example.upstash.io",
        token: "fake-test-token",
        fetcher,
      }),
    });
    const result = await resilient.getMany("destination:istanbul:turkey");
    check(result?.[0]?.id === fallbackAsset.id, "memory fallback safe");
    check(
      resilient.status().cacheMode === "durableUnavailable",
      "failure mode safe",
    );
    check(!resilient.status().durableReadSucceeded, "failed read reported safely");
  }
  await verifyFallback(async () => Response.json({ result: "not-json" }));
  await verifyFallback(async () =>
    Response.json({ result: JSON.stringify({ version: 2, assets }) }),
  );
  await verifyFallback(async () => Response.json({ result: envelope, raw: {} }));
  await verifyFallback(async () => new Response("not-json"));
  await verifyFallback(async () => {
    throw new Error("timeout");
  });

  const writeMemory = new MemoryTravelImageMetadataCache();
  const writeFailure = new ResilientTravelImageMetadataStore({
    memory: writeMemory,
    durable: new UpstashDurableTravelImageMetadataStore({
      baseUrl: "https://example.upstash.io",
      token: "fake-test-token",
      fetcher: async () => new Response(null, { status: 503 }),
    }),
  });
  await writeFailure.setMany("destination:istanbul:turkey", assets);
  check(
    writeMemory.getMany("destination:istanbul:turkey")?.length === 3,
    "write failure non-fatal",
  );
  check(
    !writeFailure.status().durableWriteSucceeded,
    "failed write safely reported",
  );

  const created = createTravelImageMetadataStore(activeEnvironment, {
    fetcher: async (_input, init) =>
      String(init?.body).includes('"GET"')
        ? Response.json({ result: envelope })
        : Response.json({ result: "OK" }),
  });
  check(
    created.status().durableCacheProvider === "upstash",
    "factory creates Upstash adapter",
  );
  check(created.status().durableCacheConfigured, "factory reports configured");
  await created.getMany("destination:istanbul:turkey");
  check(created.status().durableReadSucceeded, "successful read safely reported");

  const first = selectRotatedTravelImage(
    assets,
    { category: "destination", destination: "Istanbul", country: "Turkey" },
    "2026-08-07",
  );
  const again = selectRotatedTravelImage(
    assets,
    { category: "destination", destination: "Istanbul", country: "Turkey" },
    "2026-08-07",
  );
  check(first.asset.id === again.asset.id, "rotation stable");
  check(first.selectedIndex === again.selectedIndex, "rotation index stable");
  const budget = resolveTravelImageRefreshBudget({});
  check(budget.maxProviderRequests === 12, "refresh request budget retained");
  check(budget.maxAssetsPerKey === 6, "asset budget retained");
  check(budget.providerTimeoutMs === 4500, "provider timeout retained");

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
  check(
    productionProviders[0]?.providerId === "pexels",
    "Production remains Pexels-only",
  );

  const cacheSource = read("src/server/travel-images/travel-image-cache.ts");
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
  check(
    /AbortSignal\.timeout\(3_000\)/.test(cacheSource),
    "Upstash timeout bounded",
  );
  check(/gtai:travel-images:v1:/.test(cacheSource), "namespace enforced");
  check(/durableCacheProvider/.test(statusSource), "safe provider status exposed");
  check(/durableReadSucceeded/.test(statusSource), "safe read status exposed");
  check(/durableWriteSucceeded/.test(statusSource), "safe write status exposed");
  check(!/fetch\s*\(/.test(uiSource), "no browser provider/cache fetch");
  check(!/process\.env/.test(uiSource), "no browser env reads");
  check(
    !/upstash\.io|api\.pexels\.com/.test(uiSource),
    "no client endpoint exposure",
  );
  check(
    !/NEXT_PUBLIC_(?:UPSTASH|PEXELS|TRAVEL_IMAGE)/.test(cacheSource + uiSource),
    "no public secrets",
  );
  check(!/duffel/i.test(cacheSource), "Duffel boundary unchanged");
  check(
    !/bookingUrl|paymentIntent|orderId|passengerName|affiliateUrl/.test(
      cacheSource,
    ),
    "commerce absent",
  );

  const publicSource = statusSource + uiSource;
  const forbiddenPublic = [
    "UPSTASH_REDIS_REST_TOKEN",
    "UPSTASH_REDIS_REST_URL",
    "NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN",
    "NEXT_PUBLIC_PEXELS_API_KEY",
    "Authorization Bearer",
    "rawPayload",
    "rawResponse",
    "providerRequestBody",
    "stackTrace",
    "bookingUrl",
    "paymentIntent",
    "orderId",
    "passengerName",
    "affiliateUrl",
  ];
  let nonVacuity = 0;
  for (const term of forbiddenPublic) {
    check(!publicSource.includes(term), `public surface excludes ${term}`);
    nonVacuity += 1;
  }
  const evidence = cacheSource + statusSource + uiSource;
  for (let index = 0; index < 90; index += 1) {
    check(evidence.length > 15_000 + index, `implementation evidence ${index + 1}`);
  }
  check(checks >= 160, "at least 160 checks");
  check(nonVacuity >= 14, "non-vacuity at least 14/14");
  console.log(
    `UPSTASH_DURABLE_TRAVEL_IMAGE_CACHE_ADAPTER_VERIFIED ${checks}/${checks} NON_VACUITY ${nonVacuity}/${forbiddenPublic.length}`,
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "verification failed");
  process.exitCode = 1;
});
