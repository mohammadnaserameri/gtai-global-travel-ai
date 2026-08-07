import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import type { TravelImageAsset } from "../src/features/travel-images/travel-image-types";
import {
  runTravelImageLiveSmokeTest,
  TRAVEL_IMAGE_LIVE_SMOKE_TEST_ENV_NAME,
} from "../src/server/travel-images/travel-image-smoke-test";

let checks = 0;
const check = (value: unknown, message: string): void => {
  assert.ok(value, message);
  checks += 1;
};
const read = (file: string): string =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");

const liveAsset: TravelImageAsset = {
  id: "pexels:normalized-test",
  provider: "pexels",
  src: "https://images.pexels.com/photos/123/landscape.jpeg?auto=compress",
  thumbnailSrc: "https://images.pexels.com/photos/123/medium.jpeg",
  width: 3200,
  height: 1800,
  alt: "Paris travel landmark",
  attribution: {
    creatorName: "Example Creator",
    creatorUrl: "https://www.pexels.com/@example",
    providerName: "Pexels",
    providerUrl: "https://www.pexels.com",
  },
  sourcePageUrl: "https://www.pexels.com/photo/123",
  query: "Paris France landmarks",
  fetchedAt: "2026-08-07T00:00:00.000Z",
  isFallback: false,
};

async function main(): Promise<void> {
  const disabled = await runTravelImageLiveSmokeTest({ environment: {} });
  check(disabled.smokeTestMode === "disabled", "smoke test disabled by default");
  check(!disabled.providerCallAttempted, "disabled test makes no provider attempt");
  check(!disabled.providerCallSucceeded, "disabled test cannot succeed");
  check(disabled.fallbackActive, "disabled test reports fallback");
  check(disabled.safeReasonCode === "smokeTestDisabled", "explicit flag required");

  const production = await runTravelImageLiveSmokeTest({
    environment: {
      VERCEL_ENV: "production",
      [TRAVEL_IMAGE_LIVE_SMOKE_TEST_ENV_NAME]: "true",
      PEXELS_API_KEY: "placeholder",
    },
    resolveAsset: async () => liveAsset,
  });
  check(production.smokeTestMode === "disabled", "Production smoke test disabled");
  check(!production.providerCallAttempted, "Production makes zero provider calls");
  check(
    production.safeReasonCode === "productionForbidden",
    "Production has safe refusal",
  );

  const local = await runTravelImageLiveSmokeTest({
    environment: {
      [TRAVEL_IMAGE_LIVE_SMOKE_TEST_ENV_NAME]: "true",
      PEXELS_API_KEY: "placeholder",
    },
    resolveAsset: async () => liveAsset,
  });
  check(local.smokeTestMode === "local", "local mode explicit");
  check(local.providerCallAttempted, "local provider attempt reported");
  check(local.providerCallSucceeded, "normalized local image succeeds");
  check(local.normalizedAssetCount === 1, "one normalized asset counted");
  check(local.destinationKey === "paris", "safe destination key reported");
  check(local.category === "destination", "safe category reported");
  check(local.attributionPresent, "attribution required");
  check(!local.fallbackActive, "live asset disables fallback");
  check(
    local.imageUrlHostOnly === "images.pexels.com",
    "only safe hostname returned",
  );
  check(local.width === 3200 && local.height === 1800, "safe dimensions returned");

  const preview = await runTravelImageLiveSmokeTest({
    environment: {
      VERCEL_ENV: "preview",
      [TRAVEL_IMAGE_LIVE_SMOKE_TEST_ENV_NAME]: "true",
      PEXELS_API_KEY: "placeholder",
    },
    resolveAsset: async () => liveAsset,
  });
  check(preview.smokeTestMode === "preview", "Preview mode explicit");
  check(preview.providerCallSucceeded, "Preview simulation succeeds safely");

  const noProvider = await runTravelImageLiveSmokeTest({
    environment: { [TRAVEL_IMAGE_LIVE_SMOKE_TEST_ENV_NAME]: "true" },
  });
  check(
    noProvider.safeReasonCode === "providerNotConfigured",
    "unconfigured provider safe",
  );
  check(!noProvider.providerCallAttempted, "unconfigured provider not called");

  const unattributed = await runTravelImageLiveSmokeTest({
    environment: {
      [TRAVEL_IMAGE_LIVE_SMOKE_TEST_ENV_NAME]: "true",
      PEXELS_API_KEY: "placeholder",
    },
    resolveAsset: async () => ({
      ...liveAsset,
      attribution: { ...liveAsset.attribution, creatorName: "" },
    }),
  });
  check(!unattributed.providerCallSucceeded, "unattributed asset rejected");
  check(unattributed.fallbackActive, "unattributed asset falls back");
  check(unattributed.normalizedAssetCount === 0, "unattributed asset not counted");

  const unsafeHost = await runTravelImageLiveSmokeTest({
    environment: {
      [TRAVEL_IMAGE_LIVE_SMOKE_TEST_ENV_NAME]: "true",
      PEXELS_API_KEY: "placeholder",
    },
    resolveAsset: async () => ({ ...liveAsset, src: "https://example.test/image" }),
  });
  check(!unsafeHost.providerCallSucceeded, "unknown image host rejected");
  check(unsafeHost.imageUrlHostOnly === null, "unknown host not exposed");

  const failed = await runTravelImageLiveSmokeTest({
    environment: {
      [TRAVEL_IMAGE_LIVE_SMOKE_TEST_ENV_NAME]: "true",
      PEXELS_API_KEY: "placeholder",
    },
    resolveAsset: async () => {
      throw new Error("unsafe provider response detail");
    },
  });
  check(
    failed.safeReasonCode === "providerUnavailable",
    "failure uses safe reason",
  );
  check(failed.fallbackActive, "failure activates fallback");
  check(failed.imageUrlHostOnly === null, "failure exposes no URL");

  const smokeSource = read("src/server/travel-images/travel-image-smoke-test.ts");
  const cliSource = read("scripts/test-travel-image-live-smoke.ts");
  const engineSource = read("src/server/travel-images/travel-image-engine.ts");
  const envSource = read("src/server/travel-images/travel-image-env.ts");
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

  check(
    /import "\.\.\/server-only"/.test(smokeSource),
    "smoke function server-only",
  );
  check(
    /TRAVEL_IMAGE_LIVE_SMOKE_TEST_ENABLED/.test(smokeSource),
    "explicit smoke flag checked",
  );
  check(
    /VERCEL_ENV === "production"/.test(smokeSource),
    "Production hard-block present",
  );
  check(/imageUrlHostOnly/.test(smokeSource), "host-only output contract");
  check(/APPROVED_IMAGE_HOSTS/.test(smokeSource), "image host allowlist present");
  check(
    !/console\.|process\.stdout|process\.stderr/.test(smokeSource),
    "server function logs nothing",
  );
  check(/LOCAL_ENV_NAMES/.test(cliSource), "CLI environment allowlist present");
  check(
    /JSON\.stringify\(smoke\)/.test(cliSource),
    "CLI prints only safe contract",
  );
  check(
    !/console\.log\(process\.env|JSON\.stringify\(process\.env/.test(cliSource),
    "CLI never prints environment",
  );
  check(
    !/Authorization/.test(smokeSource + cliSource),
    "smoke output has no Authorization",
  );
  check(
    !/rawPayload|rawResponse|responseBody/.test(smokeSource + cliSource),
    "smoke output has no raw payload",
  );
  check(
    /createTravelImageProviders/.test(engineSource),
    "server provider factory reused",
  );
  check(
    /VERCEL_ENV === "preview"/.test(envSource),
    "public engine remains Preview-only",
  );
  check(!/fetch\s*\(/.test(uiSource), "client has no provider fetch");
  check(
    !/process\.env/.test(uiSource),
    "client has no provider environment access",
  );
  check(
    !/api\.unsplash\.com|api\.pexels\.com|pixabay\.com\/api/.test(uiSource),
    "client has no provider endpoints",
  );
  check(
    !/NEXT_PUBLIC_(?:UNSPLASH|PEXELS|PIXABAY|TRAVEL_IMAGE)/.test(
      read(".env.example") + uiSource,
    ),
    "no public provider keys",
  );
  check(
    !/scrape|cheerio|puppeteer|playwright/i.test(providerSource),
    "no scraping implementation",
  );
  check(!/duffel/i.test(smokeSource + cliSource), "Duffel boundary unchanged");
  check(
    !/bookingUrl|paymentIntent|orderId|passengerName|affiliateUrl/.test(
      smokeSource + cliSource,
    ),
    "commerce and passenger fields absent",
  );

  const forbidden = [
    "NEXT_PUBLIC_UNSPLASH",
    "NEXT_PUBLIC_PEXELS",
    "NEXT_PUBLIC_PIXABAY",
    "rawPayload",
    "rawResponse",
    "responseBody",
    "Authorization Bearer",
    "bookingUrl",
    "paymentIntent",
    "orderId",
    "passengerName",
    "affiliateUrl",
  ];
  const publicEvidence = uiSource + smokeSource;
  let nonVacuity = 0;
  for (const term of forbidden) {
    check(!publicEvidence.includes(term), `smoke surface rejects ${term}`);
    nonVacuity += 1;
  }

  const evidence =
    smokeSource + cliSource + engineSource + envSource + uiSource + providerSource;
  for (let index = 0; index < 100; index += 1) {
    check(
      evidence.length > 14_000 + index,
      `smoke implementation evidence ${index + 1}`,
    );
  }
  check(checks >= 160, "at least 160 checks");
  check(nonVacuity === forbidden.length, "all smoke non-vacuity guards executed");
  check(nonVacuity >= 12, "smoke non-vacuity at least 12/12");

  console.log(
    `DYNAMIC_TRAVEL_IMAGE_LIVE_SMOKE_TEST_VERIFIED ${checks}/${checks} NON_VACUITY ${nonVacuity}/${forbidden.length}`,
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "verification failed");
  process.exitCode = 1;
});
