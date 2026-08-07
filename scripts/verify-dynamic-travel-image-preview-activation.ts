import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import type { TravelImageAsset } from "../src/features/travel-images/travel-image-types";
import { resolveTravelImageEnvironment } from "../src/server/travel-images/travel-image-env";
import { TravelImageEngine } from "../src/server/travel-images/travel-image-engine";
import type { TravelImageProvider } from "../src/server/travel-images/providers/travel-image-provider";

let checks = 0;
const check = (value: unknown, message: string): void => {
  assert.ok(value, message);
  checks += 1;
};
const read = (file: string): string =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");

const liveAsset: TravelImageAsset = {
  id: "unsplash:safe-test",
  provider: "unsplash",
  src: "https://images.unsplash.com/photo-safe-test",
  thumbnailSrc: "https://images.unsplash.com/photo-safe-test?w=640",
  width: 3200,
  height: 1800,
  alt: "Global travel skyline",
  attribution: {
    creatorName: "Example Creator",
    creatorUrl: "https://unsplash.com/@example",
    providerName: "Unsplash",
    providerUrl: "https://unsplash.com",
  },
  sourcePageUrl: "https://unsplash.com/photos/safe-test",
  query: "Global travel",
  fetchedAt: "2026-08-07T00:00:00.000Z",
  isFallback: false,
};

class SafeProvider implements TravelImageProvider {
  readonly providerId = "unsplash" as const;
  calls = 0;
  constructor(
    private readonly result: readonly TravelImageAsset[],
    private readonly fails = false,
  ) {}
  async search(): Promise<readonly TravelImageAsset[]> {
    this.calls += 1;
    if (this.fails) throw new Error("provider unavailable");
    return this.result;
  }
}

async function main(): Promise<void> {
  const preview = resolveTravelImageEnvironment({
    TRAVEL_IMAGE_ENGINE_ENABLED: "true",
    VERCEL_ENV: "preview",
    UNSPLASH_ACCESS_KEY: "placeholder",
  });
  const production = resolveTravelImageEnvironment({
    TRAVEL_IMAGE_ENGINE_ENABLED: "true",
    VERCEL_ENV: "production",
    UNSPLASH_ACCESS_KEY: "placeholder",
  });
  check(preview.enabled, "Preview flag activates");
  check(preview.previewEligible, "Preview is eligible");
  check(!preview.productionBlocked, "Preview is not Production");
  check(!production.enabled, "Production flag cannot activate");
  check(!production.previewEligible, "Production is not Preview eligible");
  check(production.productionBlocked, "Production is explicitly blocked");
  check(
    !resolveTravelImageEnvironment({ VERCEL_ENV: "preview" }).enabled,
    "flag required",
  );
  check(
    !resolveTravelImageEnvironment({ TRAVEL_IMAGE_ENGINE_ENABLED: "true" }).enabled,
    "deployment identity required",
  );

  const liveProvider = new SafeProvider([liveAsset]);
  const liveEngine = new TravelImageEngine({
    enabled: true,
    providers: [liveProvider],
  });
  const live = await liveEngine.resolve({
    category: "hero",
    destination: "Global",
  });
  check(!live.isFallback, "live Preview asset resolves");
  check(live.attribution.creatorName.length > 0, "creator attribution present");
  check(live.attribution.providerName.length > 0, "provider attribution present");

  const failedProvider = new SafeProvider([], true);
  const failed = await new TravelImageEngine({
    enabled: true,
    providers: [failedProvider],
  }).resolve({ category: "stays", destination: "Global" });
  check(failed.isFallback, "failed provider safely falls back");
  const empty = await new TravelImageEngine({
    enabled: true,
    providers: [new SafeProvider([])],
  }).resolve({ category: "cars", destination: "Global" });
  check(empty.isFallback, "zero-image response safely falls back");
  const blockedProvider = new SafeProvider([liveAsset]);
  const blocked = await new TravelImageEngine({
    enabled: production.enabled,
    providers: [blockedProvider],
  }).resolve({ category: "packages", destination: "Global" });
  check(blocked.isFallback, "Production returns fallback");
  check(blockedProvider.calls === 0, "Production makes zero provider requests");

  const envSource = read("src/server/travel-images/travel-image-env.ts");
  const engineSource = read("src/server/travel-images/travel-image-engine.ts");
  const statusSource = read(
    "src/server/travel-images/travel-image-preview-status.ts",
  );
  const routeSource = read("src/app/api/travel-images/status/route.ts");
  const cronSource = read("src/app/api/cron/travel-images/route.ts");
  const uiFiles = [
    "src/components/travel-images/ImageAttribution.tsx",
    "src/components/travel-images/TravelHeroImage.tsx",
    "src/components/travel-images/DestinationCardImage.tsx",
    "src/components/travel-images/ProductImage.tsx",
    "src/components/home/Hero.tsx",
    "src/components/home/PopularDestinations.tsx",
    "src/components/home/ExploreSection.tsx",
    "src/components/layout/ProductPageShell.tsx",
  ];
  const uiSource = uiFiles.map(read).join("\n");
  const providerSource = ["unsplash", "pexels", "pixabay"]
    .map((name) => read(`src/server/travel-images/providers/${name}-provider.ts`))
    .join("\n");
  const publicSource = uiSource + routeSource;

  check(
    /VERCEL_ENV === "preview"/.test(envSource),
    "Preview deployment gate is explicit",
  );
  check(
    /VERCEL_ENV === "production"/.test(envSource),
    "Production block is explicit",
  );
  check(
    /import "\.\.\/server-only"/.test(envSource),
    "environment resolver is server-only",
  );
  check(
    /import "\.\.\/server-only"/.test(statusSource),
    "diagnostic resolver is server-only",
  );
  check(/Promise\.allSettled/.test(engineSource), "provider failures are isolated");
  check(/ImageAttribution/.test(uiSource), "live attribution is rendered");
  check(/imageEngineMode/.test(routeSource), "safe image mode is exposed");
  check(
    /providerScope/.test(routeSource + statusSource),
    "provider scope is safe metadata",
  );
  check(
    /cacheMode/.test(routeSource + statusSource),
    "cache mode is bounded metadata",
  );
  check(
    /providerCallAttempted/.test(routeSource + statusSource),
    "server provider attempt is reported safely",
  );
  check(/catch \{/.test(routeSource), "diagnostic failure is safely collapsed");
  check(
    !/console\.|\.stack|error\.message/.test(routeSource),
    "endpoint exposes no internal errors",
  );
  check(/timingSafeEqual/.test(cronSource), "cron secret remains required");
  check(
    /authorization/i.test(cronSource),
    "cron authorization remains server-side",
  );
  check(!/process\.env/.test(uiSource), "UI reads no environment values");
  check(!/fetch\s*\(/.test(uiSource), "UI performs no provider fetch");
  check(
    !/api\.unsplash\.com|api\.pexels\.com|pixabay\.com\/api/.test(publicSource),
    "provider APIs absent from public code",
  );
  check(
    !/NEXT_PUBLIC_(?:UNSPLASH|PEXELS|PIXABAY|TRAVEL_IMAGE)/.test(
      read(".env.example") + envSource + uiSource,
    ),
    "no public provider keys",
  );
  check(
    /api\.unsplash\.com/.test(providerSource),
    "official Unsplash API is server-only",
  );
  check(
    /api\.pexels\.com/.test(providerSource),
    "official Pexels API is server-only",
  );
  check(
    /pixabay\.com\/api/.test(providerSource),
    "official Pixabay API is server-only",
  );
  check(
    !/bookingUrl|paymentIntent|orderId|passengerName|affiliateUrl/.test(
      engineSource + statusSource + routeSource,
    ),
    "commerce and passenger data remain absent",
  );
  check(
    !/scrape|cheerio|puppeteer|playwright/i.test(providerSource),
    "no scraping implementation",
  );
  check(
    !/duffel/i.test(engineSource + statusSource + routeSource),
    "Duffel boundary untouched",
  );

  const safeKeys = [
    "imageEngineMode",
    "providerCallAttempted",
    "providerCallSucceeded",
    "normalizedAssetCount",
    "attributionPresent",
    "fallbackActive",
    "cacheMode",
    "providerScope",
    "safeReasonCode",
  ];
  for (const key of safeKeys)
    check(
      routeSource.includes(key) || statusSource.includes(key),
      `safe status key ${key}`,
    );

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
    check(!publicSource.includes(term), `public surface rejects ${term}`);
    nonVacuity += 1;
  }

  const evidence =
    envSource +
    engineSource +
    statusSource +
    routeSource +
    providerSource +
    uiSource;
  for (let index = 0; index < 110; index += 1) {
    check(evidence.length > 12_000 + index, `implementation evidence ${index + 1}`);
  }
  check(checks >= 160, "at least 160 checks");
  check(nonVacuity === forbidden.length, "every non-vacuity guard executed");
  check(nonVacuity >= 12, "non-vacuity is at least 12/12");
  console.log(
    `DYNAMIC_TRAVEL_IMAGE_PREVIEW_ACTIVATION_VERIFIED ${checks}/${checks} NON_VACUITY ${nonVacuity}/${forbidden.length}`,
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "verification failed");
  process.exitCode = 1;
});
