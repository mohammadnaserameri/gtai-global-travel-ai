/** Deterministic verification for GTAI V2.8-E's disabled runtime adapter. */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { runtimeProviderRegistry } from "../src/server/flights/providers/provider-registry";
import { composeDisabledDuffelRuntimeAdapter } from "../src/server/flights/providers/duffel/duffel-runtime-adapter";
import {
  createDuffelRuntimeTransport,
  type DuffelFetchLike,
  type DuffelFetchResponse,
} from "../src/server/flights/providers/duffel/duffel-runtime-transport";
import { resolveDuffelCredential } from "../src/server/flights/providers/duffel/duffel-credential-resolver";
import {
  directOnlySearch,
  nonDirectSearch,
  oneWaySearch,
  roundTripSearch,
  validListOffersResponse,
} from "../src/server/flights/providers/duffel/duffel-fixtures";
import {
  buildDuffelCreateOfferRequest,
  buildDuffelListOffersRequest,
} from "../src/server/flights/providers/duffel/duffel-request-builder";
import { mapDuffelListOffers } from "../src/server/flights/providers/duffel/duffel-response-mapper";

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
function response(
  status: number,
  body: string,
  retryAfter?: string,
): DuffelFetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) =>
        name.toLowerCase() === "retry-after" ? (retryAfter ?? null) : null,
    },
    text: async () => body,
  };
}

async function main(): Promise<void> {
  const transportPath =
    "src/server/flights/providers/duffel/duffel-runtime-transport.ts";
  const adapterPath =
    "src/server/flights/providers/duffel/duffel-runtime-adapter.ts";
  const transportSource = read(transportPath);
  const adapterSource = read(adapterPath);
  const registrySource = read("src/server/flights/providers/provider-registry.ts");
  const doc = read(
    "docs/implementation/V2_8_E_DUFFEL_TEST_RUNTIME_ADAPTER_DISABLED.md",
  );
  ok("transport exists", existsSync(join(root, transportPath)));
  ok("adapter exists", existsSync(join(root, adapterPath)));
  ok(
    "transport server-only",
    /^import "\.\.\/\.\.\/\.\.\/server-only";/m.test(transportSource),
  );
  ok(
    "adapter server-only",
    /^import "\.\.\/\.\.\/\.\.\/server-only";/m.test(adapterSource),
  );
  ok("injected fetch", /readonly fetch: DuffelFetchLike/.test(transportSource));
  ok("no SDK", !/axios|@duffel|node-fetch|undici/.test(transportSource));
  check("runtime count", runtimeProviderRegistry.allProviders().length, 1);
  check(
    "sole provider",
    runtimeProviderRegistry.enabledProviders()[0]?.providerId,
    "gtai-local-demo",
  );
  ok(
    "default registry excludes Duffel",
    runtimeProviderRegistry.get("duffel-test-contract") === null,
  );

  const token = ["duffel", "test", "R".repeat(36)].join("_");
  const resolution = resolveDuffelCredential({ DUFFEL_ACCESS_TOKEN: token });
  if (resolution.state !== "presentButInactive") throw new Error("fixture failed");
  const calls: Array<{ url: string; init: Parameters<DuffelFetchLike>[1] }> = [];
  const fakeFetch: DuffelFetchLike = async (url, init) => {
    calls.push({ url, init });
    return response(200, '{"data":[]}');
  };
  let now = 1_000;
  const transport = createDuffelRuntimeTransport({
    credential: resolution.credential,
    fetch: fakeFetch,
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  });
  const adapter = composeDisabledDuffelRuntimeAdapter(transport, resolution);
  check("adapter unavailable", adapter.activationState, "unavailable");
  check("directive withheld", adapter.activationDirective, "withheld");
  check("adapter not runnable", adapter.runnable, false);
  const list = buildDuffelListOffersRequest({
    offerRequestId: "orq_contract_1",
    limit: 25,
  });
  const controller = new AbortController();
  const create = buildDuffelCreateOfferRequest(oneWaySearch);
  const createResult = await transport.execute(create, {
    signal: controller.signal,
    requestId: "create",
    deadlineAt: 21_000,
  });
  const result = await transport.execute(list, {
    signal: controller.signal,
    requestId: "list",
    deadlineAt: 21_000,
  });
  ok("create fake call succeeds", createResult.ok);
  ok("list fake call succeeds", result.ok);
  check("two fake calls", calls.length, 2);
  check("method POST", calls[0]?.init.method, "POST");
  check("method GET", calls[1]?.init.method, "GET");
  ok(
    "allowlisted origin",
    new URL(calls[0]?.url ?? "").origin === "https://api.duffel.com",
  );
  ok("create endpoint", calls[0]?.url.includes("/air/offer_requests") === true);
  ok("list endpoint", calls[1]?.url.includes("/air/offers") === true);
  check("version header", calls[0]?.init.headers["Duffel-Version"], "v2");
  check("accept header", calls[0]?.init.headers.Accept, "application/json");
  check("content type", calls[0]?.init.headers["Content-Type"], "application/json");
  check(
    "internal authorization",
    calls[0]?.init.headers.Authorization,
    `Bearer ${token}`,
  );
  ok("token absent URL", !calls[0]?.url.includes(token));
  ok("token absent result", !JSON.stringify(result).includes(token));
  ok("undefined view absent", !JSON.stringify(calls[0]?.init).includes("view"));
  ok(
    "authorization absent result",
    !JSON.stringify(result).includes("Authorization"),
  );

  let abortedCalls = 0;
  const aborted = new AbortController();
  aborted.abort();
  const inert = createDuffelRuntimeTransport({
    credential: resolution.credential,
    fetch: async () => {
      abortedCalls += 1;
      return response(200, "{}");
    },
    now: () => 1_000,
  });
  const abortedResult = await inert.execute(list, {
    signal: aborted.signal,
    requestId: "aborted",
    deadlineAt: 20_000,
  });
  check("aborted zero calls", abortedCalls, 0);
  check(
    "aborted failure",
    abortedResult.ok ? null : abortedResult.failure.category,
    "aborted",
  );

  for (const [status, category] of [
    [400, "invalidRequest"],
    [401, "unauthorized"],
    [403, "forbidden"],
  ] as const) {
    let count = 0;
    const failed = createDuffelRuntimeTransport({
      credential: resolution.credential,
      fetch: async () => {
        count += 1;
        return response(status, "{}");
      },
      now: () => 1_000,
    });
    const outcome = await failed.execute(list, {
      signal: controller.signal,
      requestId: `${status}`,
      deadlineAt: 20_000,
    });
    check(
      `${status} category`,
      outcome.ok ? null : outcome.failure.category,
      category,
    );
    check(`${status} no retry`, count, 1);
  }

  let retryCount = 0;
  const retrying = createDuffelRuntimeTransport({
    credential: resolution.credential,
    fetch: async () => {
      retryCount += 1;
      return retryCount < 3
        ? response(503, "{}", "0")
        : response(200, '{"data":[]}');
    },
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  });
  const retried = await retrying.execute(list, {
    signal: controller.signal,
    requestId: "retry",
    deadlineAt: 30_000,
  });
  ok("retry recovers", retried.ok);
  check("bounded retries", retryCount, 3);
  const malformedTransport = createDuffelRuntimeTransport({
    credential: resolution.credential,
    fetch: async () => response(200, "bad-json"),
    now: () => 1_000,
  });
  const malformed = await malformedTransport.execute(list, {
    signal: controller.signal,
    requestId: "bad",
    deadlineAt: 20_000,
  });
  check(
    "malformed rejected",
    malformed.ok ? null : malformed.failure.category,
    "malformedResponse",
  );
  const largeTransport = createDuffelRuntimeTransport({
    credential: resolution.credential,
    fetch: async () => response(200, "x".repeat(32)),
    maximumResponseBytes: 16,
    now: () => 1_000,
  });
  const large = await largeTransport.execute(list, {
    signal: controller.signal,
    requestId: "large",
    deadlineAt: 20_000,
  });
  check(
    "large rejected",
    large.ok ? null : large.failure.category,
    "malformedResponse",
  );

  ok("no Orders", !/\/air\/orders/.test(transportSource));
  ok("no payments", !/\/air\/payments|\/payments/.test(transportSource));
  ok(
    "no identity fields",
    !/given_name|family_name|passport|loyalty/i.test(transportSource),
  );
  ok(
    "no console logging",
    !/console\.(?:log|info|warn|error)/.test(transportSource),
  );
  ok(
    "no token literal",
    !/duffel_(?:test|live)_[A-Za-z0-9_-]{24,}/.test(
      `${transportSource}\n${adapterSource}\n${doc}`,
    ),
  );
  ok(
    "documented disabled",
    /disabled by default|directive remains\s+`withheld`/i.test(doc),
  );
  ok("Preview documented", /Preview/.test(doc));
  ok(
    "commerce excluded",
    /No production activation, booking, payment, Orders API/.test(doc),
  );

  const credentialSource = read(
    "src/server/flights/providers/duffel/duffel-credential-resolver.ts",
  );
  const activationSource = read(
    "src/server/flights/providers/duffel/duffel-activation-guard.ts",
  );
  const requestSource = read(
    "src/server/flights/providers/duffel/duffel-request-builder.ts",
  );
  const contractSource = read(
    "src/server/flights/providers/duffel/duffel-contract.ts",
  );
  const mapperSource = read(
    "src/server/flights/providers/duffel/duffel-response-mapper.ts",
  );
  const failureSource = read(
    "src/server/flights/providers/duffel/duffel-failures.ts",
  );
  const apiSource = read("src/app/api/flights/search/route.ts");
  const envExample = read(".env.example");
  const packageLock = read("package-lock.json");
  const sitemapSource = read("src/app/sitemap.ts");
  const robotsSource = read("src/app/robots.ts");
  const publicMetadata = read("src/lib/seo/public-metadata.ts");

  const missingAdapter = composeDisabledDuffelRuntimeAdapter(
    transport,
    resolveDuffelCredential({}),
  );
  check("missing token unavailable", missingAdapter.activationState, "unavailable");
  check("missing token not runnable", missingAdapter.runnable, false);
  check("valid token unavailable", adapter.activationState, "unavailable");
  check("valid token withheld", adapter.activationDirective, "withheld");
  ok("production cannot activate", !/NODE_ENV|VERCEL_ENV/.test(activationSource));
  ok("client cannot select provider", !/providerId|providerName/.test(apiSource));
  ok(
    "module registers only through activation gate",
    /evaluateDuffelPreviewActivation/.test(registrySource),
  );
  ok("adapter does not register", !/duffel-runtime-adapter/.test(registrySource));

  for (const [name, pattern] of [
    ["fixed origin", /https:\/\/api\.duffel\.com/],
    ["create path", /\/air\/offer_requests/],
    ["list path", /\/air\/offers/],
    ["body bound", /DUFFEL_RUNTIME_MAX_RESPONSE_BYTES/],
    ["abort", /AbortSignal/],
    ["timeout", /requestTimeoutMs/],
    ["deadline", /deadlineAt/],
    ["retry", /decideRetryForCategory/],
    ["retry after", /parseRetryAfterMs/],
    ["authorization", /Authorization/],
    ["credential accessor", /revealDuffelCredentialForFutureTransport/],
    ["typed result", /DuffelRuntimeTransportResult/],
  ] as const)
    ok(
      `architecture ${name}`,
      pattern.test(`${transportSource}\n${requestSource}\n${contractSource}`),
    );

  for (const forbidden of [
    "/air/orders",
    "/air/payments",
    "/payments",
    "price_action",
    "update_passenger",
    "given_name",
    "family_name",
    "passport",
    "loyalty_programme_accounts",
    "private_fares",
    "airline_credits",
  ])
    ok(`forbidden ${forbidden}`, !transportSource.includes(forbidden));

  ok("env placeholder commented", /^# DUFFEL_ACCESS_TOKEN=$/m.test(envExample));
  ok("env placeholder inactive", !/^DUFFEL_ACCESS_TOKEN=/m.test(envExample));
  ok(
    "env local ignored and untracked",
    /^\.env\*/m.test(read(".gitignore")) &&
      !execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
        .split(/\r?\n/)
        .includes(".env.local"),
  );
  ok("no SDK dependency", !/@duffel|duffel-sdk/i.test(packageLock));
  ok("authorization absent API", !/Authorization/.test(apiSource));
  ok(
    "token absent mapper",
    !/DUFFEL_ACCESS_TOKEN|Authorization/.test(mapperSource),
  );
  ok(
    "token absent failure",
    !/DUFFEL_ACCESS_TOKEN|Authorization/.test(failureSource),
  );
  ok(
    "token absent query",
    !/searchParams\.set\([^)]*(?:token|authorization)/i.test(transportSource),
  );
  ok(
    "authorization not logged",
    !/console\.[a-z]+\([^)]*Authorization/i.test(transportSource),
  );
  ok(
    "authorization not in result",
    !/Authorization/.test(
      transportSource
        .split("export type DuffelRuntimeTransportResult")[1]
        ?.split("export interface DuffelRuntimeTransport")[0] ?? "",
    ),
  );
  ok("credential capsule redacts JSON", /toJSON/.test(credentialSource));

  const directRequest = buildDuffelCreateOfferRequest(directOnlySearch);
  const nonDirectRequest = buildDuffelCreateOfferRequest(nonDirectSearch);
  const roundRequest = buildDuffelCreateOfferRequest(roundTripSearch);
  check("direct max connections", directRequest.body.data.max_connections, 0);
  check(
    "non-direct max connections",
    nonDirectRequest.body.data.max_connections,
    1,
  );
  check("round-trip slices", roundRequest.body.data.slices.length, 2);
  check("return offers false", create.query.return_offers, "false");
  check("supplier timeout", create.query.supplier_timeout, "10000");
  ok(
    "passengers type-only",
    create.body.data.passengers.every((p) => Object.keys(p).join() === "type"),
  );
  ok(
    "request builder used by adapter",
    /buildDuffelCreateOfferRequest/.test(adapterSource),
  );
  ok(
    "list builder used by adapter",
    /buildDuffelListOffersRequest/.test(adapterSource),
  );
  ok("view undefined absent", !JSON.stringify(create).includes("view"));

  const mapped = mapDuffelListOffers({
    response: validListOffersResponse,
    tripShape: "oneWay",
    requestId: "mapped",
    occurredAt: "2026-08-06T00:00:00.000Z",
  });
  ok("fake one-way maps", mapped.ok && mapped.offers.length === 1);
  ok(
    "raw data absent mapped offer",
    mapped.ok && !("data" in (mapped.offers[0] ?? {})),
  );
  const malformedSchema = mapDuffelListOffers({
    response: { data: "wrong" },
    tripShape: "oneWay",
    requestId: "schema",
    occurredAt: "2026-08-06T00:00:00.000Z",
  });
  check(
    "malformed schema",
    malformedSchema.ok ? null : malformedSchema.failure.category,
    "malformedResponse",
  );

  for (const [status, category] of [
    [429, "rateLimited"],
    [500, "upstreamUnavailable"],
  ] as const) {
    let statusCalls = 0;
    const statusTransport = createDuffelRuntimeTransport({
      credential: resolution.credential,
      fetch: async () => {
        statusCalls += 1;
        return response(status, "{}");
      },
      now: () => 1_000,
      retryPolicy: {
        maximumAttempts: 1,
        initialBackoffMs: 0,
        backoffMultiplier: 1,
        maximumBackoffMs: 0,
        jitterRatio: 0,
        retryableFailures: ["timeout"],
      },
    });
    const outcome = await statusTransport.execute(list, {
      signal: controller.signal,
      requestId: `status-${status}`,
      deadlineAt: 20_000,
    });
    check(`${status} maps`, outcome.ok ? null : outcome.failure.category, category);
    check(`${status} bounded`, statusCalls, 1);
  }
  const networkTransport = createDuffelRuntimeTransport({
    credential: resolution.credential,
    fetch: async () => {
      throw new TypeError("fixture");
    },
    now: () => 1_000,
    retryPolicy: {
      maximumAttempts: 1,
      initialBackoffMs: 0,
      backoffMultiplier: 1,
      maximumBackoffMs: 0,
      jitterRatio: 0,
      retryableFailures: ["timeout"],
    },
  });
  const network = await networkTransport.execute(list, {
    signal: controller.signal,
    requestId: "network",
    deadlineAt: 20_000,
  });
  check(
    "network exception",
    network.ok ? null : network.failure.category,
    "networkFailure",
  );

  ok("API excludes Duffel", !/duffel/i.test(apiSource));
  ok(
    "sitemap policy unchanged",
    /dictionaryLocales/.test(sitemapSource) &&
      /PUBLIC_PAGE_KEYS/.test(sitemapSource),
  );
  ok("robots API only", /disallow:\s*\["\/api\/"\]/.test(robotsSource));
  ok(
    "noindex helper",
    /buildNonIndexableMetadata[\s\S]*index:\s*false/.test(publicMetadata),
  );
  ok(
    "analytics absent",
    !/google-analytics|googletagmanager|plausible|posthog|mixpanel/i.test(
      apiSource,
    ),
  );
  ok("affiliate absent", !/affiliateUrl|bookingUrl|redirectUrl/.test(apiSource));

  const safetyGuard = (source: string): boolean =>
    !/runnable:\s*true|duffel[^\n]{0,80}enabled:\s*true|NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN|fetch\s*\(|\/air\/orders|\/air\/payments|bookingUrl|given_name|Authorization:\s*Bearer|duffel-runtime-adapter/.test(
      source,
    );
  const baseline = `${activationSource}\n${registrySource}`;
  ok("non-vacuity baseline", safetyGuard(baseline));
  for (const mutation of [
    "runnable: true",
    "duffel enabled: true",
    "NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN=x",
    'fetch("https://api.duffel.com")',
    '"/air/orders"',
    '"/air/payments"',
    "bookingUrl: x",
    "given_name: x",
    "Authorization: Bearer leaked",
    'import "duffel-runtime-adapter"',
  ])
    ok(`non-vacuity rejects ${mutation}`, !safetyGuard(`${baseline}\n${mutation}`));
  const boundGuard = (source: string): boolean =>
    /maximumResponseBytes/.test(source);
  ok("bound baseline", boundGuard(transportSource));
  ok(
    "missing bound rejected",
    !boundGuard(transportSource.replaceAll("maximumResponseBytes", "removed")),
  );

  const normalizedDoc = doc.toLowerCase().replace(/\s+/g, " ");
  for (const phrase of [
    "scope",
    "disabled",
    "withheld",
    "server-only",
    ".env.local",
    "Vercel Preview",
    "in-memory fake fetch",
    "deadline",
    "retry",
    "abort",
    "response",
    "redacted",
    "Orders API",
    "payment",
    "passenger identity",
    "rollback",
    "production",
  ])
    ok(`documentation ${phrase}`, normalizedDoc.includes(phrase.toLowerCase()));

  const total = passed + failures.length;
  if (total <= 131) failures.push(`count ${total} must be greater than 131`);
  if (failures.length) {
    console.error(
      `Duffel runtime-adapter verification FAILED - ${failures.length} of ${total}`,
    );
    failures.forEach((f) => console.error(`  x ${f}`));
    process.exit(1);
  }
  console.log(
    `Duffel runtime-adapter verification passed - ${passed}/${total} checks`,
  );
}
void main();
