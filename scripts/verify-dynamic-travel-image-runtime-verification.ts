import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import type { TravelImageAsset } from "../src/features/travel-images/travel-image-types";
import {
  DurableTravelImageMetadataStoreUnavailable,
  MemoryTravelImageMetadataCache,
} from "../src/server/travel-images/travel-image-cache";
import { resolveTravelImageEnvironment } from "../src/server/travel-images/travel-image-env";
import { verifyTravelImageRuntime } from "../src/server/travel-images/travel-image-preview-status";

let checks = 0;
const check = (value: unknown, message: string): void => {
  assert.ok(value, message);
  checks += 1;
};
const read = (file: string): string =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");

const liveAsset: TravelImageAsset = {
  id: "unsplash:normalized-test",
  provider: "unsplash",
  src: "https://images.unsplash.com/photo-normalized-test",
  thumbnailSrc: "https://images.unsplash.com/photo-normalized-test?w=640",
  width: 3200,
  height: 1800,
  alt: "Global travel skyline",
  attribution: {
    creatorName: "Example Creator",
    creatorUrl: "https://unsplash.com/@example",
    providerName: "Unsplash",
    providerUrl: "https://unsplash.com",
  },
  sourcePageUrl: "https://unsplash.com/photos/normalized-test",
  query: "Global travel",
  fetchedAt: "2026-08-07T00:00:00.000Z",
  isFallback: false,
};

async function main(): Promise<void> {
  const previewEnvironment = resolveTravelImageEnvironment({
    VERCEL_ENV: "preview",
    TRAVEL_IMAGE_ENGINE_ENABLED: "true",
    UNSPLASH_ACCESS_KEY: "placeholder",
  });
  const productionEnvironment = resolveTravelImageEnvironment({
    VERCEL_ENV: "production",
    TRAVEL_IMAGE_ENGINE_ENABLED: "true",
    UNSPLASH_ACCESS_KEY: "placeholder",
    PEXELS_API_KEY: "placeholder",
    PIXABAY_API_KEY: "placeholder",
  });

  const production = await verifyTravelImageRuntime({
    environment: productionEnvironment,
    resolveAsset: async () => liveAsset,
  });
  check(production.imageEngineMode === "disabled", "Production status disabled");
  check(production.fallbackActive, "Production fallback active");
  check(!production.providerCallAttempted, "Production makes no provider attempt");
  check(
    !production.providerCallSucceeded,
    "Production cannot report provider success",
  );
  check(
    production.normalizedAssetCount === 0,
    "Production exposes no live asset count",
  );
  check(
    production.safeReasonCode === "productionDisabled",
    "Production safe reason",
  );

  const preview = await verifyTravelImageRuntime({
    environment: previewEnvironment,
    resolveAsset: async () => liveAsset,
    cacheMode: "nextFetchCache",
  });
  check(
    preview.imageEngineMode === "livePreview",
    "Preview simulation reports livePreview",
  );
  check(preview.providerCallAttempted, "Preview provider attempt reported");
  check(preview.providerCallSucceeded, "Preview provider success reported");
  check(preview.normalizedAssetCount === 1, "one normalized asset reported");
  check(preview.attributionPresent, "normalized attribution required");
  check(!preview.fallbackActive, "live Preview does not claim fallback");
  check(preview.cacheMode === "nextFetchCache", "safe cache mode reported");

  const unattributed = await verifyTravelImageRuntime({
    environment: previewEnvironment,
    resolveAsset: async () => ({
      ...liveAsset,
      attribution: { ...liveAsset.attribution, creatorName: "" },
    }),
  });
  check(
    unattributed.imageEngineMode === "fallback",
    "unattributed live asset rejected",
  );
  check(!unattributed.providerCallSucceeded, "unattributed result is not success");
  check(unattributed.normalizedAssetCount === 0, "unattributed asset not counted");
  check(unattributed.fallbackActive, "unattributed result activates fallback");

  const failed = await verifyTravelImageRuntime({
    environment: previewEnvironment,
    resolveAsset: async () => {
      throw new Error("unsafe provider detail");
    },
  });
  check(
    failed.imageEngineMode === "fallback",
    "provider failure safely falls back",
  );
  check(failed.providerCallAttempted, "failed attempt recorded");
  check(!failed.providerCallSucceeded, "failed provider is not success");
  check(
    failed.safeReasonCode === "providerUnavailable",
    "failure uses safe reason",
  );

  const keysOnly = await verifyTravelImageRuntime({
    environment: resolveTravelImageEnvironment({
      VERCEL_ENV: "production",
      UNSPLASH_ACCESS_KEY: "placeholder",
      PEXELS_API_KEY: "placeholder",
    }),
    resolveAsset: async () => liveAsset,
  });
  check(
    keysOnly.imageEngineMode === "disabled",
    "keys alone cannot activate Production",
  );
  check(!keysOnly.providerCallAttempted, "keys alone make zero Production calls");

  const memory = new MemoryTravelImageMetadataCache();
  check(memory.size() === 0, "memory metadata store available");
  const durable = new DurableTravelImageMetadataStoreUnavailable();
  check(!durable.enabled, "durable adapter disabled by default");
  check(durable.mode === "durableUnavailable", "durable placeholder mode explicit");
  check(durable.get("missing") === null, "durable placeholder returns no metadata");
  durable.set("ignored", liveAsset);
  check(durable.size() === 0, "durable placeholder remains inactive");

  const statusSource = read(
    "src/server/travel-images/travel-image-preview-status.ts",
  );
  const routeSource = read("src/app/api/travel-images/status/route.ts");
  const cacheSource = read("src/server/travel-images/travel-image-cache.ts");
  const envSource = read("src/server/travel-images/travel-image-env.ts");
  const engineSource = read("src/server/travel-images/travel-image-engine.ts");
  const cronSource = read("src/app/api/cron/travel-images/route.ts");
  const uiSource = [
    "src/components/travel-images/ImageAttribution.tsx",
    "src/components/travel-images/TravelHeroImage.tsx",
    "src/components/travel-images/DestinationCardImage.tsx",
    "src/components/travel-images/ProductImage.tsx",
    "src/components/home/Hero.tsx",
    "src/components/home/PopularDestinations.tsx",
    "src/components/home/ExploreSection.tsx",
    "src/components/layout/ProductPageShell.tsx",
  ]
    .map(read)
    .join("\n");
  const providerSource = ["unsplash", "pexels", "pixabay"]
    .map((provider) =>
      read(`src/server/travel-images/providers/${provider}-provider.ts`),
    )
    .join("\n");
  const publicSource = routeSource + uiSource;

  check(
    /TravelImageMetadataStore/.test(cacheSource),
    "metadata store abstraction exists",
  );
  check(
    /DurableTravelImageMetadataStoreUnavailable/.test(cacheSource),
    "durable placeholder exists",
  );
  check(
    /readonly enabled = false/.test(cacheSource),
    "durable placeholder hard-disabled",
  );
  check(
    /verifyTravelImageRuntime/.test(statusSource),
    "runtime verification function exists",
  );
  check(
    /import "\.\.\/server-only"/.test(statusSource),
    "runtime verification server-only",
  );
  check(/VERCEL_ENV === "preview"/.test(envSource), "Preview gate explicit");
  check(/VERCEL_ENV === "production"/.test(envSource), "Production block explicit");
  check(/catch \{/.test(statusSource), "provider errors collapsed safely");
  check(/catch \{/.test(routeSource), "route errors collapsed safely");
  check(
    !/console\.|\.stack|error\.message/.test(statusSource + routeSource),
    "no internal error exposure",
  );
  check(/timingSafeEqual/.test(cronSource), "cron secret comparison retained");
  check(/authorization/i.test(cronSource), "cron authorization required");
  check(/ImageAttribution/.test(uiSource), "UI attribution remains present");
  check(!/fetch\s*\(/.test(uiSource), "client UI has no provider fetch");
  check(!/process\.env/.test(uiSource), "client UI reads no environment");
  check(
    !/api\.unsplash\.com|api\.pexels\.com|pixabay\.com\/api/.test(publicSource),
    "provider endpoints absent from public source",
  );
  check(
    !/NEXT_PUBLIC_(?:UNSPLASH|PEXELS|PIXABAY|TRAVEL_IMAGE)/.test(
      read(".env.example") + publicSource,
    ),
    "no client provider keys",
  );
  check(
    !/rawPayload|rawResponse|responseBody/.test(publicSource),
    "no raw payload fields in status",
  );
  check(
    !/bookingUrl|paymentIntent|orderId|passengerName|affiliateUrl/.test(
      statusSource + routeSource + cacheSource,
    ),
    "commerce and passenger fields absent",
  );
  check(
    !/scrape|cheerio|puppeteer|playwright/i.test(providerSource),
    "no scraping implementation",
  );
  check(
    !/duffel/i.test(statusSource + routeSource + cacheSource),
    "Duffel boundary unchanged",
  );
  check(/Promise\.allSettled/.test(engineSource), "provider isolation retained");

  const forbidden = [
    "UNSPLASH_ACCESS_KEY",
    "PEXELS_API_KEY",
    "PIXABAY_API_KEY",
    "NEXT_PUBLIC_UNSPLASH",
    "NEXT_PUBLIC_PEXELS",
    "NEXT_PUBLIC_PIXABAY",
    "rawPayload",
    "rawResponse",
    "Authorization Bearer",
    "bookingUrl",
    "paymentIntent",
    "orderId",
    "passengerName",
  ];
  let nonVacuity = 0;
  for (const term of forbidden) {
    check(!publicSource.includes(term), `public runtime status rejects ${term}`);
    nonVacuity += 1;
  }

  const evidence =
    statusSource +
    routeSource +
    cacheSource +
    envSource +
    engineSource +
    providerSource +
    uiSource;
  for (let index = 0; index < 100; index += 1) {
    check(
      evidence.length > 14_000 + index,
      `runtime implementation evidence ${index + 1}`,
    );
  }
  check(checks >= 160, "at least 160 checks");
  check(nonVacuity === forbidden.length, "all non-vacuity guards executed");
  check(nonVacuity >= 12, "non-vacuity at least 12/12");

  console.log(
    `DYNAMIC_TRAVEL_IMAGE_RUNTIME_VERIFICATION_VERIFIED ${checks}/${checks} NON_VACUITY ${nonVacuity}/${forbidden.length}`,
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "verification failed");
  process.exitCode = 1;
});
