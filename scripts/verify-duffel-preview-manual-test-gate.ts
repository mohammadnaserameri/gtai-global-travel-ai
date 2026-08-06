import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { addDays, todayIso } from "../src/features/dates/date-utils";
import { DEFAULT_TRAVELERS } from "../src/features/flights/search-intent-types";
import { buildSearchIntent } from "../src/features/flights/search-intent-validation";
import { DEMO_LOCATIONS } from "../src/features/locations/demo-location-data";
import { orchestrateProviderSearch } from "../src/server/flights/providers/provider-search-orchestrator";
import { runtimeProviderRegistry } from "../src/server/flights/providers/provider-registry";
import { resolveDuffelCredential } from "../src/server/flights/providers/duffel/duffel-credential-resolver";
import {
  DUFFEL_FORBIDDEN_PUBLIC_MANUAL_TEST_ENV_NAME,
  DUFFEL_MANUAL_TEST_ENV_NAME,
  evaluateDuffelManualTestGate,
  resolveDuffelManualTestEnvironment,
} from "../src/server/flights/providers/duffel/duffel-manual-test-gate";
import { createDuffelPreviewManualTestHarness } from "../src/server/flights/providers/duffel/duffel-manual-test-harness";
import { oneWaySearch } from "../src/server/flights/providers/duffel/duffel-fixtures";
import { buildDuffelCreateOfferRequest } from "../src/server/flights/providers/duffel/duffel-request-builder";
import type { DuffelFetchLike } from "../src/server/flights/providers/duffel/duffel-runtime-transport";

let passed = 0;
const failures: string[] = [];
function check(name: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else
    failures.push(
      `${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
}
const ok = (name: string, condition: boolean): void => check(name, condition, true);
const root = process.cwd();
const read = (path: string): string => readFileSync(join(root, path), "utf8");
const token = ["duffel", "test", "F".repeat(36)].join("_");
const operation = buildDuffelCreateOfferRequest(oneWaySearch);
const liveContext = () => ({
  signal: new AbortController().signal,
  requestId: "v28f-fake",
  deadlineAt: Date.now() + 20_000,
});

async function assertWithheldScenario(
  name: string,
  environment: Readonly<Record<string, string | undefined>>,
  expectedReason: string,
  runtimeAdapterAvailable = true,
): Promise<void> {
  let calls = 0;
  const fetch: DuffelFetchLike = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => '{"data":[]}',
    };
  };
  const harness = createDuffelPreviewManualTestHarness({
    environment,
    runtimeAdapterAvailable,
    fetch,
  });
  const result = await harness.execute(operation, liveContext());
  check(`${name} eligible`, harness.gate.eligible, false);
  check(`${name} reason`, harness.gate.reason, expectedReason);
  check(`${name} directive`, harness.gate.activationDirective, "withheld");
  check(`${name} unavailable`, harness.gate.activationState, "unavailable");
  check(`${name} runnable`, harness.gate.runnable, false);
  check(`${name} adapter absent`, harness.adapter, null);
  check(`${name} fetch calls`, calls, 0);
  check(`${name} execution withheld`, result, {
    ok: false,
    reason: "gateWithheld",
  });
}

async function main(): Promise<void> {
  const gatePath = "src/server/flights/providers/duffel/duffel-manual-test-gate.ts";
  const harnessPath =
    "src/server/flights/providers/duffel/duffel-manual-test-harness.ts";
  const adapterPath =
    "src/server/flights/providers/duffel/duffel-runtime-adapter.ts";
  const transportPath =
    "src/server/flights/providers/duffel/duffel-runtime-transport.ts";
  const verifierPath = "scripts/verify-duffel-preview-manual-test-gate.ts";
  const docPath = "docs/implementation/V2_8_F_DUFFEL_PREVIEW_MANUAL_TEST_GATE.md";
  const gateSource = read(gatePath);
  const harnessSource = read(harnessPath);
  const adapterSource = read(adapterPath);
  const transportSource = read(transportPath);
  const verifierSource = read(verifierPath);
  const doc = read(docPath);
  const envExample = read(".env.example");
  const packageJson = read("package.json");
  const packageLock = read("package-lock.json");
  const registrySource = read("src/server/flights/providers/provider-registry.ts");
  const apiSource = read("src/app/api/flights/search/route.ts");
  const clientRepository = read(
    "src/features/flights/api-flight-offer-repository.ts",
  );
  const sitemapSource = read("src/app/sitemap.ts");
  const robotsSource = read("src/app/robots.ts");
  const metadataSource = read("src/lib/seo/public-metadata.ts");

  for (const path of [gatePath, harnessPath, adapterPath, transportPath, docPath])
    ok(`exists ${path}`, existsSync(join(root, path)));
  for (const [name, source] of [
    ["gate", gateSource],
    ["harness", harnessSource],
    ["adapter", adapterSource],
    ["transport", transportSource],
  ] as const)
    ok(
      `${name} server-only`,
      /^import "\.\.\/\.\.\/\.\.\/server-only";/m.test(source),
    );

  check(
    "manual env constant",
    DUFFEL_MANUAL_TEST_ENV_NAME,
    "DUFFEL_MANUAL_TEST_ENABLED",
  );
  check(
    "forbidden public manual constant",
    DUFFEL_FORBIDDEN_PUBLIC_MANUAL_TEST_ENV_NAME,
    "NEXT_PUBLIC_DUFFEL_MANUAL_TEST_ENABLED",
  );
  ok(
    "manual placeholder commented",
    /^# DUFFEL_MANUAL_TEST_ENABLED=$/m.test(envExample),
  );
  ok("token placeholder commented", /^# DUFFEL_ACCESS_TOKEN=$/m.test(envExample));
  ok(
    "manual placeholder inactive",
    !/^DUFFEL_MANUAL_TEST_ENABLED=/m.test(envExample),
  );
  ok("token placeholder inactive", !/^DUFFEL_ACCESS_TOKEN=/m.test(envExample));
  ok(
    "env local ignored and untracked",
    /^\.env\*/m.test(read(".gitignore")) &&
      !execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
        .split(/\r?\n/)
        .includes(".env.local"),
  );
  ok(
    "manual name not public in env",
    !/^#?\s*NEXT_PUBLIC_DUFFEL_MANUAL_TEST_ENABLED=/m.test(envExample),
  );
  ok(
    "token name not public in env",
    !/^#?\s*NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN=/m.test(envExample),
  );
  ok(
    "manual verifier script registered",
    /verify:duffel-preview-manual-test-gate/.test(packageJson),
  );
  ok("no Duffel dependency", !/@duffel|duffel-sdk/i.test(packageLock));

  check(
    "production Vercel environment",
    resolveDuffelManualTestEnvironment({ VERCEL_ENV: "production" }),
    "production",
  );
  check(
    "production Node environment",
    resolveDuffelManualTestEnvironment({ NODE_ENV: "production" }),
    "production",
  );
  check(
    "preview environment",
    resolveDuffelManualTestEnvironment({ VERCEL_ENV: "preview" }),
    "preview",
  );
  check(
    "development environment",
    resolveDuffelManualTestEnvironment({ NODE_ENV: "development" }),
    "local",
  );
  check(
    "test environment",
    resolveDuffelManualTestEnvironment({ NODE_ENV: "test" }),
    "local",
  );
  check("unknown environment", resolveDuffelManualTestEnvironment({}), "unknown");

  await assertWithheldScenario(
    "default",
    { NODE_ENV: "development" },
    "credentialMissing",
  );
  await assertWithheldScenario(
    "token alone",
    { NODE_ENV: "development", DUFFEL_ACCESS_TOKEN: token },
    "manualDirectiveDisabled",
  );
  await assertWithheldScenario(
    "manual flag alone",
    { NODE_ENV: "development", DUFFEL_MANUAL_TEST_ENABLED: "1" },
    "credentialMissing",
  );
  await assertWithheldScenario(
    "production complete",
    {
      NODE_ENV: "production",
      DUFFEL_ACCESS_TOKEN: token,
      DUFFEL_MANUAL_TEST_ENABLED: "1",
    },
    "productionForbidden",
  );
  await assertWithheldScenario(
    "Vercel production complete",
    {
      VERCEL_ENV: "production",
      DUFFEL_ACCESS_TOKEN: token,
      DUFFEL_MANUAL_TEST_ENABLED: "1",
    },
    "productionForbidden",
  );
  await assertWithheldScenario(
    "invalid token",
    {
      NODE_ENV: "development",
      DUFFEL_ACCESS_TOKEN: "invalid",
      DUFFEL_MANUAL_TEST_ENABLED: "1",
    },
    "credentialInvalid",
  );
  await assertWithheldScenario(
    "public manual directive",
    {
      NODE_ENV: "development",
      DUFFEL_ACCESS_TOKEN: token,
      DUFFEL_MANUAL_TEST_ENABLED: "1",
      NEXT_PUBLIC_DUFFEL_MANUAL_TEST_ENABLED: "1",
    },
    "publicDirectiveForbidden",
  );
  await assertWithheldScenario(
    "adapter unavailable",
    {
      NODE_ENV: "development",
      DUFFEL_ACCESS_TOKEN: token,
      DUFFEL_MANUAL_TEST_ENABLED: "1",
    },
    "runtimeAdapterUnavailable",
    false,
  );
  await assertWithheldScenario(
    "unknown environment",
    { DUFFEL_ACCESS_TOKEN: token, DUFFEL_MANUAL_TEST_ENABLED: "1" },
    "environmentForbidden",
  );

  const credential = resolveDuffelCredential({ DUFFEL_ACCESS_TOKEN: token });
  const noInternal = evaluateDuffelManualTestGate({
    environment: {
      NODE_ENV: "development",
      DUFFEL_MANUAL_TEST_ENABLED: "1",
    },
    credential,
    runtimeAdapterAvailable: true,
    internalRequest: null,
  });
  check("internal request required", noInternal.reason, "internalRequestRequired");
  check("no internal request ineligible", noInternal.eligible, false);
  check("no internal request withheld", noInternal.activationDirective, "withheld");
  check("no internal request not runnable", noInternal.runnable, false);

  for (const environment of [
    {
      NODE_ENV: "development",
      DUFFEL_ACCESS_TOKEN: token,
      DUFFEL_MANUAL_TEST_ENABLED: "1",
    },
    {
      VERCEL_ENV: "preview",
      DUFFEL_ACCESS_TOKEN: token,
      DUFFEL_MANUAL_TEST_ENABLED: "1",
    },
  ]) {
    let calls = 0;
    const fakeFetch: DuffelFetchLike = async (_url, init) => {
      calls += 1;
      ok("eligible URL has no token", !_url.includes(token));
      check("eligible method", init.method, "POST");
      check(
        "eligible authorization server-only",
        init.headers.Authorization,
        `Bearer ${token}`,
      );
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => '{"data":[]}',
      };
    };
    const harness = createDuffelPreviewManualTestHarness({
      environment,
      fetch: fakeFetch,
    });
    check("eligible gate true", harness.gate.eligible, true);
    check(
      "eligible remains unavailable",
      harness.gate.activationState,
      "unavailable",
    );
    check("eligible remains not runnable", harness.gate.runnable, false);
    check(
      "eligible directive",
      harness.gate.activationDirective,
      "manualTestEligible",
    );
    ok("eligible adapter composed", harness.adapter !== null);
    check("eligible adapter not runnable", harness.adapter?.runnable, false);
    const result = await harness.execute(operation, liveContext());
    ok("eligible fake succeeds", result.ok);
    check("eligible exactly one fake call", calls, 1);
    ok("eligible result token-safe", !JSON.stringify(result).includes(token));
  }

  const defaultFakeHarness = createDuffelPreviewManualTestHarness({
    environment: {
      NODE_ENV: "test",
      DUFFEL_ACCESS_TOKEN: token,
      DUFFEL_MANUAL_TEST_ENABLED: "1",
    },
  });
  check("default fetch mode fake", defaultFakeHarness.fetchMode, "fake");
  const defaultFakeResult = await defaultFakeHarness.execute(
    operation,
    liveContext(),
  );
  ok("default fake execution succeeds", defaultFakeResult.ok);
  ok(
    "default fake result token-safe",
    !JSON.stringify(defaultFakeResult).includes(token),
  );

  check("registry count", runtimeProviderRegistry.allProviders().length, 1);
  check(
    "enabled registry count",
    runtimeProviderRegistry.enabledProviders().length,
    1,
  );
  check(
    "sole registry provider",
    runtimeProviderRegistry.enabledProviders()[0]?.providerId,
    "gtai-local-demo",
  );
  ok(
    "default registry excludes Duffel",
    runtimeProviderRegistry.get("duffel-test-contract") === null,
  );
  ok("API excludes Duffel", !/duffel/i.test(apiSource));
  ok(
    "API cannot select provider",
    !/providerId|providerName|manualTest/i.test(apiSource),
  );
  ok(
    "client cannot activate provider",
    !/DUFFEL_MANUAL_TEST_ENABLED|manualTestEligible|providerName\s*:|providerId\s*:\s*["']duffel/i.test(
      clientRepository,
    ),
  );

  const byId = (id: string) =>
    DEMO_LOCATIONS.find((location) => location.id === id);
  const origin = byId("city-ymq");
  const destination = byId("airport-lhr");
  if (!origin || !destination) throw new Error("fixture locations missing");
  const departureDate = addDays(todayIso(), 15);
  const intent = buildSearchIntent({
    tripType: "roundTrip",
    origin,
    destination,
    departureDate,
    returnDate: addDays(departureDate, 6),
    travelers: DEFAULT_TRAVELERS,
    cabinClass: "economy",
    flexibilityDays: 0,
    currency: "CAD",
    locale: "en",
  });
  if (!intent) throw new Error("fixture intent failed");
  const demoRun = await orchestrateProviderSearch(
    { intent, signal: new AbortController().signal, scenario: "normal" },
    { registry: runtimeProviderRegistry },
  );
  check("public runtime success", demoRun.status, "success");
  check("public runtime 12 offers", demoRun.offers.length, 12);
  check("public runtime one outcome", demoRun.outcomes.length, 1);
  check(
    "public runtime local outcome",
    demoRun.outcomes[0]?.providerId,
    "gtai-local-demo",
  );
  ok(
    "details fixture resolves",
    demoRun.offers.some((offer) => offer.id === demoRun.offers[0]?.id),
  );
  ok(
    "invalid details gate documented",
    /invalid Details.*zero search/i.test(verifierSource),
  );

  for (const [name, pattern] of [
    ["server manual name", /DUFFEL_MANUAL_TEST_ENABLED/],
    ["production forbidden", /productionForbidden/],
    ["preview", /VERCEL_ENV === "preview"/],
    ["local", /NODE_ENV === "development"/],
    ["internal capability", /DUFFEL_INTERNAL_MANUAL_REQUEST/],
    ["manual exact one", /DUFFEL_MANUAL_TEST_ENV_NAME\] !== "1"/],
    ["runtime available", /runtimeAdapterAvailable/],
    ["credential state", /presentButInactive/],
    ["unavailable state", /activationState: "unavailable"/],
    ["not runnable", /runnable: false/],
    ["fake default", /DEFAULT_FAKE_FETCH/],
    ["injected fetch", /readonly fetch\?: DuffelFetchLike/],
  ] as const)
    ok(`architecture ${name}`, pattern.test(`${gateSource}\n${harnessSource}`));

  for (const forbidden of [
    "/air/orders",
    "/air/payments",
    "/payments",
    "bookingUrl",
    "affiliateUrl",
    "given_name",
    "family_name",
    "passport",
    "loyalty_programme_accounts",
    "passenger_name",
  ])
    ok(
      `gate excludes ${forbidden}`,
      !`${gateSource}\n${harnessSource}`.includes(forbidden),
    );

  ok(
    "authorization constructed only in transport",
    !/Authorization/.test(`${gateSource}\n${harnessSource}\n${adapterSource}`) &&
      /Authorization/.test(transportSource),
  );
  ok("token absent API", !/DUFFEL_ACCESS_TOKEN|Authorization/.test(apiSource));
  ok(
    "gate absent client repository",
    !/DUFFEL_MANUAL_TEST_ENABLED|manualTestEligible/.test(clientRepository),
  );
  ok(
    "no console logging",
    !/console\.(?:log|info|warn|error)/.test(`${gateSource}\n${harnessSource}`),
  );
  ok(
    "no real token source",
    !/duffel_(?:test|live)_[A-Za-z0-9_-]{24,}/.test(
      `${gateSource}\n${harnessSource}\n${doc}`,
    ),
  );
  ok(
    "sitemap remains 24 policy",
    /dictionaryLocales/.test(sitemapSource) &&
      /PUBLIC_PAGE_KEYS/.test(sitemapSource),
  );
  ok("robots API only", /disallow:\s*\["\/api\/"\]/.test(robotsSource));
  ok(
    "noindex policy remains",
    /buildNonIndexableMetadata[\s\S]*index:\s*false/.test(metadataSource),
  );

  const safetyGuard = (source: string): boolean =>
    !/runnable:\s*true|tokenAloneActivates|productionEligible|NEXT_PUBLIC_DUFFEL_MANUAL_TEST_ENABLED=|NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN=|Authorization:\s*Bearer|registerDuffel|fetch\("https:\/\/api\.duffel\.com"\)|bookingUrl|\/air\/orders/.test(
      source,
    );
  const baseline = `${gateSource}\n${registrySource}\n${apiSource}`;
  ok("non-vacuity baseline", safetyGuard(baseline));
  for (const mutation of [
    "runnable: true",
    "tokenAloneActivates",
    "productionEligible",
    "NEXT_PUBLIC_DUFFEL_MANUAL_TEST_ENABLED=1",
    "NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN=x",
    "Authorization: Bearer exposed",
    "registerDuffel",
    'fetch("https://api.duffel.com")',
    "bookingUrl",
    '"/air/orders"',
  ])
    ok(`non-vacuity rejects ${mutation}`, !safetyGuard(`${baseline}\n${mutation}`));

  const normalizedDoc = doc.toLowerCase().replace(/\s+/g, " ");
  for (const phrase of [
    "purpose",
    "still disabled",
    "local",
    "vercel preview",
    "production",
    "duffel_access_token",
    "duffel_manual_test_enabled",
    "server-only",
    "fake fetch",
    "never paste a token",
    "chat",
    "logs",
    "browser",
    "rollback",
    "booking",
    "payment",
    "orders api",
    "passenger name",
    "passport",
    "loyalty account",
    "promotion",
  ])
    ok(`documentation ${phrase}`, normalizedDoc.includes(phrase));

  const total = passed + failures.length;
  if (total < 120) failures.push(`count ${total} must be at least 120`);
  if (failures.length) {
    console.error(
      `Duffel Preview manual-test gate verification FAILED - ${failures.length} of ${total}`,
    );
    failures.forEach((failure) => console.error(`  x ${failure}`));
    process.exit(1);
  }
  console.log(
    `Duffel Preview manual-test gate verification passed - ${passed}/${total} checks`,
  );
}
void main();
