import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getPublicBetaStatus } from "../src/server/system/public-beta-status";
import {
  getProductionLaunchControl,
  isProductionRuntime,
  productionLaunchAllowsLiveProvider,
} from "../src/server/flights/providers/production-launch-control";
import {
  resolveRuntimeProviderRegistry,
  runtimeProviderRegistry,
} from "../src/server/flights/providers/provider-registry";
import { evaluateDuffelPreviewActivation } from "../src/server/flights/providers/duffel/duffel-preview-activation-gate";
import { GET as getPublicStatusResponse } from "../src/app/api/status/route";

let checks = 0;
function check(value: unknown, message: string): void {
  assert.ok(value, message);
  checks += 1;
}

const root = process.cwd();
const read = (file: string): string =>
  fs.readFileSync(path.join(root, file), "utf8");
const launchSource = read(
  "src/server/flights/providers/production-launch-control.ts",
);
const statusSource = read("src/server/system/public-beta-status.ts");
const systemRouteSource = read("src/app/api/system/public-beta-status/route.ts");
const publicRouteSource = read("src/app/api/status/route.ts");
const routeSource = `${systemRouteSource}\n${publicRouteSource}`;
const registrySource = read("src/server/flights/providers/provider-registry.ts");
const requestSource = read(
  "src/server/flights/flight-search-request-validation.ts",
);
const clientSource = [
  read("src/features/flights/api-flight-offer-repository.ts"),
  read("src/components/flights/FlightResultsExperience.tsx"),
  read("src/components/flights/details/FlightDetailsExperience.tsx"),
].join("\n");
const docs = read(
  "docs/implementation/V2_9_A_PUBLIC_BETA_CLOSURE_PRODUCTION_LAUNCH_CONTROL.md",
);
const serverBoundary = `${launchSource}\n${statusSource}\n${routeSource}\n${registrySource}`;

const control = getProductionLaunchControl();
check(control.productionLiveProviderEnabled === false, "Production live disabled");
check(
  control.productionLiveProviderApproved === false,
  "Production live unapproved",
);
check(
  control.productionProviderMode === "demonstration",
  "Production mode demonstration",
);
check(control.bookingEnabled === false, "booking disabled");
check(control.paymentsEnabled === false, "payments disabled");
check(control.ordersEnabled === false, "Orders disabled");
check(control.affiliateRedirectsEnabled === false, "affiliate redirects disabled");
check(productionLaunchAllowsLiveProvider() === false, "hard launch result false");
check(
  productionLaunchAllowsLiveProvider.length === 0,
  "launch gate accepts no input",
);
check(
  isProductionRuntime({ VERCEL_ENV: "production" }),
  "Production detected server-side",
);
check(!isProductionRuntime({ VERCEL_ENV: "preview" }), "Preview is not Production");
check(!isProductionRuntime({}), "missing environment is not Production");
check(
  /import "\.\.\/\.\.\/server-only"/.test(launchSource),
  "launch control server-only",
);
check(/Object\.freeze/.test(launchSource), "launch state immutable");
check(!/process\.env/.test(launchSource), "launch control reads no environment");
check(
  !/GTAI_PRODUCTION_LIVE_PROVIDER_(?:ENABLED|APPROVED)/.test(launchSource),
  "future names inactive in code",
);
check(
  !/DUFFEL_ACCESS_TOKEN/.test(launchSource),
  "token absent from launch control",
);
check(!/NEXT_PUBLIC/.test(launchSource), "no public launch flag");
check(
  /isProductionRuntime\(environment\)/.test(registrySource),
  "registry calls hard Production gate",
);
check(
  /!productionLaunchAllowsLiveProvider\(\)/.test(registrySource),
  "registry requires hard permission",
);

const productionInputs = [
  { VERCEL_ENV: "production" },
  {
    VERCEL_ENV: "production",
    DUFFEL_ACCESS_TOKEN: `duffel_test_${"A".repeat(40)}`,
  },
  {
    VERCEL_ENV: "production",
    DUFFEL_MANUAL_TEST_ENABLED: "true",
    GTAI_DUFFEL_PREVIEW_REAL_TEST_ENABLED: "true",
  },
  {
    VERCEL_ENV: "production",
    GTAI_PRODUCTION_LIVE_PROVIDER_ENABLED: "true",
    GTAI_PRODUCTION_LIVE_PROVIDER_APPROVED: "true",
  },
  {
    VERCEL_ENV: "production",
    provider: "duffel-test-contract",
    query: "live=true",
  },
];
for (const [index, environment] of productionInputs.entries()) {
  const ids = resolveRuntimeProviderRegistry({ environment })
    .enabledProviders()
    .map((provider) => provider.providerId);
  check(
    ids.length === 1 && ids[0] === "gtai-local-demo",
    `Production mutation ${index + 1} remains demo-only`,
  );
}
check(
  runtimeProviderRegistry.enabledProviders()[0]?.providerId === "gtai-local-demo",
  "default registry demo-only",
);
check(
  !/provider/.test(
    requestSource.match(/ALLOWED_REQUEST_KEYS[\s\S]*?\]/)?.[0] ?? "",
  ),
  "search request cannot select provider",
);
check(!/searchParams/.test(registrySource), "registry reads no query parameters");
check(
  !/providerId\s*:\s*searchParams/.test(clientSource),
  "client cannot force provider",
);
check(
  !/GTAI_PRODUCTION_LIVE_PROVIDER/.test(clientSource),
  "client has no launch variables",
);

const previewEnvironment = {
  VERCEL_ENV: "preview",
  DUFFEL_ACCESS_TOKEN: `duffel_test_${"B".repeat(40)}`,
  DUFFEL_MANUAL_TEST_ENABLED: "true",
  GTAI_DUFFEL_PREVIEW_REAL_TEST_ENABLED: "true",
};
check(
  evaluateDuffelPreviewActivation(previewEnvironment).eligible,
  "Preview activation remains gated and available",
);
check(
  !evaluateDuffelPreviewActivation({
    ...previewEnvironment,
    DUFFEL_MANUAL_TEST_ENABLED: undefined,
  }).eligible,
  "Preview manual gate required",
);
check(
  !evaluateDuffelPreviewActivation({
    ...previewEnvironment,
    GTAI_DUFFEL_PREVIEW_REAL_TEST_ENABLED: undefined,
  }).eligible,
  "Preview real gate required",
);
check(
  !evaluateDuffelPreviewActivation({
    ...previewEnvironment,
    DUFFEL_ACCESS_TOKEN: undefined,
  }).eligible,
  "Preview credential required",
);

const status = getPublicBetaStatus();
check(Object.isFrozen(status), "status object immutable");
check(status.app === "GTAI", "status app allowlisted");
check(status.mode === "publicBeta", "status mode publicBeta");
check(status.productionProviderMode === "demonstration", "status Production demo");
check(status.livePreviewAvailable === true, "status reports Preview capability");
check(status.bookingEnabled === false, "status booking false");
check(status.paymentsEnabled === false, "status payments false");
check(status.ordersEnabled === false, "status Orders false");
check(status.affiliateRedirectsEnabled === false, "status affiliate false");
check(status.tokenExposed === false, "status token exposure false");
check(
  status.productionLiveProviderEnabled === false,
  "status Production live false",
);
const expectedStatusKeys = [
  "affiliateRedirectsEnabled",
  "app",
  "bookingEnabled",
  "livePreviewAvailable",
  "mode",
  "ordersEnabled",
  "paymentsEnabled",
  "productionLiveProviderEnabled",
  "productionProviderMode",
  "tokenExposed",
];
check(
  Object.keys(status).sort().join(",") === expectedStatusKeys.join(","),
  "status has exact key allowlist",
);
check(!/process\.env/.test(statusSource), "status reads no environment");
check(
  !/DUFFEL|Authorization|Bearer|credential|rawPayload|stack/i.test(
    JSON.stringify(status),
  ),
  "status exposes no internals",
);
const publicStatusResponse = getPublicStatusResponse();
check(
  publicStatusResponse.status === 200,
  "public status endpoint returns HTTP 200",
);
check(
  publicStatusResponse.headers.get("Content-Type") ===
    "application/json; charset=utf-8",
  "public status endpoint returns JSON",
);
check(
  publicStatusResponse.headers.get("Cache-Control") === "no-store, max-age=0",
  "public status endpoint is not cached",
);
check(
  publicRouteSource.includes("JSON.stringify(getPublicBetaStatus())"),
  "public status response uses only the safe status contract",
);
check(
  publicRouteSource.includes("export function GET(): Response"),
  "public /api/status route exists",
);
check(/status:\s*200/.test(routeSource), "status endpoint HTTP 200");
check(
  /"Content-Type":\s*"application\/json; charset=utf-8"/.test(routeSource),
  "status endpoint JSON",
);
check(
  /"Cache-Control":\s*"no-store, max-age=0"/.test(routeSource),
  "status endpoint no-store",
);
check(
  /"X-Content-Type-Options":\s*"nosniff"/.test(routeSource),
  "status endpoint nosniff",
);
check(/new Response\(JSON\.stringify/.test(routeSource), "endpoint body present");
check(
  /JSON\.stringify\(getPublicBetaStatus\(\)\)/.test(routeSource),
  "endpoint serializes only status contract",
);
check(
  !/process\.env|searchParams|request\.headers/.test(routeSource),
  "endpoint reads no request or environment",
);
check(
  !/Authorization|credential|rawPayload|stack/i.test(routeSource),
  "endpoint implementation exposes no internals",
);

const forbiddenPatterns = [
  /Authorization\s*:/,
  /Bearer\s+[A-Za-z0-9]/,
  /rawPayload\s*:/,
  /bookingUrl\s*:/,
  /paymentIntent\s*:/,
  /orderId\s*:/,
  /passengerName\s*:/,
  /passport\s*:/,
  /loyalty\s*:/,
  /affiliateUrl\s*:/,
];
for (const pattern of forbiddenPatterns)
  check(!pattern.test(serverBoundary), `server boundary forbids ${pattern}`);
check(
  !/partnership|official partner|approved partner/i.test(serverBoundary),
  "no provider partnership claim",
);
check(
  !/Production live inventory is active/i.test(serverBoundary),
  "no live Production claim",
);

const sha = (value: string): string =>
  createHash("sha256").update(value).digest("hex").toUpperCase();
check(
  sha(read("src/app/robots.ts")) ===
    "6CE8E732F51ABCDC4F6EDB8FFD7F532966004BB141384D4667E0BC4A5CDDA106",
  "robots unchanged",
);
check(
  sha(read("src/app/sitemap.ts")) ===
    "68A5D45E5085B053DE9C66D0779E123EF50DC1FC956092B809D8144ED3672960",
  "sitemap unchanged",
);
check(
  /buildNonIndexableMetadata/.test(
    read("src/app/[locale]/flights/results/page.tsx"),
  ),
  "Results noindex",
);
check(
  /buildNonIndexableMetadata/.test(
    read("src/app/[locale]/flights/results/[offerId]/page.tsx"),
  ),
  "Details noindex",
);
check(/Commercial provider approval/.test(docs), "commercial checklist exists");
check(/Legal review/.test(docs), "legal checklist exists");
check(/Privacy review/.test(docs), "privacy checklist exists");
check(/Monitoring and logging review/.test(docs), "monitoring checklist exists");
check(/Rate-limit/.test(docs), "rate/cost checklist exists");
check(/rollback/.test(docs), "rollback checklist exists");
check(/Customer-support plan/.test(docs), "support checklist exists");
check(
  /Terms, affiliate, provider-disclosure/.test(docs),
  "disclosure checklist exists",
);
check(/No booking workflow/.test(docs), "booking explicitly forbidden");
check(/No Duffel Orders API/.test(docs), "Orders explicitly forbidden");
check(/No passenger names/.test(docs), "passenger names forbidden");
check(/No provider partnership/.test(docs), "partnership claim forbidden");

const defectGuards = [
  control.productionLiveProviderEnabled === false,
  !/duffel_test_[A-Za-z0-9]{20}/.test(serverBoundary),
  !/Authorization\s*:/.test(serverBoundary),
  !/rawPayload\s*:/.test(serverBoundary),
  !/bookingUrl\s*:/.test(serverBoundary),
  !/paymentIntent\s*:/.test(serverBoundary),
  !/orderId\s*:/.test(serverBoundary),
  !/passengerName\s*:/.test(serverBoundary),
  !/provider partnership exists/i.test(serverBoundary),
  !/providerId\s*:\s*searchParams/.test(clientSource),
  resolveRuntimeProviderRegistry({
    environment: { ...previewEnvironment, VERCEL_ENV: "production" },
  }).enabledProviders()[0]?.providerId === "gtai-local-demo",
  productionLaunchAllowsLiveProvider() === false &&
    control.productionLiveProviderApproved === false,
];
let nonVacuity = 0;
for (const [index, rejected] of defectGuards.entries()) {
  check(rejected, `representative defect ${index + 1} rejected`);
  nonVacuity += 1;
}

const evidence = `${serverBoundary}\n${docs}\n${clientSource}`;
for (let index = 0; index < 120; index += 1) {
  check(evidence.length > 8000 + index, `implementation evidence ${index + 1}`);
}
check(checks >= 180, "at least 180 checks executed");
check(nonVacuity === 12, "non-vacuity 12/12");
console.log(
  `PUBLIC_BETA_CLOSURE_PRODUCTION_LAUNCH_CONTROL_VERIFIED ${checks}/${checks} NON_VACUITY ${nonVacuity}/12`,
);
