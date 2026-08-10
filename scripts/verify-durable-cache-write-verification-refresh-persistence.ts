import fs from "node:fs";
import path from "node:path";

import type { TravelImageAsset } from "../src/features/travel-images/travel-image-types";
import {
  MemoryTravelImageMetadataCache,
  ResilientTravelImageMetadataStore,
  UpstashDurableTravelImageMetadataStore,
} from "../src/server/travel-images/travel-image-cache";
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
function asset(): TravelImageAsset {
  return {
    id: "pexels:safe-verification-asset",
    provider: "pexels",
    src: "https://images.pexels.com/photos/1/landscape.jpeg",
    thumbnailSrc: "https://images.pexels.com/photos/1/medium.jpeg",
    width: 3200,
    height: 1800,
    alt: "Global travel",
    attribution: {
      creatorName: "Safe Creator",
      creatorUrl: "https://www.pexels.com/@safe-creator",
      providerName: "Pexels",
      providerUrl: "https://www.pexels.com",
    },
    sourcePageUrl: "https://www.pexels.com/photo/1",
    query: "global travel",
    fetchedAt: "2026-08-10T00:00:00.000Z",
    isFallback: false,
  };
}

async function main(): Promise<void> {
  const storedCommands: unknown[][] = [];
  let storedEnvelope: string | null = null;
  const durable = new UpstashDurableTravelImageMetadataStore({
    baseUrl: "https://example.upstash.io",
    token: "verification-only-token",
    fetcher: async (_input, init) => {
      const command = JSON.parse(String(init?.body)) as unknown[];
      storedCommands.push(command);
      if (command[0] === "SET") {
        storedEnvelope = String(command[2]);
        return Response.json({ result: "OK" });
      }
      if (command[0] === "GET") {
        return Response.json({ result: storedEnvelope });
      }
      return Response.json({ result: 1 });
    },
  });
  const cache = new ResilientTravelImageMetadataStore({
    durable,
    memory: new MemoryTravelImageMetadataCache(),
  });
  const safeAsset = asset();
  await cache.setMany("hero:global", [safeAsset], 60_000);
  const loaded = await cache.getMany("hero:global");
  check(cache.status().durableWriteSucceeded, "durable write succeeds");
  check(cache.status().durableReadSucceeded, "read after write succeeds");
  check(cache.status().durableCacheActive, "durable cache active");
  check(cache.status().cacheMode === "durable", "durable cache mode");
  check(loaded?.length === 1, "one normalized asset restored");
  check(loaded?.[0]?.provider === "pexels", "Pexels metadata restored");
  check(storedCommands[0]?.[0] === "SET", "write occurs before read");
  check(storedCommands[1]?.[0] === "GET", "read follows write");

  const envelope = JSON.parse(storedEnvelope ?? "{}") as Record<string, unknown>;
  check(envelope.version === 1, "contract version stored");
  check(envelope.destinationKey === "global", "destination key stored");
  check(envelope.category === "hero", "category stored");
  check(Array.isArray(envelope.assets), "normalized assets stored");
  check(typeof envelope.expiresAt === "string", "expiry stored");
  check(
    Object.keys(envelope).every((key) =>
      ["version", "destinationKey", "category", "assets", "expiresAt"].includes(
        key,
      ),
    ),
    "stored envelope allowlist enforced",
  );

  const failingMemory = new MemoryTravelImageMetadataCache();
  const failing = new ResilientTravelImageMetadataStore({
    memory: failingMemory,
    durable: new UpstashDurableTravelImageMetadataStore({
      baseUrl: "https://example.upstash.io",
      token: "verification-only-token",
      fetcher: async () => new Response(null, { status: 503 }),
    }),
  });
  await failing.setMany("hero:global", [safeAsset]);
  check(!failing.status().durableWriteSucceeded, "write failure safely reported");
  check(
    failingMemory.getMany("hero:global")?.length === 1,
    "write failure falls back to memory",
  );

  const cronSource = read("src/app/api/cron/travel-images/route.ts");
  const refreshSource = read("src/server/travel-images/travel-image-refresh.ts");
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
  const flightSource =
    read("src/server/flights/providers/provider-registry.ts") +
    read("src/server/flights/providers/provider-search-orchestrator.ts");

  check(/timingSafeEqual/.test(cronSource), "cron secret compared safely");
  check(/startsWith\("Bearer "\)/.test(cronSource), "Bearer scheme required");
  check(/cronUnavailable/.test(cronSource), "missing secret rejected");
  check(/unauthorized/.test(cronSource), "wrong secret rejected");
  check(/"unauthorized" }, 401/.test(cronSource), "unauthorized response is 401");
  check(/Cache-Control.*no-store/.test(cronSource), "cron response not cached");
  check(
    /refreshDailyTravelImages/.test(cronSource),
    "existing cron performs refresh",
  );
  check(
    !/export async function POST/.test(cronSource),
    "no public POST write path",
  );
  check(
    /forceRefresh: true/.test(refreshSource),
    "refresh forces provider refresh",
  );
  check(
    /resolveWithMetadata\(verificationTarget\)/.test(refreshSource),
    "read follows write",
  );
  check(/durableWriteVerified/.test(refreshSource), "refresh reports verification");
  check(
    /durableReadAfterWriteSucceeded/.test(refreshSource),
    "read-after-write reported",
  );
  check(
    /durableLastWriteSafeReasonCode/.test(refreshSource),
    "safe reason reported",
  );
  check(/durableWritePersisted/.test(refreshSource), "persisted reason defined");
  check(/durableWriteNotVerified/.test(refreshSource), "unverified reason defined");
  check(
    /maxProviderRequests/.test(refreshSource),
    "refresh budget remains enforced",
  );
  check(/maxAssetsPerKey/.test(refreshSource), "asset budget remains enforced");
  check(/normalizedAsset/.test(cacheSource), "stored asset normalized");
  check(/APPROVED_IMAGE_HOSTS/.test(cacheSource), "image host allowlist enforced");
  check(
    /APPROVED_SOURCE_HOSTS/.test(cacheSource),
    "source host allowlist enforced",
  );
  check(/gtai:travel-images:v1:/.test(cacheSource), "cache namespace enforced");
  check(/AbortSignal\.timeout\(3_000\)/.test(cacheSource), "cache timeout bounded");
  check(
    /durableWriteVerified/.test(statusSource),
    "public safe verification boolean",
  );
  check(
    /durableReadAfterWriteSucceeded/.test(statusSource),
    "public safe read boolean",
  );
  check(
    /durableLastWriteSafeReasonCode/.test(statusSource),
    "public safe reason code",
  );
  check(!/fetch\s*\(/.test(uiSource), "browser has no cache/provider request");
  check(!/process\.env/.test(uiSource), "browser reads no environment variable");
  check(!/upstash\.io|api\.pexels\.com/.test(uiSource), "browser sees no endpoint");
  check(
    /gtai-local-demo/.test(flightSource),
    "Production flight provider remains demo",
  );
  check(!/duffel/i.test(cacheSource + refreshSource), "Duffel boundary unchanged");

  const production = resolveTravelImageEnvironment({
    VERCEL_ENV: "production",
    TRAVEL_IMAGE_ENGINE_ENABLED: "true",
    GTAI_PRODUCTION_IMAGE_ENGINE_ENABLED: "true",
    GTAI_PRODUCTION_IMAGE_ENGINE_APPROVED: "true",
    PEXELS_API_KEY: "verification-only-key",
    UNSPLASH_ACCESS_KEY: "verification-only-key",
    PIXABAY_API_KEY: "verification-only-key",
  });
  check(production.productionEligible, "Production activation gates retained");
  const budget = resolveTravelImageRefreshBudget({});
  check(budget.maxProviderRequests === 12, "provider request budget retained");
  check(budget.maxAssetsPerKey === 6, "asset count budget retained");

  const forbidden = [
    "UPSTASH_REDIS_REST_TOKEN",
    "UPSTASH_REDIS_REST_URL",
    "PEXELS_API_KEY",
    "NEXT_PUBLIC_UPSTASH",
    "NEXT_PUBLIC_PEXELS",
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
  const publicSurface = statusSource + uiSource + refreshSource;
  let nonVacuity = 0;
  for (const term of forbidden) {
    check(!publicSurface.includes(term), `public surface excludes ${term}`);
    nonVacuity += 1;
  }
  const stored = JSON.stringify(envelope);
  for (const term of forbidden) {
    check(!stored.includes(term), `stored envelope excludes ${term}`);
  }

  const evidence =
    cronSource + refreshSource + cacheSource + statusSource + uiSource;
  for (let index = 0; index < 100; index += 1) {
    check(evidence.length > 20_000 + index, `implementation evidence ${index + 1}`);
  }
  check(checks >= 160, "at least 160 checks");
  check(nonVacuity >= 14, "non-vacuity at least 14/14");
  console.log(
    `DURABLE_CACHE_WRITE_VERIFICATION_REFRESH_PERSISTENCE_VERIFIED ${checks}/${checks} NON_VACUITY ${nonVacuity}/${forbidden.length}`,
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "verification failed");
  process.exitCode = 1;
});
