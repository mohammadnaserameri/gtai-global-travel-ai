import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { validListOffersResponse } from "../src/server/flights/providers/duffel/duffel-fixtures";
import type { DuffelFetchLike } from "../src/server/flights/providers/duffel/duffel-runtime-transport";
import { runtimeProviderRegistry } from "../src/server/flights/providers/provider-registry";
import {
  GTAI_DUFFEL_LOCAL_REAL_TEST_ENV_NAME,
  LOCAL_REAL_TEST_SKIP_MARKER,
  runDuffelLocalRealTest,
} from "./run-duffel-local-real-test";

const root = process.cwd();
let passed = 0;
const failures: string[] = [];

function ok(name: string, condition: boolean): void {
  if (condition) passed += 1;
  else failures.push(name);
}

function check<T>(name: string, actual: T, expected: T): void {
  ok(name, JSON.stringify(actual) === JSON.stringify(expected));
}

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

async function skippedScenario(
  name: string,
  environment: Readonly<Record<string, string | undefined>>,
): Promise<void> {
  let calls = 0;
  const lines: string[] = [];
  const fetch: DuffelFetchLike = async () => {
    calls += 1;
    throw new Error("network must be withheld");
  };
  const result = await runDuffelLocalRealTest({
    environment,
    fetch,
    write: (line) => lines.push(line),
  });
  check(`${name} status`, result.status, "SKIPPED");
  check(`${name} fetch calls`, calls, 0);
  ok(`${name} marker`, lines[0]?.startsWith(LOCAL_REAL_TEST_SKIP_MARKER) === true);
  ok(
    `${name} local instruction`,
    lines.some((line) => line.includes(".env.local locally only")),
  );
  ok(`${name} no authorization`, !lines.join("\n").includes("Authorization"));
}

async function main(): Promise<void> {
  const harnessPath = "scripts/run-duffel-local-real-test.ts";
  const verifierPath = "scripts/verify-duffel-local-real-test-harness.ts";
  const docPath =
    "docs/implementation/V2_8_G_DUFFEL_LOCAL_MANUAL_REAL_TEST_HARNESS.md";
  const harness = read(harnessPath);
  const verifier = read(verifierPath);
  const doc = read(docPath);
  const packageJson = read("package.json");
  const packageLock = read("package-lock.json");
  const gitignore = read(".gitignore");
  const registry = read("src/server/flights/providers/provider-registry.ts");
  const api = read("src/app/api/flights/search/route.ts");
  const client = read("src/features/flights/api-flight-offer-repository.ts");
  const robots = read("src/app/robots.ts");
  const sitemap = read("src/app/sitemap.ts");
  const metadata = read("src/lib/seo/public-metadata.ts");
  const tracked = execFileSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf8",
  });

  for (const path of [harnessPath, verifierPath, docPath])
    ok(`exists ${path}`, existsSync(join(root, path)));
  ok(
    "harness server-only",
    /^import "\.\.\/src\/server\/server-only";/m.test(harness),
  );
  ok("npm test script", /"test:duffel-local-real"/.test(packageJson));
  ok(
    "npm verifier script",
    /"verify:duffel-local-real-test-harness"/.test(packageJson),
  );
  ok("no dependency change", !/@duffel|duffel-sdk/i.test(packageLock));
  ok("env local ignored", /^\.env\*/m.test(gitignore));
  ok("env local not tracked", !tracked.split(/\r?\n/).includes(".env.local"));
  ok("env local absent", !existsSync(join(root, ".env.local")));
  check(
    "local flag name",
    GTAI_DUFFEL_LOCAL_REAL_TEST_ENV_NAME,
    "GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED",
  );

  const token = `duffel_${"test"}_${"A".repeat(32)}`;
  await skippedScenario("default", {});
  await skippedScenario("development default", { NODE_ENV: "development" });
  await skippedScenario("missing token", {
    DUFFEL_MANUAL_TEST_ENABLED: "true",
    GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED: "true",
  });
  await skippedScenario("token alone", { DUFFEL_ACCESS_TOKEN: token });
  await skippedScenario("manual alone", { DUFFEL_MANUAL_TEST_ENABLED: "true" });
  await skippedScenario("local alone", {
    GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED: "true",
  });
  await skippedScenario("token manual only", {
    DUFFEL_ACCESS_TOKEN: token,
    DUFFEL_MANUAL_TEST_ENABLED: "true",
  });
  await skippedScenario("token local only", {
    DUFFEL_ACCESS_TOKEN: token,
    GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED: "true",
  });
  await skippedScenario("flags without token", {
    DUFFEL_MANUAL_TEST_ENABLED: "true",
    GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED: "true",
  });
  await skippedScenario("manual wrong case", {
    DUFFEL_ACCESS_TOKEN: token,
    DUFFEL_MANUAL_TEST_ENABLED: "TRUE",
    GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED: "true",
  });
  await skippedScenario("local wrong case", {
    DUFFEL_ACCESS_TOKEN: token,
    DUFFEL_MANUAL_TEST_ENABLED: "true",
    GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED: "1",
  });
  await skippedScenario("invalid token", {
    DUFFEL_ACCESS_TOKEN: "invalid",
    DUFFEL_MANUAL_TEST_ENABLED: "true",
    GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED: "true",
  });
  await skippedScenario("node production", {
    NODE_ENV: "production",
    DUFFEL_ACCESS_TOKEN: token,
    DUFFEL_MANUAL_TEST_ENABLED: "true",
    GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED: "true",
  });
  await skippedScenario("vercel production", {
    VERCEL_ENV: "production",
    DUFFEL_ACCESS_TOKEN: token,
    DUFFEL_MANUAL_TEST_ENABLED: "true",
    GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED: "true",
  });
  await skippedScenario("vercel preview", {
    VERCEL_ENV: "preview",
    DUFFEL_ACCESS_TOKEN: token,
    DUFFEL_MANUAL_TEST_ENABLED: "true",
    GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED: "true",
  });
  await skippedScenario("vercel development", {
    VERCEL_ENV: "development",
    DUFFEL_ACCESS_TOKEN: token,
    DUFFEL_MANUAL_TEST_ENABLED: "true",
    GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED: "true",
  });
  await skippedScenario("vercel marker", {
    VERCEL: "1",
    DUFFEL_ACCESS_TOKEN: token,
    DUFFEL_MANUAL_TEST_ENABLED: "true",
    GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED: "true",
  });
  for (const publicName of [
    "NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN",
    "NEXT_PUBLIC_DUFFEL_MANUAL_TEST_ENABLED",
    "NEXT_PUBLIC_DUFFEL_LOCAL_REAL_TEST_ENABLED",
  ]) {
    await skippedScenario(`public name ${publicName}`, {
      DUFFEL_ACCESS_TOKEN: token,
      DUFFEL_MANUAL_TEST_ENABLED: "true",
      GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED: "true",
      [publicName]: "forbidden",
    });
  }

  let calls = 0;
  const operations: Array<{
    readonly url: string;
    readonly method: string;
    readonly body?: string;
  }> = [];
  const lines: string[] = [];
  const fetch: DuffelFetchLike = async (url, init) => {
    calls += 1;
    operations.push({ url, method: init.method, body: init.body });
    ok(`real seam ${calls} token outside URL`, !url.includes(token));
    check(
      `real seam ${calls} authorization`,
      init.headers.Authorization,
      `Bearer ${token}`,
    );
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () =>
        calls === 1
          ? JSON.stringify({ data: { id: "orq_local_contract_1" } })
          : JSON.stringify(validListOffersResponse),
    };
  };
  const realSeam = await runDuffelLocalRealTest({
    environment: {
      NODE_ENV: "development",
      DUFFEL_ACCESS_TOKEN: token,
      DUFFEL_MANUAL_TEST_ENABLED: "true",
      GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED: "true",
    },
    fetch,
    now: () => new Date("2026-08-06T12:00:00.000Z"),
    write: (line) => lines.push(line),
  });
  check("all three real seam status", realSeam.status, "REAL_TEST_PASSED");
  check("exactly two controlled calls", calls, 2);
  check("create method", operations[0]?.method, "POST");
  ok(
    "create endpoint",
    operations[0]?.url.includes("/air/offer_requests") === true,
  );
  ok(
    "create return offers false",
    operations[0]?.url.includes("return_offers=false") === true,
  );
  ok(
    "create supplier timeout",
    operations[0]?.url.includes("supplier_timeout=10000") === true,
  );
  ok("create one way", operations[0]?.body?.includes('"origin":"YUL"') === true);
  ok(
    "create destination",
    operations[0]?.body?.includes('"destination":"CDG"') === true,
  );
  ok(
    "create future date",
    operations[0]?.body?.includes('"departure_date":"2026-11-14"') === true,
  );
  ok(
    "create one adult",
    operations[0]?.body?.includes('"passengers":[{"type":"adult"}]') === true,
  );
  ok(
    "create economy",
    operations[0]?.body?.includes('"cabin_class":"economy"') === true,
  );
  ok(
    "create max connections one",
    operations[0]?.body?.includes('"max_connections":1') === true,
  );
  check("list method", operations[1]?.method, "GET");
  ok("list endpoint", operations[1]?.url.includes("/air/offers") === true);
  ok(
    "list request id",
    operations[1]?.url.includes("offer_request_id=orq_local_contract_1") === true,
  );
  ok(
    "list max connections",
    operations[1]?.url.includes("max_connections=1") === true,
  );
  ok(
    "safe output marker",
    lines.some((line) => line.startsWith("REAL_TEST_PASSED ")),
  );
  ok("token absent output", !lines.join("\n").includes(token));
  ok("bearer absent output", !/Bearer/i.test(lines.join("\n")));
  ok("offer request id absent output", !/orq_/i.test(lines.join("\n")));
  ok("raw offer id absent output", !/off_/i.test(lines.join("\n")));
  ok("raw slices absent output", !/slices|segments/i.test(lines.join("\n")));
  if (realSeam.status === "REAL_TEST_PASSED") {
    check("summary provider", realSeam.summary.provider, "duffel-test-contract");
    check("summary offer count", realSeam.summary.offerCount, 1);
    check("summary route", realSeam.summary.route, "YUL-CDG");
    check("summary rejection count", realSeam.summary.rejectionCount, 0);
  }

  check("registry total", runtimeProviderRegistry.allProviders().length, 1);
  check("registry enabled", runtimeProviderRegistry.enabledProviders().length, 1);
  check(
    "registry provider",
    runtimeProviderRegistry.enabledProviders()[0]?.providerId,
    "gtai-local-demo",
  );
  ok("registry excludes harness", !/local-real-test|duffel/i.test(registry));
  ok(
    "API excludes harness",
    !/GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED|runDuffelLocalRealTest|duffel/i.test(api),
  );
  ok(
    "client excludes harness",
    !/GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED|DUFFEL_ACCESS_TOKEN|duffel/i.test(client),
  );
  ok("robots unchanged", /disallow:\s*\["\/api\/"\]/.test(robots));
  ok(
    "sitemap policy unchanged",
    /dictionaryLocales/.test(sitemap) && /PUBLIC_PAGE_KEYS/.test(sitemap),
  );
  ok(
    "noindex unchanged",
    /buildNonIndexableMetadata[\s\S]*index:\s*false/.test(metadata),
  );

  for (const pattern of [
    /NODE_ENV === "production"/,
    /VERCEL_ENV === "production"/,
    /VERCEL_ENV !== undefined/,
    /DUFFEL_MANUAL_TEST_ENABLED !== "true"/,
    /GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED/,
    /NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN/,
    /NEXT_PUBLIC_DUFFEL_MANUAL_TEST_ENABLED/,
    /NEXT_PUBLIC_DUFFEL_LOCAL_REAL_TEST_ENABLED/,
    /resolveDuffelCredential/,
    /buildDuffelCreateOfferRequest/,
    /buildDuffelListOffersRequest/,
    /mapDuffelListOffers/,
    /maximumAttempts:\s*1/,
    /originCode:\s*"YUL"/,
    /destinationCode:\s*"CDG"/,
    /adults:\s*1/,
    /cabinClass:\s*"economy"/,
    /directOnly:\s*false/,
    /maximumOffers:\s*50/,
    /partialCount/,
    /rejectionCount/,
  ])
    ok(`architecture ${pattern.source}`, pattern.test(harness));

  for (const forbidden of [
    "/air/orders",
    "/payments",
    "bookingUrl",
    "affiliateUrl",
    "given_name",
    "family_name",
    "passport_number",
    "loyalty_programme_accounts",
    "writeFile",
    "appendFile",
  ])
    ok(`harness excludes ${forbidden}`, !harness.includes(forbidden));

  const sourceWithoutVerifier = `${harness}\n${doc}`;
  ok(
    "no literal real token",
    !/duffel_(?:test|live)_[A-Za-z0-9_-]{24,}/.test(sourceWithoutVerifier),
  );
  ok("no console logging", !/console\.(?:log|info|warn|error)/.test(harness));
  ok(
    "no raw body output",
    !/JSON\.stringify\((?:createResult|listResult|.*\.body)/.test(harness),
  );
  ok("verifier itself has non-vacuity", /non-vacuity/.test(verifier));

  const safetyGuard = (source: string): boolean =>
    !/NODE_ENV_ALLOW_PRODUCTION|PRINT_TOKEN|PRINT_AUTHORIZATION|bookingUrl|\/air\/orders|registerDuffel|NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN=|DEFAULT_NETWORK_CALL|RAW_PAYLOAD_OUTPUT|CLIENT_ACTIVATION/.test(
      source,
    );
  ok("non-vacuity baseline", safetyGuard(harness));
  for (const defect of [
    "NODE_ENV_ALLOW_PRODUCTION",
    "PRINT_TOKEN",
    "PRINT_AUTHORIZATION",
    "bookingUrl",
    "/air/orders",
    "registerDuffel",
    "CLIENT_ACTIVATION",
    "RAW_PAYLOAD_OUTPUT",
    "NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN=x",
    "DEFAULT_NETWORK_CALL",
  ])
    ok(`non-vacuity rejects ${defect}`, !safetyGuard(`${harness}\n${defect}`));

  const normalizedDoc = doc.toLowerCase().replace(/\s+/g, " ");
  for (const phrase of [
    "purpose",
    ".env.local",
    "duffel_access_token=",
    "duffel_manual_test_enabled=true",
    "gtai_duffel_local_real_test_enabled=true",
    "never paste a token",
    "never screenshot a token",
    "npm.cmd run test:duffel-local-real",
    "skipped_local_real_test",
    "zero network calls",
    "redacted credential state",
    "safe summary",
    "rollback",
    "production",
    "preview",
    "booking",
    "payment",
    "orders api",
    "next step",
  ])
    ok(`documentation ${phrase}`, normalizedDoc.includes(phrase));

  const total = passed + failures.length;
  if (total < 140) failures.push(`count ${total} must be at least 140`);
  if (failures.length > 0) {
    console.error(
      `Duffel local real-test harness verification FAILED - ${failures.length} of ${total}`,
    );
    failures.forEach((failure) => console.error(`  x ${failure}`));
    process.exit(1);
  }
  console.log(
    `Duffel local real-test harness verification passed - ${passed}/${total} checks (non-vacuity 10/10)`,
  );
}

void main();
