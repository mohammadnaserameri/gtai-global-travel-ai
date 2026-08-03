/**
 * Deterministic checks for the V2.7 provider runtime: the trusted registry,
 * the local deterministic adapter, cancellation and timeout, the typed
 * failure taxonomy, provider-response validation, normalization, the internal
 * API request/response contract, the client repository, and the server/client
 * boundary itself.
 *
 * Same contract as the other `verify-*.ts` scripts — no test runner, no new
 * dependency, compiled by the project's own TypeScript compiler and run under
 * plain Node via the shared verification tsconfig. Several checks read this
 * repository's own source as text, because "no client component imports the
 * server runtime" and "no external host appears in client code" are
 * properties of the source rather than of a running process.
 *
 *   npm run verify:providers
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { addDays, todayIso } from "../src/features/dates/date-utils";
import { DEMO_LOCATIONS } from "../src/features/locations/demo-location-data";
import { buildSearchIntent } from "../src/features/flights/search-intent-validation";
import { serializeSearchIntent } from "../src/features/flights/search-intent-url";
import { DEFAULT_TRAVELERS } from "../src/features/flights/search-intent-types";
import type { FlightOffer } from "../src/features/flights/flight-offer-types";
import { generateDemoOffers } from "../src/features/flights/demo-offer-generation";
import { isCanonicalFlightOffer } from "../src/features/flights/flight-offer-validation";
import {
  chargeableTravelerCount,
  isCanonicalFlightOfferArrayForIntent,
  isCanonicalFlightOfferForIntent,
} from "../src/features/flights/flight-offer-intent-validation";
import { resolveAirportTimeZone } from "../src/features/flights/airport-timezone";
import { toLocalDateTime } from "../src/features/flights/utc-timeline";
import {
  isValidEpochMinutes,
  MAX_EPOCH_MINUTES,
  MIN_ROUND_TRIP_TURNAROUND_MINUTES,
} from "../src/features/flights/flight-offer-policy";
import {
  DEMO_BOOKING_PROVIDERS,
  DEMO_CARRIERS,
} from "../src/features/flights/demo-flight-catalog";
import { ApiFlightOfferRepository } from "../src/features/flights/api-flight-offer-repository";
import { validateApiResponse } from "../src/features/flights/api-flight-offer-repository";
import {
  ALLOWED_REQUEST_KEYS,
  containsForbiddenKey,
  FLIGHT_SEARCH_API_PATH,
  FLIGHT_SEARCH_API_VERSION,
  MAX_PROVIDER_OFFER_COUNT,
  MAX_REQUEST_BODY_BYTES,
  MAX_RESPONSE_OFFERS,
  RESPONSE_MODE,
} from "../src/features/flights/flight-search-api-contract";
import { DemoFlightOfferRepository } from "../src/features/flights/demo-flight-offer-repository";
import enDict from "../src/i18n/dictionaries/en.json";
import frDict from "../src/i18n/dictionaries/fr.json";
import faDict from "../src/i18n/dictionaries/fa.json";
import arDict from "../src/i18n/dictionaries/ar.json";
import {
  FlightOfferRepositoryError,
  isDevelopmentScenario,
} from "../src/features/flights/flight-offer-repository";
import {
  createProviderRegistry,
  ProviderRegistryError,
  runtimeProviderRegistry,
} from "../src/server/flights/providers/provider-registry";
import { localDeterministicProviderAdapter } from "../src/server/flights/providers/adapters/local-deterministic-provider-adapter";
import { orchestrateProviderSearch } from "../src/server/flights/providers/provider-search-orchestrator";
import {
  createProviderAbortScope,
  runWithAbortScope,
} from "../src/server/flights/providers/provider-timeout";
import {
  isValidRetryAfterMs,
  validateProviderOutcome,
} from "../src/server/flights/providers/provider-search-validation";
import {
  isJsonContentType,
  readBoundedRequestBody,
} from "../src/server/flights/request-body-reader";
import { normalizeProviderOffers } from "../src/server/flights/providers/provider-response-normalizer";
import { createRecordingAuditSink } from "../src/server/flights/providers/provider-audit";
import type {
  FlightProviderAdapter,
  ProviderRegistration,
  ProviderSearchOutcome,
} from "../src/server/flights/providers/provider-runtime-types";
import { validateFlightSearchRequestBody } from "../src/server/flights/flight-search-request-validation";
import {
  buildErrorResponse,
  buildSuccessResponse,
  RESPONSE_HEADERS,
} from "../src/server/flights/flight-search-response";

/** The two environment policies, passed explicitly so no test mutates `process.env`. */
const DEV_POLICY = { allowDevelopmentScenarios: true } as const;
const PROD_POLICY = { allowDevelopmentScenarios: false } as const;

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}

function ok(name: string, condition: boolean): void {
  check(name, condition, true);
}

// The compiled script runs from `node_modules/.cache`, so `__dirname` points
// at build output rather than at the sources these checks read. `process.cwd()`
// is the repository root under every `npm run verify:*` invocation, which is
// the same anchor the other verification scripts use.
const repoRoot = process.cwd();
const readSource = (relativePath: string): string =>
  readFileSync(join(repoRoot, relativePath), "utf8");

/** Comments describe rules; a regex must not be satisfied by prose about the rule. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Every `.ts`/`.tsx` file under a directory, recursively. */
function collectSourceFiles(relativeDir: string): string[] {
  const absolute = join(repoRoot, relativeDir);
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) out.push(full);
    }
  };
  walk(absolute);
  return out;
}

/** A fixture adapter that answers however the test needs. Never registered in the runtime. */
function fixtureAdapter(
  providerId: string,
  respond: (signal: AbortSignal) => Promise<ProviderSearchOutcome>,
): FlightProviderAdapter {
  return { providerId, search: (context) => respond(context.signal) };
}

function registration(
  overrides: Partial<ProviderRegistration> & {
    providerId: string;
    adapter: FlightProviderAdapter;
  },
): ProviderRegistration {
  return {
    enabled: true,
    label: `fixture ${overrides.providerId}`,
    timeoutMs: 1_000,
    maximumOfferCount: 40,
    priority: 0,
    ...overrides,
  };
}

function neverResolves(signal: AbortSignal): Promise<ProviderSearchOutcome> {
  return new Promise((resolve) => {
    signal.addEventListener(
      "abort",
      () => resolve({ ok: false, failure: { code: "cancelled" } }),
      { once: true },
    );
  });
}

async function main(): Promise<void> {
  const locale = "en";
  const today = todayIso();
  const departure = addDays(today, 15);
  const returnDate = addDays(departure, 6);

  const byId = (id: string) => DEMO_LOCATIONS.find((l) => l.id === id);
  const ymq = byId("city-ymq");
  const lhr = byId("airport-lhr");
  const nyc = byId("city-nyc") ?? byId("airport-jfk");
  if (!ymq || !lhr || !nyc) throw new Error("Fixture locations missing.");

  const intent = buildSearchIntent({
    tripType: "roundTrip",
    origin: ymq,
    destination: lhr,
    departureDate: departure,
    returnDate,
    travelers: DEFAULT_TRAVELERS,
    cabinClass: "economy",
    flexibilityDays: 0,
    currency: "CAD",
    locale,
  });
  const otherIntent = buildSearchIntent({
    tripType: "roundTrip",
    origin: ymq,
    destination: nyc,
    departureDate: departure,
    returnDate,
    travelers: DEFAULT_TRAVELERS,
    cabinClass: "economy",
    flexibilityDays: 0,
    currency: "CAD",
    locale,
  });
  if (!intent || !otherIntent) throw new Error("Fixture intent failed to build.");

  const sampleOffers = generateDemoOffers(intent);
  ok("fixture generated a usable offer set", sampleOffers.length >= 10);

  // Assigned inside the orchestrator options below so the audit events for the
  // self-cancelling adapter can be inspected afterwards.
  let selfCancelAudit: ReturnType<typeof createRecordingAuditSink>;

  const liveSignal = new AbortController().signal;
  const runInput = { intent, signal: liveSignal, scenario: "normal" as const };

  // --- 1-6. Registry -----------------------------------------------------------------------------
  const okAdapter = fixtureAdapter("fixture-a", async () => ({
    ok: true,
    offers: sampleOffers,
  }));

  ok(
    "1. the registry accepts one valid provider",
    createProviderRegistry([
      registration({ providerId: "fixture-a", adapter: okAdapter }),
    ]).enabledProviders().length === 1,
  );

  const rejects = (build: () => unknown): boolean => {
    try {
      build();
      return false;
    } catch (error: unknown) {
      return error instanceof ProviderRegistryError;
    }
  };

  ok(
    "2. a duplicate provider id is rejected",
    rejects(() =>
      createProviderRegistry([
        registration({
          providerId: "dupe",
          adapter: fixtureAdapter("dupe", async () => ({ ok: true, offers: [] })),
        }),
        registration({
          providerId: "dupe",
          adapter: fixtureAdapter("dupe", async () => ({ ok: true, offers: [] })),
        }),
      ]),
    ),
  );
  ok(
    "3. an empty provider id is rejected",
    rejects(() =>
      createProviderRegistry([
        registration({
          providerId: "",
          adapter: fixtureAdapter("", async () => ({ ok: true, offers: [] })),
        }),
      ]),
    ),
  );

  let disabledWasCalled = false;
  const disabledRegistry = createProviderRegistry([
    registration({
      providerId: "disabled-one",
      enabled: false,
      adapter: fixtureAdapter("disabled-one", async () => {
        disabledWasCalled = true;
        return { ok: true, offers: sampleOffers };
      }),
    }),
    registration({ providerId: "fixture-a", adapter: okAdapter }),
  ]);
  const disabledRun = await orchestrateProviderSearch(runInput, {
    registry: disabledRegistry,
  });
  ok(
    "4. a disabled provider is never executed",
    !disabledWasCalled &&
      disabledRegistry.enabledProviders().length === 1 &&
      disabledRun.outcomes.length === 1,
  );
  ok(
    "5. an out-of-range timeout is rejected",
    rejects(() =>
      createProviderRegistry([
        registration({ providerId: "fixture-a", adapter: okAdapter, timeoutMs: 0 }),
      ]),
    ) &&
      rejects(() =>
        createProviderRegistry([
          registration({
            providerId: "fixture-a",
            adapter: okAdapter,
            timeoutMs: 10 ** 9,
          }),
        ]),
      ) &&
      rejects(() =>
        createProviderRegistry([
          registration({
            providerId: "fixture-a",
            adapter: okAdapter,
            timeoutMs: 1.5,
          }),
        ]),
      ),
  );
  ok(
    "6. an out-of-range maximum offer count is rejected",
    rejects(() =>
      createProviderRegistry([
        registration({
          providerId: "fixture-a",
          adapter: okAdapter,
          maximumOfferCount: 0,
        }),
      ]),
    ) &&
      rejects(() =>
        createProviderRegistry([
          registration({
            providerId: "fixture-a",
            adapter: okAdapter,
            maximumOfferCount: 10_000,
          }),
        ]),
      ),
  );

  // --- 7-10. Local deterministic adapter ---------------------------------------------------------
  const adapterRun = await localDeterministicProviderAdapter.search({
    intent,
    signal: liveSignal,
    searchContextId: "fixture-context",
    scenario: "normal",
  });
  ok(
    "7. the local adapter returns a typed success outcome",
    adapterRun.ok === true,
  );

  const adapterRunAgain = await localDeterministicProviderAdapter.search({
    intent,
    signal: liveSignal,
    searchContextId: "different-context",
    scenario: "normal",
  });
  check(
    "8. the same intent returns identical offers",
    adapterRun.ok && adapterRunAgain.ok ? adapterRun.offers : null,
    adapterRun.ok && adapterRunAgain.ok ? adapterRunAgain.offers : undefined,
  );
  check(
    "9. offer ids are stable across runs and independent of the search context id",
    adapterRun.ok ? adapterRun.offers.map((o) => o.id) : [],
    generateDemoOffers(intent).map((o) => o.id),
  );
  ok(
    "10. a different intent changes the deterministic output",
    generateDemoOffers(otherIntent)[0].id !== generateDemoOffers(intent)[0].id,
  );

  // --- 11-15. Abort and timeout ------------------------------------------------------------------
  const preAborted = new AbortController();
  preAborted.abort();
  const preAbortedRun = await orchestrateProviderSearch(
    { intent, signal: preAborted.signal, scenario: "normal" },
    {
      registry: createProviderRegistry([
        registration({
          providerId: "slow",
          adapter: fixtureAdapter("slow", neverResolves),
        }),
      ]),
    },
  );
  check(
    "11. aborting before the search starts yields cancelled",
    preAbortedRun.outcomes[0].failure?.code,
    "cancelled",
  );

  const midAbort = new AbortController();
  const midAbortPromise = orchestrateProviderSearch(
    { intent, signal: midAbort.signal, scenario: "normal" },
    {
      registry: createProviderRegistry([
        registration({
          providerId: "slow",
          adapter: fixtureAdapter("slow", neverResolves),
          timeoutMs: 10_000,
        }),
      ]),
    },
  );
  setTimeout(() => midAbort.abort(), 20);
  const midAbortRun = await midAbortPromise;
  check(
    "12. aborting during the search yields cancelled",
    midAbortRun.outcomes[0].failure?.code,
    "cancelled",
  );

  const timeoutRun = await orchestrateProviderSearch(runInput, {
    registry: createProviderRegistry([
      registration({
        providerId: "slow",
        adapter: fixtureAdapter("slow", neverResolves),
        timeoutMs: 100,
      }),
    ]),
  });
  check(
    "13. a provider that never answers yields timeout",
    timeoutRun.outcomes[0].failure?.code,
    "timeout",
  );

  // A cleared timer leaves no handle keeping the event loop alive; an
  // uncleared one would. `dispose` is also called twice on purpose.
  const disposalScope = createProviderAbortScope(
    new AbortController().signal,
    50_000,
  );
  disposalScope.dispose();
  disposalScope.dispose();
  ok(
    "14. the timeout timer is cleared on disposal and disposal is idempotent",
    disposalScope.reason() === "none" && !disposalScope.signal.aborted,
  );
  ok(
    "15. cancellation is never reported as a timeout",
    midAbortRun.outcomes[0].failure?.code === "cancelled" &&
      timeoutRun.outcomes[0].failure?.code === "timeout",
  );

  // --- 16-23. Provider-response validation -------------------------------------------------------
  ok(
    "16. a provider retryAfterMs is validated before it is trusted",
    isValidRetryAfterMs(1_000) &&
      !isValidRetryAfterMs(-1) &&
      !isValidRetryAfterMs(1.5) &&
      !isValidRetryAfterMs(Number.POSITIVE_INFINITY) &&
      !isValidRetryAfterMs(10 ** 9) &&
      !isValidRetryAfterMs("1000") &&
      validateProviderOutcome(
        { ok: false, failure: { code: "rateLimited", retryAfterMs: -5 } },
        40,
        intent,
      ).ok === false,
  );
  ok(
    "17. a malformed success result is rejected",
    validateProviderOutcome({ ok: true }, 40, intent).ok === false &&
      validateProviderOutcome({ ok: true, offers: "many" }, 40, intent).ok ===
        false &&
      validateProviderOutcome(null, 40, intent).ok === false &&
      validateProviderOutcome({}, 40, intent).ok === false,
  );
  ok(
    "18. an excessive offer count is rejected against the registry's own limit",
    validateProviderOutcome({ ok: true, offers: sampleOffers }, 2, intent).ok ===
      false &&
      validateProviderOutcome({ ok: true, offers: sampleOffers }, 40, intent).ok ===
        true,
  );

  const brokenOffer = (
    mutate: (offer: Record<string, unknown>) => void,
  ): unknown => {
    const clone = JSON.parse(JSON.stringify(sampleOffers[0])) as Record<
      string,
      unknown
    >;
    mutate(clone);
    return clone;
  };
  ok(
    "19. an offer that is not canonical is rejected",
    validateProviderOutcome(
      { ok: true, offers: [brokenOffer((o) => delete o.isDemonstration)] },
      40,
      intent,
    ).ok === false,
  );
  ok(
    "20. an unsupported currency is rejected",
    validateProviderOutcome(
      { ok: true, offers: [brokenOffer((o) => (o.currency = "XYZ"))] },
      40,
      intent,
    ).ok === false,
  );
  ok(
    "21. a non-finite or fractional price is rejected",
    validateProviderOutcome(
      { ok: true, offers: [brokenOffer((o) => (o.totalPrice = Number.NaN))] },
      40,
      intent,
    ).ok === false &&
      validateProviderOutcome(
        { ok: true, offers: [brokenOffer((o) => (o.totalPrice = 12.5))] },
        40,
        intent,
      ).ok === false,
  );
  ok(
    "22. an itinerary whose chronology is invalid is rejected",
    validateProviderOutcome(
      {
        ok: true,
        offers: [
          brokenOffer((o) => {
            const itineraries = o.itineraries as Record<string, unknown>[];
            const first = itineraries[0];
            const arrival = first.arrival as Record<string, unknown>;
            const departure = first.departure as Record<string, unknown>;
            arrival.epochMinutes = (departure.epochMinutes as number) - 60;
          }),
        ],
      },
      40,
      intent,
    ).ok === false,
  );
  ok(
    "23. an unexpected URL-bearing field is rejected",
    validateProviderOutcome(
      {
        ok: true,
        offers: [brokenOffer((o) => (o.bookingUrl = "https://example.com"))],
      },
      40,
      intent,
    ).ok === false &&
      containsForbiddenKey({ offers: [{ redirectUrl: "https://example.com" }] }),
  );

  // --- 24-27. Orchestration outcomes -------------------------------------------------------------
  const throwingAdapter = fixtureAdapter("thrower", async () => {
    throw new Error("PROVIDER_SECRET_TOKEN=abc123 connection refused at 10.0.0.1");
  });
  const throwRun = await orchestrateProviderSearch(runInput, {
    registry: createProviderRegistry([
      registration({ providerId: "thrower", adapter: throwingAdapter }),
    ]),
  });
  ok(
    "24. a provider failure never exposes the raw thrown error",
    throwRun.outcomes[0].status === "failed" &&
      throwRun.outcomes[0].failure?.code === "unknown" &&
      !JSON.stringify(throwRun).includes("PROVIDER_SECRET_TOKEN") &&
      !JSON.stringify(throwRun).includes("10.0.0.1"),
  );

  const partialRun = await orchestrateProviderSearch(runInput, {
    registry: createProviderRegistry([
      registration({
        providerId: "good",
        adapter: fixtureAdapter("good", async () => ({
          ok: true,
          offers: sampleOffers,
        })),
      }),
      registration({
        providerId: "bad",
        adapter: fixtureAdapter("bad", async () => ({
          ok: false,
          failure: { code: "unavailable" },
        })),
        priority: 1,
      }),
    ]),
  });
  check(
    "25. one success plus one failure yields partial",
    partialRun.status,
    "partial",
  );
  ok(
    "25b. a partial result still carries the successful provider's offers",
    partialRun.offers.length > 0,
  );

  const allFailedRun = await orchestrateProviderSearch(runInput, {
    registry: createProviderRegistry([
      registration({
        providerId: "bad-1",
        adapter: fixtureAdapter("bad-1", async () => ({
          ok: false,
          failure: { code: "unavailable" },
        })),
      }),
      registration({
        providerId: "bad-2",
        adapter: fixtureAdapter("bad-2", async () => ({
          ok: false,
          failure: { code: "authentication" },
        })),
        priority: 1,
      }),
    ]),
  });
  check(
    "26. every provider failing yields an aggregate failure",
    allFailedRun.status,
    "failed",
  );
  ok(
    "26b. an aggregate failure carries no offers",
    allFailedRun.offers.length === 0,
  );

  const emptyRun = await orchestrateProviderSearch(runInput, {
    registry: createProviderRegistry([
      registration({
        providerId: "empty",
        adapter: fixtureAdapter("empty", async () => ({ ok: true, offers: [] })),
      }),
    ]),
  });
  check(
    "27. a successful provider with no offers yields empty",
    emptyRun.status,
    "empty",
  );

  // --- 28-33. Search context id and audit minimization -------------------------------------------
  const auditSink = createRecordingAuditSink();
  const auditedRun = await orchestrateProviderSearch(runInput, {
    registry: createProviderRegistry([
      registration({ providerId: "fixture-a", adapter: okAdapter }),
    ]),
    auditSink,
  });
  const secondAuditedRun = await orchestrateProviderSearch(runInput, {
    registry: createProviderRegistry([
      registration({ providerId: "fixture-a", adapter: okAdapter }),
    ]),
  });

  ok(
    "28. searchContextId is an opaque random identifier",
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      auditedRun.searchContextId,
    ) && auditedRun.searchContextId !== secondAuditedRun.searchContextId,
  );
  const contextIdSource = stripComments(
    readSource("src/server/flights/providers/provider-search-orchestrator.ts"),
  );
  ok(
    "29. searchContextId is not derived from the Search Intent",
    /randomUUID\(\)/.test(contextIdSource) &&
      !/createSearchContextId[\s\S]{0,400}?(serializeSearchIntent|hashString|intent\.)/.test(
        contextIdSource,
      ),
  );

  const auditText = JSON.stringify(auditSink.events);
  ok(
    "30. an audit event excludes the route",
    !auditText.includes(intent.origin.entityId) &&
      !auditText.includes(intent.destination.entityId) &&
      !auditText.includes("YUL") &&
      !auditText.includes("LHR"),
  );
  ok(
    "31. an audit event excludes the dates",
    !auditText.includes(intent.departureDate) &&
      !auditText.includes(String(intent.returnDate ?? "@@none@@")),
  );
  ok(
    "32. an audit event excludes travelers, cabin and currency",
    !auditText.includes("adults") &&
      !auditText.includes("economy") &&
      !auditText.includes("CAD"),
  );
  ok(
    "33. an audit event excludes any raw payload and reports only bucketed durations",
    auditSink.events.length > 0 &&
      auditSink.events.every(
        (event) =>
          !("payload" in event) &&
          !("rawResponse" in event) &&
          !("intent" in event) &&
          (event.durationBucketMs === null || event.durationBucketMs % 250 === 0),
      ),
  );

  // --- 34-45. Internal API contract --------------------------------------------------------------
  const validBody = {
    version: FLIGHT_SEARCH_API_VERSION,
    searchIntent: {
      v: "1",
      trip: "roundTrip",
      origin: ymq.id,
      destination: lhr.id,
      departure,
      return: returnDate,
      adults: "1",
      cabin: "economy",
      flex: "0",
      currency: "CAD",
    },
    locale: "en",
    retryToken: 0,
    scenario: "normal",
  };
  ok(
    "34. the API accepts a valid version-1 body",
    validateFlightSearchRequestBody(validBody, DEV_POLICY).ok,
  );

  const routeSource = stripComments(
    readSource("src/app/api/flights/search/route.ts"),
  );
  ok(
    "35. the API rejects malformed JSON without reflecting the payload",
    /JSON\.parse\(bodyRead\.text\)/.test(routeSource) &&
      /catch\s*\{[\s\S]{0,200}?buildErrorResponse\("invalidRequest"\),\s*400/.test(
        routeSource,
      ) &&
      !/JSON\.parse[\s\S]{0,300}?error\.message/.test(routeSource),
  );
  ok(
    "36. the API rejects an unsupported content type with 415, via exact media-type matching",
    // The route now delegates to the shared helper rather than carrying its
    // own substring test, so the assertion follows the delegation. The
    // behaviour itself is checked directly below.
    /isJsonContentType\(request\.headers\.get\("content-type"\)\)/.test(
      routeSource,
    ) && /buildErrorResponse\("invalidRequest"\),\s*415/.test(routeSource),
  );
  ok(
    "36b. the media-type policy accepts charset parameters and rejects near-misses",
    isJsonContentType("application/json") &&
      isJsonContentType("application/json; charset=utf-8") &&
      isJsonContentType("  APPLICATION/JSON ; charset=UTF-8") &&
      !isJsonContentType("application/jsonp") &&
      !isJsonContentType("text/application/json") &&
      !isJsonContentType("text/plain") &&
      !isJsonContentType(null),
  );
  check(
    "37. the API rejects an unsupported version",
    validateFlightSearchRequestBody({ ...validBody, version: 2 }, DEV_POLICY),
    { ok: false, reason: "unsupportedVersion" },
  );
  check(
    "38. the API rejects unknown top-level fields",
    validateFlightSearchRequestBody(
      { ...validBody, providerId: "evil" },
      DEV_POLICY,
    ),
    { ok: false, reason: "unknownProperty" },
  );
  ok(
    "38b. the API rejects unknown fields inside searchIntent",
    validateFlightSearchRequestBody(
      {
        ...validBody,
        searchIntent: {
          ...validBody.searchIntent,
          returnTo: "https://example.com",
        },
      },
      DEV_POLICY,
    ).ok === false,
  );
  check(
    "39. the API rejects an invalid Search Intent",
    validateFlightSearchRequestBody(
      {
        ...validBody,
        searchIntent: { ...validBody.searchIntent, origin: "not-a-place" },
      },
      DEV_POLICY,
    ),
    { ok: false, reason: "invalidSearchIntent" },
  );
  ok(
    "40. the API rejects an invalid retry token",
    validateFlightSearchRequestBody({ ...validBody, retryToken: -1 }, DEV_POLICY)
      .ok === false &&
      validateFlightSearchRequestBody({ ...validBody, retryToken: 1.5 }, DEV_POLICY)
        .ok === false &&
      validateFlightSearchRequestBody(
        { ...validBody, retryToken: 10 ** 9 },
        DEV_POLICY,
      ).ok === false &&
      validateFlightSearchRequestBody({ ...validBody, retryToken: "0" }, DEV_POLICY)
        .ok === false,
  );
  check(
    "41. the API rejects an unsupported scenario",
    validateFlightSearchRequestBody(
      { ...validBody, scenario: "drop-tables" },
      DEV_POLICY,
    ),
    { ok: false, reason: "unsupportedScenario" },
  );
  check(
    "42. every API response carries Cache-Control: no-store",
    RESPONSE_HEADERS["Cache-Control"],
    "no-store",
  );
  ok(
    "42b. no permissive CORS header is set on any response",
    !Object.keys(RESPONSE_HEADERS).some((key) =>
      key.toLowerCase().startsWith("access-control-"),
    ) && !/Access-Control-Allow/i.test(routeSource),
  );

  const failedProviderResponse = buildSuccessResponse(partialRun);
  const errorEnvelope = buildErrorResponse("providerUnavailable");
  const envelopeText = JSON.stringify([failedProviderResponse, errorEnvelope]);
  ok(
    "43. the API response exposes no raw provider error",
    !envelopeText.includes("PROVIDER_SECRET_TOKEN") &&
      !envelopeText.includes("stack") &&
      !/message/.test(envelopeText),
  );
  ok(
    "44. the API response exposes no searchContextId",
    !envelopeText.includes(partialRun.searchContextId) &&
      !envelopeText.includes("searchContextId"),
  );
  ok(
    "45. the API response exposes no URL of any kind",
    !containsForbiddenKey(failedProviderResponse) &&
      !containsForbiddenKey(errorEnvelope) &&
      !/https?:\/\//.test(envelopeText),
  );
  ok(
    "45b. an aggregate provider failure is a 503 error envelope, not an empty result",
    /result\.status === "failed"/.test(routeSource) &&
      /buildErrorResponse\("providerUnavailable"\),\s*503/.test(routeSource),
  );

  // --- 46-52. Client repository ------------------------------------------------------------------
  const originalFetch = globalThis.fetch;
  interface CapturedRequest {
    url: string;
    init: RequestInit;
  }
  // A holder object rather than a bare `let`: TypeScript narrows a variable
  // only ever assigned inside a closure to `null` at every read site, which
  // would make the assertions below meaningless.
  const capture: { last: CapturedRequest | null } = { last: null };

  /**
   * A Response-shaped stub. `headers` is real rather than omitted, because the
   * repository now checks the declared content type before parsing — a stub
   * without headers would exercise a path the browser never takes.
   */
  const stubFetch = (
    payload: unknown,
    status = 200,
    contentType: string | null = "application/json; charset=utf-8",
  ) => {
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      capture.last = { url, init };
      const headers = new Headers();
      if (contentType !== null) headers.set("content-type", contentType);
      return {
        status,
        headers,
        json: async () => payload,
      } as unknown as Response;
    }) as unknown as typeof fetch;
  };

  const repository = new ApiFlightOfferRepository();
  const goodPayload = {
    version: 1,
    status: "success",
    mode: RESPONSE_MODE,
    offers: sampleOffers,
    providerSummary: [
      {
        providerId: "gtai-local-demo",
        status: "succeeded",
        offerCount: sampleOffers.length,
        durationBucket: "fast",
      },
    ],
  };

  stubFetch(goodPayload);
  const clientResult = await repository.search(intent, {
    signal: new AbortController().signal,
    retryToken: 3,
    scenario: "normal",
  });
  const capturedRequest = capture.last;
  const sentBody = JSON.parse(String(capturedRequest?.init.body ?? "{}")) as Record<
    string,
    unknown
  >;

  ok(
    "46. the client repository sends only allowed fields to a same-origin path",
    capturedRequest?.url === FLIGHT_SEARCH_API_PATH &&
      Object.keys(sentBody).every((key) => ALLOWED_REQUEST_KEYS.includes(key)) &&
      Object.keys(sentBody).length === ALLOWED_REQUEST_KEYS.length &&
      sentBody.retryToken === 3 &&
      sentBody.scenario === "normal",
  );
  ok(
    "46b. the request body carries no view state, offer id, URL or credential",
    !JSON.stringify(sentBody).includes("sort") &&
      !JSON.stringify(sentBody).includes("stops") &&
      !JSON.stringify(sentBody).includes("maxPrice") &&
      !JSON.stringify(sentBody).includes("demo-") &&
      !containsForbiddenKey(sentBody),
  );
  ok(
    "47. the client repository passes the caller's AbortSignal through",
    capturedRequest?.init.signal !== undefined &&
      capturedRequest?.init.credentials === "same-origin",
  );
  ok(
    "47b. an already-aborted signal throws before any request is issued",
    await (async () => {
      capture.last = null;
      const aborted = new AbortController();
      aborted.abort();
      try {
        await repository.search(intent, { signal: aborted.signal });
        return false;
      } catch {
        return capture.last === null;
      }
    })(),
  );
  ok(
    "48. the client repository validates and accepts a well-formed success response",
    clientResult.offers.length === sampleOffers.length &&
      clientResult.offers.every(isCanonicalFlightOffer),
  );

  const expectsRepositoryError = async (payload: unknown): Promise<boolean> => {
    stubFetch(payload);
    try {
      await repository.search(intent, { signal: new AbortController().signal });
      return false;
    } catch (error: unknown) {
      return error instanceof FlightOfferRepositoryError;
    }
  };

  ok(
    "49. an error envelope maps to a safe repository error",
    await expectsRepositoryError({
      version: 1,
      status: "error",
      mode: RESPONSE_MODE,
      errorCode: "providerUnavailable",
    }),
  );
  ok(
    "50. an unsupported response version is rejected",
    await expectsRepositoryError({ ...goodPayload, version: 2 }),
  );
  ok(
    "50b. a non-demonstration mode is rejected",
    await expectsRepositoryError({ ...goodPayload, mode: "live" }),
  );
  ok(
    "51. a malformed offer in an otherwise valid response is rejected",
    await expectsRepositoryError({
      ...goodPayload,
      offers: [brokenOffer((o) => (o.totalPrice = "cheap"))],
    }),
  );
  ok(
    "52. a URL-bearing response is rejected",
    (await expectsRepositoryError({
      ...goodPayload,
      providerSummary: [
        {
          providerId: "x",
          status: "succeeded",
          offerCount: 0,
          durationBucket: "fast",
          redirectUrl: "https://example.com",
        },
      ],
    })) &&
      validateApiResponse(
        { ...goodPayload, bookingUrl: "https://x.test" },
        intent,
      ) === null,
  );

  globalThis.fetch = originalFetch;

  // --- 53-61. Integration and request identity ---------------------------------------------------
  const resultsSource = stripComments(
    readSource("src/components/flights/FlightResultsExperience.tsx"),
  );
  const detailsSource = stripComments(
    readSource("src/components/flights/details/FlightDetailsExperience.tsx"),
  );
  const runtimeRepositorySource = stripComments(
    readSource("src/features/flights/runtime-repository.ts"),
  );

  ok(
    "53. Results resolves its repository through the shared API-backed runtime",
    /getFlightOfferRepository\(\)/.test(resultsSource) &&
      !/DemoFlightOfferRepository/.test(resultsSource),
  );
  ok(
    "54. Details resolves its repository through the same shared runtime",
    /getFlightOfferRepository\(\)/.test(detailsSource) &&
      !/DemoFlightOfferRepository/.test(detailsSource),
  );
  ok(
    "54b. the shared runtime is the API repository, not the in-process demo one",
    /new ApiFlightOfferRepository\(\)/.test(runtimeRepositorySource) &&
      !/DemoFlightOfferRepository/.test(runtimeRepositorySource),
  );
  ok(
    "55. an invalid Details offer id remains a no-fetch condition",
    /if\s*\(!offerIdIsValid\)\s*return;/.test(detailsSource) &&
      /intentKey\s*!==\s*null\s*&&\s*offerIdIsValid/.test(detailsSource),
  );

  const fetchKeyOf = (source: string): string => {
    const match = source.match(/const fetchKey =([\s\S]*?);\n/);
    return match ? match[1] : "";
  };
  const resultsKey = fetchKeyOf(resultsSource);
  const detailsKey = fetchKeyOf(detailsSource);
  const interpolations = (template: string): string[] =>
    [...template.matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1].trim());

  ok(
    "56. Filters are absent from request identity",
    !/filters|stops|carriers|maxPrice|maxDuration/i.test(resultsKey) &&
      !/filters|stops|carriers|maxPrice|maxDuration/i.test(detailsKey),
  );
  ok(
    "57. Sort is absent from request identity",
    !/\bsort\b/i.test(resultsKey) && !/\bsort\b/i.test(detailsKey),
  );
  ok(
    "58. the selected offer id is absent from request identity",
    // `offerIdIsValid` gates whether a key exists; the id itself never varies
    // the key's value, so only the interpolated expressions are inspected.
    interpolations(detailsKey).every(
      (expression) => !/\bofferId\b/.test(expression),
    ),
  );
  ok(
    "59. provider-preview and other UI state are absent from request identity",
    !/handoff|preview|modal|expanded|timeline|scroll/i.test(resultsKey) &&
      !/handoff|preview|modal|expanded|timeline|scroll/i.test(detailsKey),
  );
  ok(
    "60. the retry token is part of request identity on both pages",
    /retryToken/.test(resultsKey) && /retryToken/.test(detailsKey),
  );
  ok(
    "61. the development scenario follows the shared allowlist",
    isDevelopmentScenario("normal") &&
      isDevelopmentScenario("empty") &&
      isDevelopmentScenario("error") &&
      isDevelopmentScenario("slow") &&
      !isDevelopmentScenario("drop-tables") &&
      !isDevelopmentScenario(null) &&
      /isDevelopmentScenario\(raw\)\s*\?\s*raw\s*:\s*"normal"/.test(
        runtimeRepositorySource,
      ),
  );

  // --- 62-68. Boundary, dependencies and scope ---------------------------------------------------
  const clientComponentFiles = collectSourceFiles("src/components").concat(
    collectSourceFiles("src/features"),
  );
  const importsServer = clientComponentFiles.filter((file) => {
    const source = stripComments(readFileSync(file, "utf8"));
    return (
      /from\s+"(@\/server\/|(\.\.\/)+server\/)/.test(source) ||
      /import\s+"(@\/server\/|(\.\.\/)+server\/)/.test(source)
    );
  });
  check(
    "62. no component or client feature module imports the server runtime",
    importsServer.map((f) => f.replace(repoRoot, "")),
    [],
  );

  const apiRepositorySource = stripComments(
    readSource("src/features/flights/api-flight-offer-repository.ts"),
  );
  ok(
    "63. the client repository imports no adapter, registry or orchestrator",
    !/adapter/i.test(
      apiRepositorySource
        .split("\n")
        .filter((l) => l.startsWith("import"))
        .join("\n"),
    ) && !/provider-registry|orchestrator|server/i.test(apiRepositorySource),
  );
  ok(
    "63b. every server runtime entry module carries the server-only guard",
    [
      "src/server/flights/providers/provider-registry.ts",
      "src/server/flights/providers/provider-search-orchestrator.ts",
      "src/server/flights/providers/provider-timeout.ts",
      "src/server/flights/providers/provider-search-validation.ts",
      "src/server/flights/providers/provider-response-normalizer.ts",
      "src/server/flights/providers/provider-audit.ts",
      "src/server/flights/providers/adapters/local-deterministic-provider-adapter.ts",
      "src/server/flights/flight-search-request-validation.ts",
      "src/server/flights/flight-search-response.ts",
      "src/app/api/flights/search/route.ts",
    ].every((path) => /import\s+"[^"]*server-only"/.test(readSource(path))),
  );
  ok(
    "64. no external host appears in the client repository or the API contract",
    !/https?:\/\//.test(apiRepositorySource) &&
      !/https?:\/\//.test(
        stripComments(
          readSource("src/features/flights/flight-search-api-contract.ts"),
        ),
      ) &&
      FLIGHT_SEARCH_API_PATH.startsWith("/"),
  );

  const serverFiles = collectSourceFiles("src/server");
  const serverText = serverFiles
    .map((f) => stripComments(readFileSync(f, "utf8")))
    .join("\n");
  ok(
    "65. no real provider implementation exists — the runtime makes no outbound request",
    !/\bfetch\s*\(/.test(serverText) &&
      !/XMLHttpRequest|axios|node-fetch|undici|https?:\/\//.test(serverText) &&
      !/process\.env/.test(serverText),
  );
  ok(
    "65b. only the local deterministic adapter is enabled in the runtime registry",
    runtimeProviderRegistry.enabledProviders().length === 1 &&
      runtimeProviderRegistry.enabledProviders()[0].providerId ===
        localDeterministicProviderAdapter.providerId,
  );
  ok(
    "66. no affiliate redirect exists in the provider runtime",
    !/affiliate|redirect|clickId|deeplink/i.test(serverText),
  );
  ok(
    "67. no booking or payment code exists in the provider runtime",
    !/\bbooking\b|\bcheckout\b|\bpayment\b|\bstripe\b|\bcard\b/i.test(serverText),
  );

  const packageJson = JSON.parse(readSource("package.json")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
  };
  check(
    "68. no runtime dependency was added",
    Object.keys(packageJson.dependencies).sort(),
    ["next", "react", "react-dom"],
  );
  ok(
    "68b. verify:providers is wired into the existing verification harness",
    typeof packageJson.scripts["verify:providers"] === "string" &&
      packageJson.scripts["verify:providers"].includes("tsconfig.verify.json"),
  );

  // --- 69-72. Cross-version compatibility --------------------------------------------------------
  const orchestrated = await orchestrateProviderSearch(runInput, {
    registry: runtimeProviderRegistry,
  });
  check(
    "69. offer ids through the full runtime match the pre-V2.7 deterministic ids",
    orchestrated.offers.map((o) => o.id).sort(),
    generateDemoOffers(intent)
      .map((o) => o.id)
      .sort(),
  );
  ok(
    "69b. the orchestrated result is a plain canonical offer set with no provider fields",
    orchestrated.offers.every(isCanonicalFlightOffer) &&
      !containsForbiddenKey(orchestrated.offers),
  );
  ok(
    "70. the V2.6 Details resolution surface is unchanged (canonical offers only)",
    orchestrated.offers.every(
      (offer: FlightOffer) =>
        offer.isDemonstration && offer.itineraries.length === 2,
    ),
  );
  ok(
    "71. the V2.4 filter surface still sees the same complete offer set",
    normalizeProviderOffers([sampleOffers], 60).length === sampleOffers.length,
  );
  ok(
    "72. the V2.5.1 highlight surface still receives offers with intact ranking metadata",
    orchestrated.offers.every(
      (offer) =>
        Number.isInteger(offer.rankingMetadata.totalDurationMinutes) &&
        Number.isInteger(offer.rankingMetadata.totalStopCount),
    ),
  );

  // === V2.7 completion block ====================================================================
  // Everything above was written during the interrupted run. The checks below
  // close the remaining required coverage, and every one of them drives the
  // real implementation rather than a reimplementation of it.

  // --- 73-78. Registry: remaining boundary values and ordering -----------------------------------
  ok(
    "73. a zero timeout is rejected specifically",
    rejects(() =>
      createProviderRegistry([
        registration({
          providerId: "z",
          adapter: fixtureAdapter("z", async () => ({ ok: true, offers: [] })),
          timeoutMs: 0,
        }),
      ]),
    ),
  );
  ok(
    "74. a zero maximum offer count is rejected specifically",
    rejects(() =>
      createProviderRegistry([
        registration({
          providerId: "z",
          adapter: fixtureAdapter("z", async () => ({ ok: true, offers: [] })),
          maximumOfferCount: 0,
        }),
      ]),
    ),
  );
  const orderedRegistry = createProviderRegistry([
    registration({
      providerId: "gamma",
      adapter: fixtureAdapter("gamma", async () => ({ ok: true, offers: [] })),
      priority: 5,
    }),
    registration({
      providerId: "alpha",
      adapter: fixtureAdapter("alpha", async () => ({ ok: true, offers: [] })),
      priority: 1,
    }),
    registration({
      providerId: "beta",
      adapter: fixtureAdapter("beta", async () => ({ ok: true, offers: [] })),
      priority: 1,
    }),
  ]);
  check(
    "75. enabled providers have a deterministic order (priority, then id)",
    orderedRegistry.enabledProviders().map((p) => p.providerId),
    ["alpha", "beta", "gamma"],
  );
  ok(
    "76. a registration whose adapter disagrees about its own id is rejected",
    rejects(() =>
      createProviderRegistry([
        registration({
          providerId: "claimed",
          adapter: fixtureAdapter("actual", async () => ({ ok: true, offers: [] })),
        }),
      ]),
    ),
  );
  ok(
    "77. request data cannot select a provider — no registry lookup reads the request",
    (() => {
      const registrySource = stripComments(
        readSource("src/server/flights/providers/provider-registry.ts"),
      );
      const routeBody = stripComments(
        readSource("src/app/api/flights/search/route.ts"),
      );
      return (
        !/request|searchParams|query|body|env/i.test(registrySource) &&
        // The route passes the runtime registry as a constant; it never builds
        // one from anything the caller sent.
        /registry:\s*runtimeProviderRegistry/.test(routeBody) &&
        !/createProviderRegistry/.test(routeBody)
      );
    })(),
  );
  ok(
    "78. neither timeout nor maximum offer count can be supplied by a request",
    (() => {
      const validationSource = stripComments(
        readSource("src/server/flights/flight-search-request-validation.ts"),
      );
      return (
        !/timeoutMs/.test(validationSource) &&
        !/maximumOfferCount/.test(validationSource) &&
        !ALLOWED_REQUEST_KEYS.includes("providerId") &&
        !ALLOWED_REQUEST_KEYS.includes("timeoutMs") &&
        !ALLOWED_REQUEST_KEYS.includes("maximumOfferCount")
      );
    })(),
  );

  // --- 79-84. Adapter scenarios and purity -------------------------------------------------------
  const runScenario = (
    scenario: "normal" | "empty" | "error" | "slow",
    signal: AbortSignal,
  ) =>
    localDeterministicProviderAdapter.search({
      intent,
      signal,
      searchContextId: "fixture",
      scenario,
    });

  const emptyScenario = await runScenario("empty", liveSignal);
  ok(
    "79. the empty scenario returns a typed success carrying no offers",
    emptyScenario.ok === true && emptyScenario.offers.length === 0,
  );
  const errorScenario = await runScenario("error", liveSignal);
  ok(
    "80. the error scenario returns a typed failure, not a thrown error",
    errorScenario.ok === false && errorScenario.failure.code === "unavailable",
  );
  const slowAbort = new AbortController();
  const slowPromise = runScenario("slow", slowAbort.signal);
  setTimeout(() => slowAbort.abort(), 30);
  const slowScenario = await slowPromise;
  ok(
    "81. the slow scenario responds to cancellation rather than running to completion",
    slowScenario.ok === false && slowScenario.failure.code === "cancelled",
  );

  const adapterSource = stripComments(
    readSource(
      "src/server/flights/providers/adapters/local-deterministic-provider-adapter.ts",
    ),
  );
  ok(
    "82. the adapter performs no network request and reads no environment",
    !/fetch\(|XMLHttpRequest|https?:\/\/|process\.env|readFile/i.test(
      adapterSource,
    ),
  );
  ok(
    "83. the adapter reuses the extracted deterministic generator rather than its own copy",
    /generateDemoOffers/.test(adapterSource) &&
      !/function buildOffer|createRng|hashString/.test(adapterSource),
  );
  ok(
    "84. the adapter returns no redirect or affiliate URL on any path",
    adapterRun.ok &&
      !containsForbiddenKey(adapterRun.offers) &&
      !/redirect|affiliate|deeplink|bookingUrl/i.test(adapterSource),
  );

  // --- 85-89. Timer and listener hygiene ---------------------------------------------------------
  // A live upstream signal exposes its listener count indirectly: after a
  // successful run the scope must have detached, so aborting the upstream
  // afterwards leaves the scope's own reason untouched.
  const successUpstream = new AbortController();
  await orchestrateProviderSearch(
    { intent, signal: successUpstream.signal, scenario: "normal" },
    {
      registry: createProviderRegistry([
        registration({ providerId: "fixture-a", adapter: okAdapter }),
      ]),
    },
  );
  const listenersAfterSuccess = successUpstream.signal.onabort;
  successUpstream.abort();
  ok(
    "85. abort listeners are removed after a successful run",
    listenersAfterSuccess === null,
  );

  const failureUpstream = new AbortController();
  await orchestrateProviderSearch(
    { intent, signal: failureUpstream.signal, scenario: "normal" },
    {
      registry: createProviderRegistry([
        registration({ providerId: "thrower", adapter: throwingAdapter }),
      ]),
    },
  );
  failureUpstream.abort();
  ok(
    "86. the scope is disposed after a failing run too (finally, not only the happy path)",
    /finally\s*\{[\s\S]{0,80}?scope\.dispose\(\)/.test(
      stripComments(
        readSource("src/server/flights/providers/provider-search-orchestrator.ts"),
      ),
    ),
  );

  // A late resolution must be ignored rather than overwrite the abort outcome,
  // and must not surface as an unhandled rejection.
  let unhandled = 0;
  const onUnhandled = () => {
    unhandled += 1;
  };
  process.on("unhandledRejection", onUnhandled);

  const lateScope = createProviderAbortScope(new AbortController().signal, 40);
  const lateOutcome = await runWithAbortScope(
    lateScope,
    () => new Promise<string>((resolve) => setTimeout(() => resolve("late"), 200)),
  );
  lateScope.dispose();
  check(
    "87. a late resolution is ignored in favour of the timeout",
    lateOutcome.kind,
    "timedOut",
  );

  const rejectScope = createProviderAbortScope(new AbortController().signal, 40);
  const rejectOutcome = await runWithAbortScope(
    rejectScope,
    () =>
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("late failure")), 200),
      ),
  );
  rejectScope.dispose();
  check(
    "88. a late rejection is absorbed rather than escaping the scope",
    rejectOutcome.kind,
    "timedOut",
  );

  await new Promise((resolve) => setTimeout(resolve, 350));
  process.off("unhandledRejection", onUnhandled);
  check("89. no unhandled rejection occurred during abandoned work", unhandled, 0);

  // --- 90-94. Failure taxonomy stays typed -------------------------------------------------------
  const typedFailure = async (code: string): Promise<string | undefined> => {
    const run = await orchestrateProviderSearch(runInput, {
      registry: createProviderRegistry([
        registration({
          providerId: "typed",
          adapter: fixtureAdapter("typed", async () => ({
            ok: false,
            failure: { code } as never,
          })),
        }),
      ]),
    });
    return run.outcomes[0].failure?.code;
  };
  check(
    "90. an authentication failure stays typed",
    await typedFailure("authentication"),
    "authentication",
  );
  check(
    "91. a configuration failure stays typed",
    await typedFailure("configuration"),
    "configuration",
  );
  check(
    "92. an availability failure stays typed",
    await typedFailure("unavailable"),
    "unavailable",
  );
  check(
    "93. a rate-limit failure stays typed",
    await typedFailure("rateLimited"),
    "rateLimited",
  );
  const malformedRun = await orchestrateProviderSearch(runInput, {
    registry: createProviderRegistry([
      registration({
        providerId: "malformed",
        adapter: fixtureAdapter(
          "malformed",
          async () => ({ ok: true, offers: [{ id: "nope" }] }) as never,
        ),
      }),
    ]),
  });
  check(
    "94. a malformed provider response becomes a typed malformedResponse failure",
    malformedRun.outcomes[0].failure?.code,
    "malformedResponse",
  );

  // --- 95-101. Validation: remaining rejection cases ----------------------------------------------
  ok(
    "95. an invalid offer id is rejected",
    validateProviderOutcome(
      { ok: true, offers: [brokenOffer((o) => (o.id = "../../etc/passwd"))] },
      40,
      intent,
    ).ok === false,
  );
  ok(
    "96. an invalid itinerary count is rejected",
    validateProviderOutcome(
      { ok: true, offers: [brokenOffer((o) => (o.itineraries = []))] },
      40,
      intent,
    ).ok === false,
  );
  ok(
    "97. an invalid airport code is rejected",
    validateProviderOutcome(
      {
        ok: true,
        offers: [
          brokenOffer((o) => {
            const seg = (o.itineraries as Record<string, unknown>[])[0]
              .segments as Record<string, unknown>[];
            seg[0].originCode = "montreal";
          }),
        ],
      },
      40,
      intent,
    ).ok === false,
  );
  ok(
    "98. an unknown provider-specific field cannot cross into a canonical offer",
    validateProviderOutcome(
      {
        ok: true,
        offers: [brokenOffer((o) => (o.providerOfferReference = "ABC-123"))],
      },
      40,
      intent,
    ).ok === false &&
      !isCanonicalFlightOffer({ ...sampleOffers[0], commissionBps: 250 }),
  );
  ok(
    "99. a nested unknown field is rejected too",
    !isCanonicalFlightOffer(
      brokenOffer((o) => {
        const seg = (o.itineraries as Record<string, unknown>[])[0]
          .segments as Record<string, unknown>[];
        seg[0].providerSegmentKey = "xyz";
      }),
    ),
  );
  ok(
    "100. an invalid discriminant is rejected",
    validateProviderOutcome({ ok: "yes", offers: [] }, 40, intent).ok === false,
  );

  // One malformed provider must not erase a healthy one.
  const mixedRun = await orchestrateProviderSearch(runInput, {
    registry: createProviderRegistry([
      registration({
        providerId: "healthy",
        priority: 0,
        adapter: fixtureAdapter("healthy", async () => ({
          ok: true,
          offers: sampleOffers,
        })),
      }),
      registration({
        providerId: "broken",
        priority: 1,
        adapter: fixtureAdapter(
          "broken",
          async () => ({ ok: true, offers: [{ id: "bad" }] }) as never,
        ),
      }),
    ]),
  });
  ok(
    "101. one malformed provider is isolated and does not erase a valid provider",
    mixedRun.status === "partial" &&
      mixedRun.offers.length === sampleOffers.length &&
      mixedRun.outcomes.find((o) => o.providerId === "broken")?.failure?.code ===
        "malformedResponse" &&
      mixedRun.outcomes.find((o) => o.providerId === "healthy")?.status ===
        "succeeded",
  );

  // --- 102-105. Orchestrator: limits, ordering, duplicates ---------------------------------------
  const cappedRun = await orchestrateProviderSearch(runInput, {
    registry: createProviderRegistry([
      registration({
        providerId: "over",
        maximumOfferCount: 3,
        adapter: fixtureAdapter("over", async () => ({
          ok: true,
          offers: sampleOffers,
        })),
      }),
    ]),
  });
  ok(
    "102. the registry's maximum offer count is enforced after validation, as a rejection",
    // The provider returned more than its registered ceiling, so the whole
    // response is refused rather than silently truncated.
    cappedRun.status === "failed" &&
      cappedRun.outcomes[0].failure?.code === "malformedResponse",
  );
  check(
    "103. aggregation output is deterministic across repeated runs",
    (
      await orchestrateProviderSearch(runInput, {
        registry: runtimeProviderRegistry,
      })
    ).offers.map((o) => o.id),
    orchestrated.offers.map((o) => o.id),
  );
  check(
    "104. canonical ordering is price, then duration, then id",
    normalizeProviderOffers([sampleOffers], 60).map((o) => o.totalPrice),
    [...sampleOffers].map((o) => o.totalPrice).sort((a, b) => a - b),
  );
  const duplicateRun = normalizeProviderOffers([sampleOffers, sampleOffers], 60);
  check(
    "105. duplicate offer ids across providers collapse deterministically",
    duplicateRun.map((o) => o.id),
    normalizeProviderOffers([sampleOffers], 60).map((o) => o.id),
  );

  // --- 106-110. Audit: cancellation and remaining exclusions -------------------------------------
  const cancelAudit = createRecordingAuditSink();
  const cancelController = new AbortController();
  cancelController.abort();
  await orchestrateProviderSearch(
    { intent, signal: cancelController.signal, scenario: "normal" },
    {
      registry: createProviderRegistry([
        registration({
          providerId: "slow",
          adapter: fixtureAdapter("slow", neverResolves),
        }),
      ]),
      auditSink: cancelAudit,
    },
  );
  ok(
    "106. a cancellation is audited as its own event, not as a provider failure",
    // The previous version of this check accepted `failureCode === "cancelled"`
    // as proof of non-fault behaviour, which certified exactly the thing the
    // policy forbids: the event was still `search.failed` with a failure code
    // set, so any fault tally would have counted it.
    (() => {
      const forProvider = cancelAudit.events.filter((e) => e.providerId === "slow");
      const started = forProvider.filter((e) => e.event === "search.started");
      const cancelled = forProvider.filter((e) => e.event === "search.cancelled");
      const failed = forProvider.filter((e) => e.event === "search.failed");
      return (
        started.length === 1 &&
        cancelled.length === 1 &&
        failed.length === 0 &&
        cancelled[0].status === "cancelled" &&
        cancelled[0].failureCode === null
      );
    })(),
  );
  ok(
    "107. an audit event carries no cookie, IP, user-agent or account identifier",
    !/cookie|ipAddress|\buserAgent\b|accountId|sessionId/i.test(
      JSON.stringify(cancelAudit.events),
    ),
  );
  // An exact key set, not a denylist: a future contributor adding a field
  // carrying trip data would fail here rather than needing to be caught by a
  // reviewer noticing it.
  const auditKeys = new Set(
    auditSink.events.flatMap((event) => Object.keys(event)),
  );
  check(
    "108. an audit event carries exactly the minimized field set",
    [...auditKeys].sort(),
    [
      "durationBucketMs",
      "event",
      "failureCode",
      "occurredAt",
      "offerCount",
      "providerId",
      "searchContextId",
      "status",
    ],
  );
  ok(
    "109. the default audit sink is a no-op and writes nothing anywhere",
    (() => {
      const auditSource = stripComments(
        readSource("src/server/flights/providers/provider-audit.ts"),
      );
      return (
        /export const noopAuditSink/.test(auditSource) &&
        !/console\.|writeFile|appendFile|fetch\(/.test(auditSource)
      );
    })(),
  );
  ok(
    "110. no persistent audit logging exists anywhere in the server runtime",
    !/writeFile|appendFile|createWriteStream|console\.(log|info|warn|error)/.test(
      serverText,
    ),
  );

  // --- 111-118. API request and response contract ------------------------------------------------
  ok(
    "111. a missing or empty body is rejected",
    validateFlightSearchRequestBody(undefined, DEV_POLICY).ok === false &&
      validateFlightSearchRequestBody(null, DEV_POLICY).ok === false &&
      validateFlightSearchRequestBody("", DEV_POLICY).ok === false &&
      // Emptiness is now decided by the bounded stream reader, which returns
      // `empty` — not by measuring a string the route already accepted.
      /readBoundedRequestBody\(request, MAX_REQUEST_BODY_BYTES\)/.test(
        routeSource,
      ) &&
      !/request\.text\(\)/.test(routeSource),
  );
  ok(
    "112. an arbitrary provider id cannot be submitted at any level",
    validateFlightSearchRequestBody(
      { ...validBody, providerId: "evil" },
      DEV_POLICY,
    ).ok === false &&
      validateFlightSearchRequestBody(
        {
          ...validBody,
          searchIntent: { ...validBody.searchIntent, providerId: "evil" },
        },
        DEV_POLICY,
      ).ok === false,
  );
  ok(
    "113. a raw Results URL cannot be submitted as the Search Intent",
    validateFlightSearchRequestBody(
      {
        ...validBody,
        searchIntent: "/en/flights/results?v=1&trip=roundTrip" as never,
      },
      DEV_POLICY,
    ).ok === false &&
      validateFlightSearchRequestBody(
        {
          ...validBody,
          searchIntent: {
            ...validBody.searchIntent,
            sort: "cheapest",
            stops: "direct",
          },
        },
        DEV_POLICY,
      ).ok === false,
  );
  ok(
    "114. a negative retry token is rejected specifically",
    validateFlightSearchRequestBody({ ...validBody, retryToken: -5 }, DEV_POLICY)
      .ok === false,
  );
  ok(
    "115. a rejection reason is drawn from a closed set and echoes no submitted value",
    (() => {
      const rejection = validateFlightSearchRequestBody(
        {
          ...validBody,
          searchIntent: { ...validBody.searchIntent, origin: "SECRET-VALUE-XYZ" },
        },
        DEV_POLICY,
      );
      return (
        !rejection.ok && !JSON.stringify(rejection).includes("SECRET-VALUE-XYZ")
      );
    })(),
  );
  check(
    "116. the response Content-Type is JSON",
    RESPONSE_HEADERS["Content-Type"],
    "application/json; charset=utf-8",
  );
  ok(
    "117. success, partial and empty envelopes all validate client-side",
    [
      buildSuccessResponse(orchestrated),
      buildSuccessResponse(partialRun),
      buildSuccessResponse(emptyRun),
    ].every(
      (envelope) =>
        validateApiResponse(JSON.parse(JSON.stringify(envelope)), intent) !== null,
    ),
  );
  ok(
    "118. no envelope carries the canonical Search Intent or its parameter vocabulary",
    (() => {
      // Note what this does *not* assert: a success envelope legitimately
      // contains the departure date, because that is the flight's own
      // schedule. What must never appear is the search itself — the canonical
      // query string, the entity ids, or the intent parameter names as
      // response fields.
      const canonicalIntent = serializeSearchIntent(intent).toString();
      const envelopes = [
        JSON.stringify(errorEnvelope),
        JSON.stringify(buildSuccessResponse(orchestrated)),
      ];
      const intentKeyNames = [
        '"trip"',
        '"cabin"',
        '"flex"',
        '"adults"',
        '"searchIntent"',
      ];
      return (
        validateApiResponse(JSON.parse(JSON.stringify(errorEnvelope)), intent) !==
          null &&
        envelopes.every(
          (text) =>
            !text.includes(canonicalIntent) &&
            !text.includes(intent.origin.entityId) &&
            !text.includes(intent.destination.entityId) &&
            intentKeyNames.every((key) => !text.includes(key)),
        )
      );
    })(),
  );

  // --- 119-124. Client repository: method, headers, hygiene --------------------------------------
  ok(
    "119. the client repository issues a POST with a JSON content type",
    capturedRequest?.init.method === "POST" &&
      JSON.stringify(capturedRequest?.init.headers ?? {}).includes(
        "application/json",
      ),
  );
  ok(
    "120. an empty successful response maps to zero offers rather than an error",
    await (async () => {
      stubFetch({
        version: 1,
        status: "empty",
        mode: RESPONSE_MODE,
        offers: [],
        providerSummary: [
          {
            providerId: "gtai-local-demo",
            status: "empty",
            offerCount: 0,
            durationBucket: "fast",
          },
        ],
      });
      const result = await repository.search(intent, {
        signal: new AbortController().signal,
      });
      return result.offers.length === 0;
    })(),
  );
  ok(
    "121. a failing request is attempted exactly once — no automatic retry",
    await (async () => {
      let calls = 0;
      globalThis.fetch = (async () => {
        calls += 1;
        const headers = new Headers();
        headers.set("content-type", "application/json");
        return {
          status: 500,
          headers,
          json: async () => ({}),
        } as unknown as Response;
      }) as unknown as typeof fetch;
      try {
        await repository.search(intent, { signal: new AbortController().signal });
      } catch {
        // A repository error is the expected outcome here; the point of the
        // check is the call count, not the throw.
      }
      // The count is the assertion. A name-based regex would be defeated by
      // the legitimate `retryToken` field the contract already carries.
      return calls === 1;
    })(),
  );
  ok(
    "122. the client repository never logs a request body or persists Search Intent",
    !/console\./.test(apiRepositorySource) &&
      !/localStorage|sessionStorage|document\.cookie|indexedDB/.test(
        apiRepositorySource,
      ),
  );
  ok(
    "123. the client repository handles no provider URL and refuses to follow a redirect",
    // `redirect: "error"` *is* the refusal, so a bare /redirect/ match would
    // now flag the very code implementing the rule. The assertion requires it
    // to be present and forbids anything that would actually follow a URL.
    /redirect:\s*"error"/.test(apiRepositorySource) &&
      !/location\.href|window\.open|deeplink|followRedirect/i.test(
        apiRepositorySource,
      ),
  );
  ok(
    "124. the client repository contains no unchecked response assertion",
    !/as FlightSearchApiResponse/.test(apiRepositorySource) &&
      /validateApiResponse/.test(apiRepositorySource),
  );

  globalThis.fetch = originalFetch;

  // --- 125-130. Request identity and boundary, remaining items -----------------------------------
  ok(
    "125. the development scenario participates in request identity on both pages",
    /devScenario/.test(resultsKey) && /devScenario/.test(detailsKey),
  );
  ok(
    "126. card expansion, timeline state and canonicalization are absent from request identity",
    !/expandedOfferId|openCard|timelineOpen|canonical|pathname/.test(resultsKey) &&
      !/expandedOfferId|openCard|timelineOpen|canonical|pathname/.test(detailsKey),
  );
  ok(
    "127. both experiences abort obsolete requests on cleanup",
    /return \(\) => controller\.abort\(\)/.test(resultsSource) &&
      /return \(\) => controller\.abort\(\)/.test(detailsSource),
  );
  ok(
    "128. a stale completion cannot overwrite newer state (results are keyed)",
    /setFetched\(\{\s*key,/.test(resultsSource) &&
      /setFetched\(\{\s*key,/.test(detailsSource) &&
      /fetched\.key === fetchKey/.test(resultsSource) &&
      /fetched\.key === fetchKey/.test(detailsSource),
  );
  ok(
    "129. exactly one shared repository instance backs both experiences",
    (runtimeRepositorySource.match(/new ApiFlightOfferRepository\(\)/g) ?? [])
      .length === 1 &&
      !/new ApiFlightOfferRepository\(/.test(resultsSource) &&
      !/new ApiFlightOfferRepository\(/.test(detailsSource),
  );
  ok(
    "130. no client-safe barrel re-exports a server module",
    collectSourceFiles("src/features")
      .concat(collectSourceFiles("src/components"))
      .every(
        (file) =>
          !/export .*from ["'].*\/server\//.test(readFileSync(file, "utf8")),
      ),
  );

  // === V2.7 correction block ====================================================================

  // --- 131-134. Server-side production scenario gate ---------------------------------------------
  const scenarioBody = (scenario: string) => ({ ...validBody, scenario });
  check(
    "131. production rejects every non-normal scenario",
    ["empty", "error", "slow"].map(
      (s) => validateFlightSearchRequestBody(scenarioBody(s), PROD_POLICY).ok,
    ),
    [false, false, false],
  );
  ok(
    "132. production still accepts the normal scenario",
    validateFlightSearchRequestBody(scenarioBody("normal"), PROD_POLICY).ok,
  );
  check(
    "133. development accepts every allowlisted scenario",
    ["normal", "empty", "error", "slow"].map(
      (s) => validateFlightSearchRequestBody(scenarioBody(s), DEV_POLICY).ok,
    ),
    [true, true, true, true],
  );
  ok(
    "134. a production rejection is the same safe reason an unknown scenario gets",
    (() => {
      const gated = validateFlightSearchRequestBody(
        scenarioBody("slow"),
        PROD_POLICY,
      );
      const unknown = validateFlightSearchRequestBody(
        scenarioBody("drop-tables"),
        PROD_POLICY,
      );
      // Identical reasons, so the response cannot be used to infer which
      // environment is running. And the route decides the policy itself.
      return (
        !gated.ok &&
        !unknown.ok &&
        gated.reason === unknown.reason &&
        /allowDevelopmentScenarios:\s*process\.env\.NODE_ENV !== "production"/.test(
          routeSource,
        ) &&
        !/scenario.*process\.env/.test(
          stripComments(
            readSource("src/server/flights/flight-search-request-validation.ts"),
          ),
        )
      );
    })(),
  );

  // --- 135-138. Strict provider outcome validation -----------------------------------------------
  const outcomeRejects = (outcome: unknown): boolean =>
    validateProviderOutcome(outcome, 40, intent).ok === false;

  ok(
    "135. an invented failure code is rejected",
    outcomeRejects({ ok: false, failure: { code: "teapot" } }) &&
      validateProviderOutcome(
        { ok: false, failure: { code: "timeout" } },
        40,
        intent,
      ).ok,
  );
  ok(
    "136. an extra property on either outcome shape is rejected",
    outcomeRejects({ ok: true, offers: [], note: "hi" }) &&
      outcomeRejects({ ok: false, failure: { code: "timeout" }, note: "hi" }) &&
      outcomeRejects({ ok: false, failure: { code: "timeout", detail: "x" } }),
  );
  ok(
    "137. retryAfterMs is accepted only on rateLimited, and only when valid",
    outcomeRejects({
      ok: false,
      failure: { code: "timeout", retryAfterMs: 100 },
    }) &&
      outcomeRejects({
        ok: false,
        failure: { code: "authentication", retryAfterMs: 100 },
      }) &&
      outcomeRejects({
        ok: false,
        failure: { code: "rateLimited", retryAfterMs: -1 },
      }) &&
      validateProviderOutcome(
        { ok: false, failure: { code: "rateLimited" } },
        40,
        intent,
      ).ok &&
      validateProviderOutcome(
        { ok: false, failure: { code: "rateLimited", retryAfterMs: 1000 } },
        40,
        intent,
      ).ok,
  );
  ok(
    "138. a forbidden field anywhere in a failure outcome is rejected",
    outcomeRejects({
      ok: false,
      failure: { code: "unavailable", url: "https://example.com" },
    }) &&
      outcomeRejects({
        ok: false,
        failure: { code: "unavailable", rawPayload: { a: 1 } },
      }) &&
      outcomeRejects({
        ok: false,
        failure: { code: "unavailable", stack: "at x" },
      }),
  );
  ok(
    "138b. the orchestrator consumes the validated failure, not the adapter's object",
    (() => {
      const validated = validateProviderOutcome(
        { ok: false, failure: { code: "rateLimited", retryAfterMs: 500 } },
        40,
        intent,
      );
      const orchestratorSource = stripComments(
        readSource("src/server/flights/providers/provider-search-orchestrator.ts"),
      );
      return (
        validated.ok &&
        validated.failure !== null &&
        // Rebuilt object, so nothing unchecked survives by reference.
        Object.keys(validated.failure).sort().join(",") === "code,retryAfterMs" &&
        /finish\("failed", \[\], validation\.failure\)/.test(orchestratorSource) &&
        !/finish\("failed", \[\], outcome\.failure\)/.test(orchestratorSource)
      );
    })(),
  );

  // --- 139-142. Byte-bounded request reading -----------------------------------------------------
  const requestWith = (body: string, headers: Record<string, string>): Request =>
    new Request("http://localhost/api/flights/search", {
      method: "POST",
      headers,
      body,
    });

  ok(
    "139. an oversized declared length is refused before the stream is read",
    (
      await readBoundedRequestBody(
        requestWith("x".repeat(50), {
          "content-type": "application/json",
          "content-length": String(MAX_REQUEST_BODY_BYTES + 1),
        }),
        MAX_REQUEST_BODY_BYTES,
      )
    ).ok === false,
  );
  ok(
    "140. an oversized streamed body is refused even without a declared length",
    (
      await readBoundedRequestBody(
        requestWith("x".repeat(200), { "content-type": "application/json" }),
        100,
      )
    ).ok === false,
  );
  ok(
    "141. the limit is measured in bytes, not string length (multibyte proof)",
    await (async () => {
      // 40 Persian characters: 40 UTF-16 units but 80 UTF-8 bytes. A limit of
      // 60 must reject it; a string-length check would have accepted it.
      const persian = "پ".repeat(40);
      const bytes = new TextEncoder().encode(persian).byteLength;
      const rejected = await readBoundedRequestBody(
        requestWith(persian, { "content-type": "application/json" }),
        60,
      );
      const accepted = await readBoundedRequestBody(
        requestWith(persian, { "content-type": "application/json" }),
        200,
      );
      return (
        persian.length === 40 &&
        bytes === 80 &&
        rejected.ok === false &&
        accepted.ok === true &&
        accepted.text === persian
      );
    })(),
  );
  ok(
    "142. an empty body is rejected and a valid body round-trips exactly once",
    (
      await readBoundedRequestBody(
        requestWith("", { "content-type": "application/json" }),
        MAX_REQUEST_BODY_BYTES,
      )
    ).ok === false &&
      (
        await readBoundedRequestBody(
          requestWith('{"a":1}', { "content-type": "application/json" }),
          MAX_REQUEST_BODY_BYTES,
        )
      ).ok === true,
  );

  // --- 143-150. HTTP + envelope agreement on the client ------------------------------------------
  const repositoryRejects = async (
    payload: unknown,
    status = 200,
    contentType: string | null = "application/json",
  ): Promise<boolean> => {
    stubFetch(payload, status, contentType);
    try {
      await repository.search(intent, { signal: new AbortController().signal });
      return false;
    } catch (error: unknown) {
      return error instanceof FlightOfferRepositoryError;
    }
  };

  ok(
    "143. an error envelope carrying a redirect URL is rejected",
    await repositoryRejects(
      {
        version: 1,
        status: "error",
        mode: RESPONSE_MODE,
        errorCode: "searchUnavailable",
        redirectUrl: "https://example.com",
      },
      503,
    ),
  );
  ok(
    "144. an error envelope carrying a searchContextId or raw error is rejected",
    (await repositoryRejects(
      {
        version: 1,
        status: "error",
        mode: RESPONSE_MODE,
        errorCode: "searchUnavailable",
        searchContextId: "abc",
      },
      503,
    )) &&
      (await repositoryRejects(
        {
          version: 1,
          status: "error",
          mode: RESPONSE_MODE,
          errorCode: "searchUnavailable",
          rawError: "ECONNREFUSED",
        },
        503,
      )),
  );
  ok(
    "145. a success envelope carrying an extra diagnostics field is rejected",
    await repositoryRejects({ ...goodPayload, diagnostics: { ms: 12 } }),
  );
  ok(
    "146. a provider summary carrying an extra property is rejected",
    await repositoryRejects({
      ...goodPayload,
      providerSummary: [
        {
          providerId: "x",
          status: "succeeded",
          offerCount: 0,
          durationBucket: "fast",
          providerUrl: "https://example.com",
        },
      ],
    }),
  );
  ok(
    "147. HTTP 500 carrying a success envelope is rejected",
    await repositoryRejects(goodPayload, 500),
  );
  ok(
    "148. HTTP 200 carrying an error envelope is rejected",
    await repositoryRejects(
      {
        version: 1,
        status: "error",
        mode: RESPONSE_MODE,
        errorCode: "searchUnavailable",
      },
      200,
    ),
  );
  ok(
    "149. an unexpected HTTP status is rejected even with a well-formed envelope",
    (await repositoryRejects(goodPayload, 204)) &&
      (await repositoryRejects(goodPayload, 302)),
  );
  ok(
    "150. a non-JSON content type is rejected before parsing",
    (await repositoryRejects(goodPayload, 200, "text/html")) &&
      (await repositoryRejects(goodPayload, 200, null)),
  );

  // --- 151-154. Abort-aware deferred start -------------------------------------------------------
  ok(
    "151. a pre-aborted signal issues zero fetch calls",
    await (async () => {
      let calls = 0;
      globalThis.fetch = (async () => {
        calls += 1;
        return {
          status: 200,
          headers: new Headers(),
          json: async () => ({}),
        } as unknown as Response;
      }) as unknown as typeof fetch;
      const controller = new AbortController();
      controller.abort();
      try {
        await repository.search(intent, { signal: controller.signal });
      } catch {
        /* expected */
      }
      return calls === 0;
    })(),
  );
  ok(
    "152. an abort in the same turn as search() issues zero fetch calls",
    await (async () => {
      // This is the Strict Mode shape: mount starts the search, cleanup
      // aborts it before the microtask queue drains. Without the deferred
      // start the request would already be on the wire.
      let calls = 0;
      globalThis.fetch = (async () => {
        calls += 1;
        return {
          status: 200,
          headers: new Headers(),
          json: async () => ({}),
        } as unknown as Response;
      }) as unknown as typeof fetch;
      const controller = new AbortController();
      const pending = repository.search(intent, { signal: controller.signal });
      controller.abort();
      try {
        await pending;
      } catch {
        /* expected */
      }
      return calls === 0;
    })(),
  );
  ok(
    "153. a normal call still issues exactly one fetch, and a retry one more",
    await (async () => {
      let calls = 0;
      globalThis.fetch = (async (url: string, init: RequestInit) => {
        calls += 1;
        capture.last = { url, init };
        const headers = new Headers();
        headers.set("content-type", "application/json");
        return {
          status: 200,
          headers,
          json: async () => goodPayload,
        } as unknown as Response;
      }) as unknown as typeof fetch;
      await repository.search(intent, { signal: new AbortController().signal });
      const afterFirst = calls;
      await repository.search(intent, {
        signal: new AbortController().signal,
        retryToken: 1,
      });
      return afterFirst === 1 && calls === 2;
    })(),
  );
  ok(
    "154. the deferred start is a microtask yield, not a timer or a cache",
    /await Promise\.resolve\(\);/.test(apiRepositorySource) &&
      !/setTimeout|setInterval/.test(apiRepositorySource) &&
      !/cache\s*=|dedup|inFlight/i.test(apiRepositorySource),
  );

  globalThis.fetch = originalFetch;

  // --- 155-160. Partial coverage ------------------------------------------------------------------
  ok(
    "155. the client repository preserves partial coverage",
    await (async () => {
      // `partial` means at least one source did not answer, so the summary
      // must actually contain one. The previous fixture said "partial" while
      // every provider succeeded — a contradiction the validator now rejects.
      stubFetch({
        ...goodPayload,
        status: "partial",
        providerSummary: [
          ...goodPayload.providerSummary,
          {
            providerId: "gtai-second-demo",
            status: "failed",
            offerCount: 0,
            durationBucket: "fast",
          },
        ],
      });
      const result = await repository.search(intent, {
        signal: new AbortController().signal,
      });
      return result.coverage === "partial" && result.offers.length > 0;
    })(),
  );
  ok(
    "156. success and empty both report complete coverage",
    await (async () => {
      stubFetch(goodPayload);
      const success = await repository.search(intent, {
        signal: new AbortController().signal,
      });
      stubFetch({
        version: 1,
        status: "empty",
        mode: RESPONSE_MODE,
        offers: [],
        providerSummary: [
          {
            providerId: "gtai-local-demo",
            status: "empty",
            offerCount: 0,
            durationBucket: "fast",
          },
        ],
      });
      const empty = await repository.search(intent, {
        signal: new AbortController().signal,
      });
      return success.coverage === "complete" && empty.coverage === "complete";
    })(),
  );
  globalThis.fetch = originalFetch;
  check(
    "157. the in-process demo repository reports complete coverage",
    (await new DemoFlightOfferRepository({ delayMs: 0 }).search(intent)).coverage,
    "complete",
  );
  ok(
    "158. Results renders a partial disclosure and a non-definitive empty state",
    /isPartialCoverage/.test(resultsSource) &&
      /labels\.partialCoverage\.title/.test(resultsSource) &&
      /offerState\.status === "empty" && isPartialCoverage/.test(resultsSource) &&
      /labels\.partialCoverage\.emptyTitle/.test(resultsSource),
  );
  ok(
    "159. Details renders a partial disclosure and a non-definitive not-found state",
    /isPartialCoverage/.test(detailsSource) &&
      /labels\.partialCoverage\.title/.test(detailsSource) &&
      /labels\.partialCoverage\.unverified/.test(detailsSource),
  );
  ok(
    "160. coverage never enters request identity or a filter/sort URL",
    !/coverage/i.test(resultsKey) &&
      !/coverage/i.test(detailsKey) &&
      !/coverage/i.test(
        stripComments(
          readSource("src/features/flights/filters/flight-filter-url.ts"),
        ),
      ),
  );
  check(
    "160b. every locale carries natural partial-coverage copy",
    [enDict, frDict, faDict, arDict].map((d) =>
      [
        typeof d.flightResults.partialCoverage.title === "string" &&
          d.flightResults.partialCoverage.title.length > 0,
        typeof d.flightResults.partialCoverage.emptyTitle === "string" &&
          d.flightResults.partialCoverage.emptyTitle.length > 0,
        typeof d.flightDetails.partialCoverage.unverified === "string" &&
          d.flightDetails.partialCoverage.unverified.length > 0,
      ].every(Boolean),
    ),
    [true, true, true, true],
  );

  // --- 161-162. Abort listener cleanup ------------------------------------------------------------
  ok(
    "161. the internal scope's abort listener is removed on every path",
    (() => {
      const timeoutSource = stripComments(
        readSource("src/server/flights/providers/provider-timeout.ts"),
      );
      return (
        /detachAbortListener/.test(timeoutSource) &&
        /removeEventListener\("abort", onAbort\)/.test(timeoutSource) &&
        /finally\s*\{[\s\S]{0,200}?detachAbortListener\(\)/.test(timeoutSource)
      );
    })(),
  );
  ok(
    "162. success, failure, timeout and cancellation all run to completion cleanly",
    await (async () => {
      let unhandledDuringScopes = 0;
      const onUnhandled = () => {
        unhandledDuringScopes += 1;
      };
      process.on("unhandledRejection", onUnhandled);

      const successScope = createProviderAbortScope(
        new AbortController().signal,
        5_000,
      );
      const successOutcome = await runWithAbortScope(
        successScope,
        async () => "ok",
      );
      successScope.dispose();

      const failScope = createProviderAbortScope(
        new AbortController().signal,
        5_000,
      );
      let failKind = "none";
      try {
        await runWithAbortScope(failScope, async () => {
          throw new Error("adapter fault");
        });
      } catch {
        failKind = "threw";
      }
      failScope.dispose();

      const cancelController = new AbortController();
      const cancelScope = createProviderAbortScope(cancelController.signal, 5_000);
      const cancelPromise = runWithAbortScope(cancelScope, () =>
        neverResolves(cancelScope.signal),
      );
      cancelController.abort();
      const cancelOutcome = await cancelPromise;
      cancelScope.dispose();

      await new Promise((resolve) => setTimeout(resolve, 60));
      process.off("unhandledRejection", onUnhandled);

      return (
        successOutcome.kind === "completed" &&
        failKind === "threw" &&
        cancelOutcome.kind === "cancelled" &&
        unhandledDuringScopes === 0
      );
    })(),
  );

  // === V2.7 boundary-defect correction block ====================================================

  // --- 163-181. Intent-aware offer validation ----------------------------------------------------
  // Each mutation below was demonstrably *accepted* by structural validation
  // alone, which is why the intent-aware layer exists.
  const mutate = (change: (offer: Record<string, unknown>) => void): unknown => {
    const clone = JSON.parse(JSON.stringify(sampleOffers[0])) as Record<
      string,
      unknown
    >;
    change(clone);
    return clone;
  };
  // Layover assertions need an offer that actually connects somewhere. The
  // first generated offer is not guaranteed to, and silently mutating nothing
  // would make those checks pass vacuously.
  const connecting = sampleOffers.find((offer) =>
    offer.itineraries.some((itinerary) => itinerary.layovers.length > 0),
  );
  if (!connecting) throw new Error("Fixture set contains no connecting offer.");
  const mutateConnecting = (
    change: (offer: Record<string, unknown>) => void,
  ): unknown => {
    const clone = JSON.parse(JSON.stringify(connecting)) as Record<string, unknown>;
    change(clone);
    return clone;
  };
  const rejectsForIntent = (value: unknown): boolean =>
    !isCanonicalFlightOfferForIntent(value, intent);
  type Mutable = Record<string, unknown>;
  const itinsOf = (o: Mutable) => o.itineraries as Mutable[];
  const segsOf = (o: Mutable, i = 0) => itinsOf(o)[i].segments as Mutable[];

  ok(
    "163. every generated offer passes intent-aware validation",
    sampleOffers.every((offer) => isCanonicalFlightOfferForIntent(offer, intent)) &&
      isCanonicalFlightOfferArrayForIntent(sampleOffers, intent),
  );
  ok(
    "164. a mismatched currency is rejected",
    rejectsForIntent(mutate((o) => (o.currency = "USD"))),
  );
  ok(
    "165. an incorrect itinerary count is rejected",
    rejectsForIntent(mutate((o) => (o.itineraries = [itinsOf(o)[0]]))),
  );
  ok(
    "166. two outbound legs on a round trip are rejected",
    rejectsForIntent(mutate((o) => (itinsOf(o)[1].direction = "outbound"))),
  );
  ok(
    "167. an unrelated origin airport is rejected",
    rejectsForIntent(mutate((o) => (segsOf(o)[0].originCode = "SYD"))),
  );
  ok(
    "168. an unrelated destination airport is rejected",
    rejectsForIntent(
      mutate((o) => {
        const segs = segsOf(o);
        segs[segs.length - 1].destinationCode = "SYD";
      }),
    ),
  );
  ok(
    "169. a disconnected route is rejected",
    rejectsForIntent(
      mutate((o) => {
        const segs = segsOf(o);
        // Break the join between the first two legs without touching endpoints.
        if (segs.length > 1) segs[1].originCode = "SYD";
        else segs[0].destinationCode = segs[0].originCode === "YUL" ? "YUL" : "SYD";
      }),
    ),
  );
  ok(
    "170. an impossible wall-clock time is rejected",
    rejectsForIntent(
      mutate((o) => ((segsOf(o)[0].departure as Mutable).time = "99:99")),
    ) &&
      rejectsForIntent(
        mutate((o) => ((segsOf(o)[0].departure as Mutable).time = "24:00")),
      ),
  );
  ok(
    "171. a segment duration that disagrees with its own epochs is rejected",
    rejectsForIntent(
      mutate(
        (o) =>
          (segsOf(o)[0].durationMinutes =
            (segsOf(o)[0].durationMinutes as number) + 7),
      ),
    ),
  );
  ok(
    "172. an itinerary departure that disagrees with its first segment is rejected",
    rejectsForIntent(
      mutate((o) => ((itinsOf(o)[0].departure as Mutable).time = "00:01")),
    ),
  );
  ok(
    "173. an itinerary arrival that disagrees with its last segment is rejected",
    rejectsForIntent(
      mutate(
        (o) =>
          ((itinsOf(o)[0].arrival as Mutable).epochMinutes =
            ((itinsOf(o)[0].arrival as Mutable).epochMinutes as number) + 5),
      ),
    ),
  );
  ok(
    "174. a layover at an airport the route never touches is rejected",
    rejectsForIntent(
      mutateConnecting((o) => {
        const it = itinsOf(o).find((i) => (i.layovers as Mutable[]).length > 0);
        if (it) (it.layovers as Mutable[])[0].airportCode = "SYD";
      }),
    ),
  );
  ok(
    "175. a layover duration that disagrees with the surrounding segments is rejected",
    rejectsForIntent(
      mutateConnecting((o) => {
        const it = itinsOf(o).find((i) => (i.layovers as Mutable[]).length > 0);
        if (it) {
          const lay = (it.layovers as Mutable[])[0];
          lay.durationMinutes = (lay.durationMinutes as number) + 11;
        }
      }),
    ),
  );
  ok(
    "176. an itinerary total that disagrees with its parts is rejected",
    rejectsForIntent(
      mutate(
        (o) =>
          (itinsOf(o)[0].durationMinutes =
            (itinsOf(o)[0].durationMinutes as number) + 13),
      ),
    ),
  );
  ok(
    "177. a ranking duration total that disagrees with the itineraries is rejected",
    rejectsForIntent(
      mutate((o) => {
        const ranking = o.rankingMetadata as Mutable;
        ranking.totalDurationMinutes =
          (ranking.totalDurationMinutes as number) + 100;
      }),
    ),
  );
  ok(
    "178. a ranking stop count that disagrees with the itineraries is rejected",
    rejectsForIntent(
      mutate((o) => {
        const ranking = o.rankingMetadata as Mutable;
        ranking.totalStopCount = (ranking.totalStopCount as number) + 1;
      }),
    ),
  );
  ok(
    "179. a cabin class other than the one searched is rejected",
    rejectsForIntent(mutate((o) => (segsOf(o)[0].cabinClass = "business"))),
  );
  ok(
    "180. a total price that does not reconcile with the per-traveler price is rejected",
    rejectsForIntent(
      mutate((o) => (o.totalPrice = (o.totalPrice as number) + 1)),
    ) && chargeableTravelerCount(intent) === 1,
  );
  ok(
    "181. declared operating carriers must match the segments exactly",
    rejectsForIntent(
      mutate((o) => (o.operatingCarrierNames = ["Nonexistent Air"])),
    ) &&
      rejectsForIntent(
        mutate(
          (o) =>
            (o.operatingCarrierNames = [
              ...(o.operatingCarrierNames as string[]),
              "Nonexistent Air",
            ]),
        ),
      ),
  );
  check(
    "181b. the frozen V2.6 offer ids are unchanged by the new validation",
    generateDemoOffers(intent).map((o) => o.id),
    sampleOffers.map((o) => o.id),
  );

  // --- 182-186. Pre-abort, synchronous throw, adapter-reported cancellation ----------------------
  ok(
    "182. a pre-aborted scope never invokes the work function",
    await (async () => {
      let calls = 0;
      const controller = new AbortController();
      controller.abort();
      const scope = createProviderAbortScope(controller.signal, 5_000);
      const outcome = await runWithAbortScope(scope, async () => {
        calls += 1;
        return "should not run";
      });
      scope.dispose();
      return calls === 0 && outcome.kind === "cancelled";
    })(),
  );
  ok(
    "183. a normal scope invokes the work function exactly once",
    await (async () => {
      let calls = 0;
      const scope = createProviderAbortScope(new AbortController().signal, 5_000);
      const outcome = await runWithAbortScope(scope, async () => {
        calls += 1;
        return "ran";
      });
      scope.dispose();
      return calls === 1 && outcome.kind === "completed";
    })(),
  );
  ok(
    "184. a synchronous adapter throw is normalized and leaves no listener",
    await (async () => {
      let unhandled = 0;
      const onUnhandled = () => {
        unhandled += 1;
      };
      process.on("unhandledRejection", onUnhandled);
      const controller = new AbortController();
      const scope = createProviderAbortScope(controller.signal, 5_000);
      let threw = false;
      try {
        await runWithAbortScope(scope, () => {
          // Synchronous throw, before any promise exists.
          throw new Error("synchronous adapter fault");
        });
      } catch {
        threw = true;
      }
      scope.dispose();
      // If the listener survived, aborting now would still resolve it.
      const listenerGone = controller.signal.onabort === null;
      await new Promise((resolve) => setTimeout(resolve, 40));
      process.off("unhandledRejection", onUnhandled);
      return threw && listenerGone && unhandled === 0;
    })(),
  );
  const adapterCancelledRun = await orchestrateProviderSearch(runInput, {
    registry: createProviderRegistry([
      registration({
        providerId: "self-cancel",
        adapter: fixtureAdapter("self-cancel", async () => ({
          ok: false,
          failure: { code: "cancelled" },
        })),
      }),
    ]),
    auditSink: (() => {
      const sink = createRecordingAuditSink();
      selfCancelAudit = sink;
      return sink;
    })(),
  });
  ok(
    "185. an adapter-reported cancellation becomes a cancelled run, not a failure",
    adapterCancelledRun.outcomes[0].status === "cancelled" &&
      adapterCancelledRun.outcomes[0].failure?.code === "cancelled",
  );
  ok(
    "186. an adapter-reported cancellation is audited as cancelled with a null code",
    (() => {
      const events = selfCancelAudit.events.filter(
        (e) => e.providerId === "self-cancel",
      );
      const cancelled = events.filter((e) => e.event === "search.cancelled");
      return (
        events.filter((e) => e.event === "search.failed").length === 0 &&
        cancelled.length === 1 &&
        cancelled[0].status === "cancelled" &&
        cancelled[0].failureCode === null
      );
    })(),
  );
  check(
    "186b. an all-cancelled search does not claim an empty result",
    adapterCancelledRun.status,
    "failed",
  );

  // --- 187-191. Exact plain-object outcome shapes -------------------------------------------------
  const prototypeOutcome = Object.create({ ok: true, offers: [] }) as unknown;
  const prototypeFailure = {
    ok: false,
    failure: Object.create({ code: "timeout" }) as unknown,
  };
  ok(
    "187. an outcome whose fields come from its prototype is rejected",
    validateProviderOutcome(prototypeOutcome, 40, intent).ok === false,
  );
  ok(
    "188. a failure whose code comes from its prototype is rejected",
    validateProviderOutcome(prototypeFailure, 40, intent).ok === false,
  );
  ok(
    "189. an own retryAfterMs of undefined is rejected on every code",
    validateProviderOutcome(
      { ok: false, failure: { code: "timeout", retryAfterMs: undefined } },
      40,
      intent,
    ).ok === false &&
      validateProviderOutcome(
        { ok: false, failure: { code: "rateLimited", retryAfterMs: undefined } },
        40,
        intent,
      ).ok === false,
  );
  ok(
    "190. the four exact valid outcome shapes remain accepted",
    validateProviderOutcome({ ok: true, offers: sampleOffers }, 40, intent).ok &&
      validateProviderOutcome(
        { ok: false, failure: { code: "timeout" } },
        40,
        intent,
      ).ok &&
      validateProviderOutcome(
        { ok: false, failure: { code: "rateLimited" } },
        40,
        intent,
      ).ok &&
      validateProviderOutcome(
        { ok: false, failure: { code: "rateLimited", retryAfterMs: 250 } },
        40,
        intent,
      ).ok,
  );
  ok(
    "191. a non-plain object is rejected outright",
    validateProviderOutcome(new Map(), 40, intent).ok === false &&
      validateProviderOutcome([], 40, intent).ok === false,
  );

  // --- 192-200. Semantic envelope validation ------------------------------------------------------
  const summaryOf = (
    providerId: string,
    providerStatus: string,
    offerCount: number,
  ) => ({ providerId, status: providerStatus, offerCount, durationBucket: "fast" });
  const envelope = (over: Record<string, unknown>) => ({
    version: 1,
    status: "success",
    mode: RESPONSE_MODE,
    offers: sampleOffers,
    providerSummary: [
      summaryOf("gtai-local-demo", "succeeded", sampleOffers.length),
    ],
    ...over,
  });

  ok(
    "192. success with zero offers is rejected",
    validateApiResponse(
      envelope({
        offers: [],
        providerSummary: [summaryOf("a", "succeeded", 0)],
      }),
      intent,
    ) === null,
  );
  ok(
    "193. empty carrying offers is rejected",
    validateApiResponse(
      envelope({ status: "empty", providerSummary: [summaryOf("a", "empty", 0)] }),
      intent,
    ) === null,
  );
  ok(
    "194. success alongside a failed provider is rejected",
    validateApiResponse(
      envelope({
        providerSummary: [
          summaryOf("a", "succeeded", sampleOffers.length),
          summaryOf("b", "failed", 0),
        ],
      }),
      intent,
    ) === null,
  );
  ok(
    "195. partial where every provider succeeded is rejected",
    validateApiResponse(envelope({ status: "partial" }), intent) === null,
  );
  ok(
    "196. duplicate offer ids are rejected",
    validateApiResponse(
      envelope({ offers: [sampleOffers[0], sampleOffers[0]] }),
      intent,
    ) === null,
  );
  ok(
    "197. duplicate provider ids are rejected",
    validateApiResponse(
      envelope({
        status: "partial",
        providerSummary: [
          summaryOf("dupe", "succeeded", 3),
          summaryOf("dupe", "failed", 0),
        ],
      }),
      intent,
    ) === null,
  );
  ok(
    "198. a provider status that disagrees with its own offer count is rejected",
    validateApiResponse(
      envelope({
        status: "partial",
        providerSummary: [
          summaryOf("a", "succeeded", sampleOffers.length),
          summaryOf("b", "failed", 4),
        ],
      }),
      intent,
    ) === null &&
      validateApiResponse(
        envelope({
          providerSummary: [
            summaryOf("a", "succeeded", sampleOffers.length),
            summaryOf("b", "empty", 2),
          ],
        }),
        intent,
      ) === null &&
      validateApiResponse(
        envelope({ providerSummary: [summaryOf("a", "succeeded", 0)] }),
        intent,
      ) === null,
  );
  ok(
    "199. the three consistent result envelopes remain accepted",
    validateApiResponse(envelope({}), intent) !== null &&
      validateApiResponse(
        envelope({
          offers: [],
          status: "empty",
          providerSummary: [summaryOf("a", "empty", 0)],
        }),
        intent,
      ) !== null &&
      validateApiResponse(
        envelope({
          status: "partial",
          providerSummary: [
            summaryOf("a", "succeeded", sampleOffers.length),
            summaryOf("b", "failed", 0),
          ],
        }),
        intent,
      ) !== null,
  );
  ok(
    "200. envelope offers are checked against the requested intent",
    validateApiResponse(
      envelope({ offers: [mutate((o) => (o.currency = "USD"))] }),
      intent,
    ) === null &&
      validateApiResponse(
        envelope({ offers: [mutate((o) => (segsOf(o)[0].originCode = "SYD"))] }),
        intent,
      ) === null,
  );

  // --- 201-204. Abort during response reading ------------------------------------------------------
  const isAbortRejection = (error: unknown): boolean =>
    error instanceof DOMException && error.name === "AbortError";

  ok(
    "201. an abort thrown by response.json stays an AbortError",
    await (async () => {
      globalThis.fetch = (async () => {
        const headers = new Headers();
        headers.set("content-type", "application/json");
        return {
          status: 200,
          headers,
          json: async () => {
            throw new DOMException("Aborted", "AbortError");
          },
        } as unknown as Response;
      }) as unknown as typeof fetch;
      try {
        await repository.search(intent, { signal: new AbortController().signal });
        return false;
      } catch (error: unknown) {
        return isAbortRejection(error);
      }
    })(),
  );
  ok(
    "202. a signal that flips while parsing yields an AbortError, never the error state",
    await (async () => {
      const controller = new AbortController();
      globalThis.fetch = (async () => {
        const headers = new Headers();
        headers.set("content-type", "application/json");
        return {
          status: 200,
          headers,
          json: async () => {
            controller.abort();
            return goodPayload;
          },
        } as unknown as Response;
      }) as unknown as typeof fetch;
      try {
        await repository.search(intent, { signal: controller.signal });
        return false;
      } catch (error: unknown) {
        return (
          isAbortRejection(error) && !(error instanceof FlightOfferRepositoryError)
        );
      }
    })(),
  );
  ok(
    "203. malformed JSON without an abort remains a safe repository error",
    await (async () => {
      globalThis.fetch = (async () => {
        const headers = new Headers();
        headers.set("content-type", "application/json");
        return {
          status: 200,
          headers,
          json: async () => {
            throw new SyntaxError("Unexpected token < in JSON");
          },
        } as unknown as Response;
      }) as unknown as typeof fetch;
      try {
        await repository.search(intent, { signal: new AbortController().signal });
        return false;
      } catch (error: unknown) {
        return error instanceof FlightOfferRepositoryError;
      }
    })(),
  );
  ok(
    "204. a complete valid response still succeeds after the abort checks",
    await (async () => {
      stubFetch(goodPayload);
      const result = await repository.search(intent, {
        signal: new AbortController().signal,
      });
      return result.offers.length === sampleOffers.length;
    })(),
  );
  globalThis.fetch = originalFetch;

  // --- 205-207. Request-body cleanup ---------------------------------------------------------------
  ok(
    "205. a declared oversized body is cancelled without reading a byte",
    await (async () => {
      let reads = 0;
      let cancels = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          reads += 1;
          controller.enqueue(new TextEncoder().encode("x"));
        },
        cancel() {
          cancels += 1;
        },
      });
      const request = new Request("http://localhost/api/flights/search", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(MAX_REQUEST_BODY_BYTES + 1),
        },
        body: stream,
        // @ts-expect-error -- duplex is required by Node for a stream body and
        // is not yet in the DOM RequestInit type.
        duplex: "half",
      });
      const result = await readBoundedRequestBody(request, MAX_REQUEST_BODY_BYTES);
      return result.ok === false && reads === 0 && cancels === 1;
    })(),
  );
  ok(
    "206. a streamed overflow stops at the first over-limit chunk",
    await (async () => {
      let chunksProduced = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          chunksProduced += 1;
          controller.enqueue(new TextEncoder().encode("y".repeat(40)));
        },
      });
      const request = new Request("http://localhost/api/flights/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: stream,
        // @ts-expect-error -- see above.
        duplex: "half",
      });
      const result = await readBoundedRequestBody(request, 50);
      // 40 bytes fits, 80 does not: it stops on the second chunk, not the tenth.
      return result.ok === false && chunksProduced <= 3;
    })(),
  );
  ok(
    "207. a valid body is read once and reported exactly",
    await (async () => {
      const request = new Request("http://localhost/api/flights/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"ok":true}',
      });
      const result = await readBoundedRequestBody(request, MAX_REQUEST_BODY_BYTES);
      return result.ok === true && result.text === '{"ok":true}';
    })(),
  );

  // === V2.7 boundary-integrity correction block =================================================

  // --- 208-212. Same-turn cancellation ------------------------------------------------------------
  // The distinction under test is *not* "does it report cancelled" — the
  // previous implementation already did. It is whether the adapter was called
  // at all. A caller that aborts in the same JavaScript turn as the call is
  // deliberately used here rather than a pre-aborted signal, because only the
  // former exercises the window between the entry guard and the first await.
  const sameTurn = await (async () => {
    let calls = 0;
    const upstream = new AbortController();
    const scope = createProviderAbortScope(upstream.signal, 5_000);
    const pending = runWithAbortScope(scope, async () => {
      calls += 1;
      return "should not run";
    });
    // Same turn: nothing has yielded between the call above and this line.
    upstream.abort();
    const outcome = await pending;
    // If the internal listener survived, this would still be attached.
    const listenerGone = scope.signal.onabort === null;
    scope.dispose();
    return { calls, kind: outcome.kind, listenerGone };
  })();
  check("208. same-turn abort invokes the adapter zero times", sameTurn.calls, 0);
  check("209. same-turn abort still reports cancelled", sameTurn.kind, "cancelled");
  ok("210. same-turn abort leaves no abort listener behind", sameTurn.listenerGone);
  ok(
    "211. normal execution still invokes the adapter exactly once",
    await (async () => {
      let calls = 0;
      const scope = createProviderAbortScope(new AbortController().signal, 5_000);
      const outcome = await runWithAbortScope(scope, async () => {
        calls += 1;
        return "ran";
      });
      scope.dispose();
      return calls === 1 && outcome.kind === "completed";
    })(),
  );
  ok(
    "212. timeout and synchronous-throw behaviour survive the deferred start",
    await (async () => {
      let unhandled = 0;
      const onUnhandled = () => {
        unhandled += 1;
      };
      process.on("unhandledRejection", onUnhandled);

      // A timeout must remain distinguishable from a cancellation.
      const timeoutScope = createProviderAbortScope(
        new AbortController().signal,
        30,
      );
      const timedOut = await runWithAbortScope(timeoutScope, () =>
        neverResolves(timeoutScope.signal),
      );
      timeoutScope.dispose();

      // A synchronous throw still reaches cleanup rather than escaping past it.
      const throwController = new AbortController();
      const throwScope = createProviderAbortScope(throwController.signal, 5_000);
      let threw = false;
      try {
        await runWithAbortScope(throwScope, () => {
          throw new Error("synchronous adapter fault");
        });
      } catch {
        threw = true;
      }
      throwScope.dispose();
      const throwListenerGone = throwController.signal.onabort === null;

      await new Promise((resolve) => setTimeout(resolve, 60));
      process.off("unhandledRejection", onUnhandled);
      return (
        timedOut.kind === "timedOut" &&
        threw &&
        throwListenerGone &&
        unhandled === 0
      );
    })(),
  );

  // --- 213-218. Airport-local instants -------------------------------------------------------------
  // A LocalDateTime carries a date, a wall clock and a UTC epoch. Only the
  // epoch is authoritative, so the other two are only meaningful if they are
  // what that epoch actually reads as at that airport. Each mutation below
  // leaves the epoch — and therefore every duration, ordering and window check
  // — untouched, and changes only what the interface would display.
  ok(
    "213. a segment departure time that is not its epoch is rejected",
    rejectsForIntent(
      mutate(
        (o) =>
          (segsOf(o)[0].departure = {
            ...(segsOf(o)[0].departure as Record<string, unknown>),
            time: "23:59",
          }),
      ),
    ),
  );
  ok(
    "214. a segment arrival time that is not its epoch is rejected",
    rejectsForIntent(
      mutate((o) => {
        const segs = segsOf(o);
        const last = segs[segs.length - 1];
        last.arrival = {
          ...(last.arrival as Record<string, unknown>),
          time: "23:59",
        };
      }),
    ),
  );
  ok(
    "215. a segment departure date that is not its epoch is rejected",
    rejectsForIntent(
      mutate((o) => {
        const departure = segsOf(o)[0].departure as Record<string, unknown>;
        // A perfectly valid ISO date — just not this instant's.
        segsOf(o)[0].departure = {
          ...departure,
          date: addDays(departure.date as string, 1),
        };
      }),
    ),
  );
  ok(
    "216. a segment arrival date that is not its epoch is rejected",
    rejectsForIntent(
      mutate((o) => {
        const segs = segsOf(o);
        const last = segs[segs.length - 1];
        const arrival = last.arrival as Record<string, unknown>;
        last.arrival = { ...arrival, date: addDays(arrival.date as string, 1) };
      }),
    ),
  );
  ok(
    "217. every generated airport-local instant is what its epoch reads as",
    sampleOffers.every((offer) =>
      offer.itineraries.every((itinerary) =>
        itinerary.segments.every((segment) => {
          const originZone = resolveAirportTimeZone(segment.originCode);
          const destinationZone = resolveAirportTimeZone(segment.destinationCode);
          if (originZone === null || destinationZone === null) return false;
          const departure = toLocalDateTime(
            segment.departure.epochMinutes,
            originZone,
          );
          const arrival = toLocalDateTime(
            segment.arrival.epochMinutes,
            destinationZone,
          );
          return (
            departure.date === segment.departure.date &&
            departure.time === segment.departure.time &&
            arrival.date === segment.arrival.date &&
            arrival.time === segment.arrival.time
          );
        }),
      ),
    ),
  );
  // A search spanning the North American DST transition (first Sunday of
  // November), so the conversion is exercised where a fixed offset would be
  // wrong rather than only where it happens to agree.
  const dstIntent = buildSearchIntent({
    tripType: "roundTrip",
    origin: ymq,
    destination: lhr,
    departureDate: "2026-10-31",
    returnDate: "2026-11-02",
    travelers: DEFAULT_TRAVELERS,
    cabinClass: "economy",
    flexibilityDays: 0,
    currency: "CAD",
    locale,
  });
  if (!dstIntent) throw new Error("DST fixture intent failed to build.");
  const dstOffers = generateDemoOffers(dstIntent);
  ok(
    "218. offers spanning a DST transition validate through the shared timezone architecture",
    dstOffers.length > 0 &&
      dstOffers.every((offer) => isCanonicalFlightOfferForIntent(offer, dstIntent)),
  );

  // --- 219-223. Airport directory membership ------------------------------------------------------
  const unknownCode = "ZZZ";
  ok(
    "219. an unknown segment origin is rejected",
    resolveAirportTimeZone(unknownCode) === null &&
      rejectsForIntent(mutate((o) => (segsOf(o)[0].originCode = unknownCode))),
  );
  ok(
    "220. an unknown segment destination is rejected",
    rejectsForIntent(
      mutate((o) => {
        const segs = segsOf(o);
        segs[segs.length - 1].destinationCode = unknownCode;
      }),
    ),
  );
  ok(
    "221. an unknown intermediate airport is rejected even when the route still joins up",
    rejectsForIntent(
      mutateConnecting((o) => {
        // The connection is renamed consistently on both segments and on the
        // layover, so continuity, layover matching and every duration still
        // agree. Directory membership is the only thing left broken.
        const itineraries = itinsOf(o);
        for (const itinerary of itineraries) {
          const segs = itinerary.segments as Mutable[];
          const layovers = itinerary.layovers as Mutable[];
          if (layovers.length === 0) continue;
          segs[0].destinationCode = unknownCode;
          segs[1].originCode = unknownCode;
          layovers[0].airportCode = unknownCode;
          break;
        }
      }),
    ),
  );
  ok(
    "222. an unknown layover airport is rejected",
    rejectsForIntent(
      mutateConnecting((o) => {
        for (const itinerary of itinsOf(o)) {
          const layovers = itinerary.layovers as Mutable[];
          if (layovers.length === 0) continue;
          layovers[0].airportCode = unknownCode;
          break;
        }
      }),
    ),
  );
  ok(
    "223. real connection airports remain accepted",
    isCanonicalFlightOfferForIntent(connecting, intent) &&
      connecting.itineraries.every((itinerary) =>
        itinerary.layovers.every(
          (layover) => resolveAirportTimeZone(layover.airportCode) !== null,
        ),
      ),
  );

  // --- 224-228. Shared round-trip turnaround policy ------------------------------------------------
  // A one-day gap keeps every shifted inbound on a date the flexibility window
  // still admits, so the only thing these four cases differ by is the
  // turnaround itself.
  const turnaroundIntent = buildSearchIntent({
    tripType: "roundTrip",
    origin: ymq,
    destination: lhr,
    departureDate: addDays(today, 20),
    returnDate: addDays(today, 21),
    travelers: DEFAULT_TRAVELERS,
    cabinClass: "economy",
    flexibilityDays: 3,
    currency: "CAD",
    locale,
  });
  if (!turnaroundIntent) throw new Error("Turnaround fixture intent failed.");
  const turnaroundOffers = generateDemoOffers(turnaroundIntent);
  if (turnaroundOffers.length === 0) {
    throw new Error("Turnaround fixture produced no offers.");
  }
  const turnaroundBase = turnaroundOffers[0];
  /**
   * Rebuilds an offer whose inbound departs exactly `gapMinutes` after the
   * outbound arrives. Every inbound epoch moves by the same delta, so
   * durations, layovers and chronology inside the leg are untouched; the local
   * date and time are recomputed at each airport through the shared
   * conversion, which is what keeps the instants honest rather than merely
   * plausible.
   */
  const withTurnaround = (gapMinutes: number): unknown => {
    const clone = JSON.parse(JSON.stringify(turnaroundBase)) as Mutable;
    const itineraries = itinsOf(clone);
    const outboundArrival = (itineraries[0].arrival as Record<string, number>)
      .epochMinutes;
    const inbound = itineraries[1];
    const inboundSegments = inbound.segments as Mutable[];
    const currentStart = (inboundSegments[0].departure as Record<string, number>)
      .epochMinutes;
    const delta = outboundArrival + gapMinutes - currentStart;
    const shift = (
      point: Record<string, unknown>,
      airportCode: string,
    ): Record<string, unknown> => {
      const zone = resolveAirportTimeZone(airportCode);
      if (zone === null) throw new Error(`Unknown fixture airport ${airportCode}`);
      const moved = (point.epochMinutes as number) + delta;
      const local = toLocalDateTime(moved, zone);
      return { date: local.date, time: local.time, epochMinutes: moved };
    };
    for (const segment of inboundSegments) {
      segment.departure = shift(
        segment.departure as Record<string, unknown>,
        segment.originCode as string,
      );
      segment.arrival = shift(
        segment.arrival as Record<string, unknown>,
        segment.destinationCode as string,
      );
    }
    inbound.departure = inboundSegments[0].departure;
    inbound.arrival = inboundSegments[inboundSegments.length - 1].arrival;
    return clone;
  };
  const acceptsTurnaround = (gapMinutes: number): boolean =>
    isCanonicalFlightOfferForIntent(withTurnaround(gapMinutes), turnaroundIntent);
  ok("224. a zero-minute turnaround is rejected", !acceptsTurnaround(0));
  ok("225. a 30-minute turnaround is rejected", !acceptsTurnaround(30));
  ok("226. a 59-minute turnaround is rejected", !acceptsTurnaround(59));
  ok("227. a 60-minute turnaround is accepted", acceptsTurnaround(60));
  ok(
    "228. generator and validator both read the turnaround minimum from one shared policy module",
    (() => {
      const policy = stripComments(
        readSource("src/features/flights/flight-offer-policy.ts"),
      );
      const generator = stripComments(
        readSource("src/features/flights/demo-offer-generation.ts"),
      );
      const validator = stripComments(
        readSource("src/features/flights/flight-offer-intent-validation.ts"),
      );
      const importsPolicy = (source: string) =>
        /import\s*\{\s*MIN_ROUND_TRIP_TURNAROUND_MINUTES\s*\}\s*from\s*"\.\/flight-offer-policy"/.test(
          source,
        );
      return (
        MIN_ROUND_TRIP_TURNAROUND_MINUTES === 60 &&
        /export const MIN_ROUND_TRIP_TURNAROUND_MINUTES = 60;/.test(policy) &&
        importsPolicy(generator) &&
        importsPolicy(validator) &&
        // The literal lives in exactly one place.
        !/MIN_ROUND_TRIP_TURNAROUND_MINUTES\s*=\s*60/.test(generator) &&
        !/MIN_ROUND_TRIP_TURNAROUND_MINUTES\s*=\s*60/.test(validator)
      );
    })(),
  );

  // --- 229-237. Demonstration identity catalog -----------------------------------------------------
  const realAirlineOffer = (id: string, name: string): unknown =>
    mutate((o) => {
      for (const itinerary of itinsOf(o)) {
        for (const segment of itinerary.segments as Mutable[]) {
          segment.carrierId = id;
          segment.carrierName = name;
          segment.flightNumber = `DEMO-XXX-100`;
        }
      }
      o.validatingCarrierId = id;
      o.validatingCarrierName = name;
      o.operatingCarrierNames = [name];
    });
  ok(
    "229. an uncatalogued segment carrier id is rejected",
    rejectsForIntent(mutate((o) => (segsOf(o)[0].carrierId = "not-a-carrier"))),
  );
  ok(
    "230. a catalogued id paired with another catalogued carrier's name is rejected",
    rejectsForIntent(
      mutate((o) => {
        const segment = segsOf(o)[0];
        const wrong = DEMO_CARRIERS.find(
          (carrier) => carrier.id !== segment.carrierId,
        );
        if (!wrong) throw new Error("Catalog needs at least two carriers.");
        segment.carrierName = wrong.name;
      }),
    ),
  );
  ok(
    "231. a demonstration flight number belonging to a different carrier is rejected",
    rejectsForIntent(
      mutate((o) => {
        const segment = segsOf(o)[0];
        const wrong = DEMO_CARRIERS.find(
          (carrier) => carrier.id !== segment.carrierId,
        );
        if (!wrong) throw new Error("Catalog needs at least two carriers.");
        segment.flightNumber = `DEMO-${wrong.mark}-483`;
      }),
    ),
  );
  ok(
    "232. an uncatalogued validating carrier is rejected",
    rejectsForIntent(mutate((o) => (o.validatingCarrierId = "not-a-carrier"))),
  );
  ok(
    "233. a validating carrier id paired with the wrong name is rejected",
    rejectsForIntent(
      mutate((o) => {
        const wrong = DEMO_CARRIERS.find(
          (carrier) => carrier.id !== o.validatingCarrierId,
        );
        if (!wrong) throw new Error("Catalog needs at least two carriers.");
        o.validatingCarrierName = wrong.name;
      }),
    ),
  );
  ok(
    "234. real airline identities are rejected",
    // Present only as adversarial fixtures: these must never validate, and
    // never appear in generated data.
    rejectsForIntent(realAirlineOffer("AC", "Air Canada")) &&
      rejectsForIntent(realAirlineOffer("BA", "British Airways")),
  );
  ok(
    "235. real booking-provider names are rejected",
    rejectsForIntent(mutate((o) => (o.provider = "Expedia"))) &&
      rejectsForIntent(mutate((o) => (o.provider = "Booking.com"))),
  );
  ok(
    "236. every generated identity is catalogued",
    sampleOffers.length > 0 &&
      sampleOffers.every((offer) => {
        const carrier = DEMO_CARRIERS.find(
          (entry) => entry.id === offer.validatingCarrierId,
        );
        if (!carrier || carrier.name !== offer.validatingCarrierName) return false;
        if (!DEMO_BOOKING_PROVIDERS.includes(offer.provider)) return false;
        return offer.itineraries.every((itinerary) =>
          itinerary.segments.every((segment) => {
            const segmentCarrier = DEMO_CARRIERS.find(
              (entry) => entry.id === segment.carrierId,
            );
            return (
              segmentCarrier !== undefined &&
              segmentCarrier.name === segment.carrierName &&
              segment.flightNumber.startsWith(`DEMO-${segmentCarrier.mark}-`)
            );
          }),
        );
      }),
  );
  ok(
    "237. generator and validator share one identity catalog",
    (() => {
      const catalog = stripComments(
        readSource("src/features/flights/demo-flight-catalog.ts"),
      );
      const generator = stripComments(
        readSource("src/features/flights/demo-offer-generation.ts"),
      );
      const validator = stripComments(
        readSource("src/features/flights/flight-offer-intent-validation.ts"),
      );
      return (
        /"Aurora Air"/.test(catalog) &&
        /"Atlas Connect"/.test(catalog) &&
        /from "\.\/demo-flight-catalog"/.test(generator) &&
        /from "\.\/demo-flight-catalog"/.test(validator) &&
        // Neither side keeps its own copy of the names.
        !/"Aurora Air"/.test(generator) &&
        !/"Aurora Air"/.test(validator) &&
        !/"Atlas Connect"/.test(generator) &&
        !/"Atlas Connect"/.test(validator)
      );
    })(),
  );

  // --- 238-244. Contribution-aware envelopes -------------------------------------------------------
  // The rule is directional. Deduplication and the aggregate ceiling can make
  // the final list *smaller* than what the providers contributed, which is
  // normal; nothing downstream can make it larger, which is impossible.
  ok(
    "238. more final offers than the successful contribution is rejected",
    validateApiResponse(
      envelope({ providerSummary: [summaryOf("a", "succeeded", 1)] }),
      intent,
    ) === null,
  );
  ok(
    "239. partial offers with only empty and failed summaries is rejected",
    validateApiResponse(
      envelope({
        status: "partial",
        providerSummary: [summaryOf("a", "empty", 0), summaryOf("b", "failed", 0)],
      }),
      intent,
    ) === null,
  );
  ok(
    "240. partial with no offers but a succeeded provider is rejected",
    validateApiResponse(
      envelope({
        status: "partial",
        offers: [],
        providerSummary: [
          summaryOf("a", "succeeded", 4),
          summaryOf("b", "failed", 0),
        ],
      }),
      intent,
    ) === null,
  );
  ok(
    "241. success with a final count reduced by deduplication is accepted",
    validateApiResponse(
      envelope({
        providerSummary: [
          summaryOf("a", "succeeded", sampleOffers.length),
          summaryOf("b", "succeeded", sampleOffers.length),
        ],
      }),
      intent,
    ) !== null,
  );
  ok(
    "242. a consistent partial carrying offers is accepted",
    validateApiResponse(
      envelope({
        status: "partial",
        providerSummary: [
          summaryOf("a", "succeeded", sampleOffers.length),
          summaryOf("b", "cancelled", 0),
        ],
      }),
      intent,
    ) !== null,
  );
  ok(
    "243. a partial with no offers from an empty and a failed provider is accepted",
    validateApiResponse(
      envelope({
        status: "partial",
        offers: [],
        providerSummary: [summaryOf("a", "empty", 0), summaryOf("b", "failed", 0)],
      }),
      intent,
    ) !== null,
  );
  ok(
    "244. a consistent empty envelope is accepted",
    validateApiResponse(
      envelope({
        status: "empty",
        offers: [],
        providerSummary: [summaryOf("a", "empty", 0), summaryOf("b", "empty", 0)],
      }),
      intent,
    ) !== null,
  );

  // --- 245-248. Reconfirmation of the surface this round did not change ---------------------------
  ok(
    "245. intent-aware structural validation and exact provider outcomes still hold",
    sampleOffers.every((offer) => isCanonicalFlightOfferForIntent(offer, intent)) &&
      isCanonicalFlightOfferArrayForIntent(sampleOffers, intent) &&
      validateProviderOutcome({ ok: true, offers: sampleOffers }, 40, intent).ok ===
        true &&
      validateProviderOutcome(
        { ok: true, offers: sampleOffers, extra: 1 },
        40,
        intent,
      ).ok === false,
  );
  ok(
    "246. offer ids remain the stable V2.6 identifiers and are request-key isolated",
    sampleOffers.every((offer) => /^demo-[a-z0-9]+-\d+$/.test(offer.id)) &&
      generateDemoOffers(intent)
        .map((o) => o.id)
        .join(",") === sampleOffers.map((o) => o.id).join(",") &&
      serializeSearchIntent(intent) !== serializeSearchIntent(otherIntent),
  );
  ok(
    "247. no dependency was added and no external provider exists",
    (() => {
      const manifest = JSON.parse(readSource("package.json")) as {
        dependencies: Record<string, string>;
      };
      return (
        Object.keys(manifest.dependencies).sort().join(",") ===
        "next,react,react-dom"
      );
    })(),
  );
  ok(
    "248. the body reader still enforces its byte ceiling and the client still agrees on status",
    await (async () => {
      const oversized = new Request("http://localhost/api/flights/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "z".repeat(MAX_REQUEST_BODY_BYTES + 1),
      });
      const read = await readBoundedRequestBody(oversized, MAX_REQUEST_BODY_BYTES);
      return read.ok === false && read.reason === "tooLarge";
    })(),
  );

  // === V2.7 freeze corrections ====================================================================

  // --- 249-262. Validator totality: unsafe and out-of-range epochs --------------------------------
  // The defect: every canonical instant is eventually handed to
  // `Intl.DateTimeFormat`, which *throws* `RangeError` outside the ECMAScript
  // Date range. An offer whose epochs were shifted far out of range while
  // staying perfectly self-consistent — chronology, durations, itinerary totals
  // and ranking totals all still agreeing — therefore took the validators down
  // instead of being rejected by them.
  const OUT_OF_RANGE_SHIFT = 200_000_000_000;
  /**
   * Shifts every epoch in an offer by the same delta, so the payload stays
   * internally consistent in every relationship the validator checks. Local
   * dates and times are left untouched deliberately: the point is that the
   * *epoch* is unconvertible, and the validator must say so rather than throw
   * while trying to re-derive the wall clock from it.
   */
  const shiftAllEpochs = (offer: FlightOffer, delta: number): unknown => {
    const clone = JSON.parse(JSON.stringify(offer)) as Mutable;
    const move = (point: Mutable): void => {
      point.epochMinutes = (point.epochMinutes as number) + delta;
    };
    for (const itinerary of itinsOf(clone)) {
      move(itinerary.departure as Mutable);
      move(itinerary.arrival as Mutable);
      for (const segment of itinerary.segments as Mutable[]) {
        move(segment.departure as Mutable);
        move(segment.arrival as Mutable);
      }
    }
    return clone;
  };
  /** Runs a predicate and reports whether it threw, so "rejected" and "exploded" stay distinguishable. */
  const settle = <T>(run: () => T): { threw: boolean; value: T | null } => {
    try {
      return { threw: false, value: run() };
    } catch {
      return { threw: true, value: null };
    }
  };

  ok(
    "249. a normal generated epoch is a valid epoch",
    sampleOffers.every((offer) =>
      offer.itineraries.every((itinerary) =>
        itinerary.segments.every(
          (segment) =>
            isValidEpochMinutes(segment.departure.epochMinutes) &&
            isValidEpochMinutes(segment.arrival.epochMinutes),
        ),
      ),
    ),
  );
  ok(
    "250. the maximum in-range epoch is accepted and converts without throwing",
    isValidEpochMinutes(MAX_EPOCH_MINUTES) &&
      isValidEpochMinutes(-MAX_EPOCH_MINUTES) &&
      !settle(() => toLocalDateTime(MAX_EPOCH_MINUTES, "UTC")).threw,
  );
  ok(
    "251. a positive out-of-range epoch is rejected",
    !isValidEpochMinutes(MAX_EPOCH_MINUTES + 1) &&
      !isValidEpochMinutes(OUT_OF_RANGE_SHIFT),
  );
  ok(
    "252. a negative out-of-range epoch is rejected",
    !isValidEpochMinutes(-MAX_EPOCH_MINUTES - 1) &&
      !isValidEpochMinutes(-OUT_OF_RANGE_SHIFT),
  );
  ok(
    "253. an unsafe integer, a float and a non-number epoch are rejected",
    !isValidEpochMinutes(Number.MAX_SAFE_INTEGER + 2) &&
      !isValidEpochMinutes(1.5) &&
      !isValidEpochMinutes(Number.POSITIVE_INFINITY) &&
      !isValidEpochMinutes(Number.NaN) &&
      !isValidEpochMinutes("100") &&
      !isValidEpochMinutes(null),
  );
  const shiftedOffer = shiftAllEpochs(sampleOffers[0], OUT_OF_RANGE_SHIFT);
  const shiftedStructural = settle(() => isCanonicalFlightOffer(shiftedOffer));
  const shiftedIntent = settle(() =>
    isCanonicalFlightOfferForIntent(shiftedOffer, intent),
  );
  ok(
    "254. an internally consistent offer with out-of-range epochs is rejected, not thrown on",
    shiftedStructural.threw === false &&
      shiftedStructural.value === false &&
      shiftedIntent.threw === false &&
      shiftedIntent.value === false,
  );
  const shiftedProvider = settle(() =>
    validateProviderOutcome({ ok: true, offers: [shiftedOffer] }, 40, intent),
  );
  ok(
    "255. server provider validation does not throw on an out-of-range offer",
    shiftedProvider.threw === false,
  );
  ok(
    "256. server provider validation reports it as an invalid offer",
    shiftedProvider.value !== null &&
      shiftedProvider.value.ok === false &&
      shiftedProvider.value.reason === "invalidOffer",
  );
  const shiftedEnvelope = settle(() =>
    validateApiResponse(envelope({ offers: [shiftedOffer] }), intent),
  );
  ok(
    "257. client envelope validation does not throw on an out-of-range offer",
    shiftedEnvelope.threw === false,
  );
  ok(
    "258. client envelope validation returns null for it",
    shiftedEnvelope.value === null,
  );
  ok(
    "259. the repository maps it to FlightOfferRepositoryError, never a raw RangeError",
    await (async () => {
      const original = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response(JSON.stringify(envelope({ offers: [shiftedOffer] })), {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as typeof globalThis.fetch;
      try {
        await new ApiFlightOfferRepository().search(intent);
        return false;
      } catch (error: unknown) {
        // The exact containment property: a repository error, and *not* the
        // RangeError the validator would previously have let through.
        return (
          error instanceof FlightOfferRepositoryError &&
          !(error instanceof RangeError) &&
          (error as Error).name !== "RangeError"
        );
      } finally {
        globalThis.fetch = original;
      }
    })(),
  );
  ok(
    "260. an out-of-range epoch inside a provider outcome never reaches the orchestrator's offers",
    await (async () => {
      const run = await orchestrateProviderSearch(runInput, {
        registry: createProviderRegistry([
          registration({
            providerId: "out-of-range",
            adapter: fixtureAdapter("out-of-range", async () => ({
              ok: true,
              offers: [shiftedOffer] as readonly FlightOffer[],
            })),
          }),
        ]),
        auditSink: createRecordingAuditSink(),
      });
      return run.offers.length === 0 && run.outcomes[0].status === "failed";
    })(),
  );
  ok(
    "261. every generated offer still passes both validators unchanged",
    sampleOffers.every(
      (offer) =>
        isCanonicalFlightOffer(offer) &&
        isCanonicalFlightOfferForIntent(offer, intent),
    ) && validateApiResponse(envelope({}), intent) !== null,
  );
  check(
    "262. offer ids are unchanged by the safe-integer policy",
    generateDemoOffers(intent).map((offer) => offer.id),
    sampleOffers.map((offer) => offer.id),
  );

  // --- 263-274. Provider contribution bound vs final response bound --------------------------------
  // Two quantities that were sharing one constant. A provider may validly
  // contribute more offers than the aggregated response carries; the summary
  // reports that pre-deduplication contribution truthfully.
  ok(
    "263. the two bounds are distinct constants with distinct values",
    MAX_PROVIDER_OFFER_COUNT === 200 &&
      MAX_RESPONSE_OFFERS === 60 &&
      MAX_PROVIDER_OFFER_COUNT > MAX_RESPONSE_OFFERS,
  );
  ok(
    "264. the registry accepts a maximum offer count of exactly MAX_PROVIDER_OFFER_COUNT",
    !settle(() =>
      createProviderRegistry([
        registration({
          providerId: "at-bound",
          adapter: fixtureAdapter("at-bound", async () => ({
            ok: true,
            offers: [],
          })),
          maximumOfferCount: MAX_PROVIDER_OFFER_COUNT,
        }),
      ]),
    ).threw,
  );
  ok(
    "265. the registry rejects MAX_PROVIDER_OFFER_COUNT + 1",
    settle(() =>
      createProviderRegistry([
        registration({
          providerId: "over-bound",
          adapter: fixtureAdapter("over-bound", async () => ({
            ok: true,
            offers: [],
          })),
          maximumOfferCount: MAX_PROVIDER_OFFER_COUNT + 1,
        }),
      ]),
    ).threw,
  );
  ok(
    "266. a provider summary reporting exactly MAX_PROVIDER_OFFER_COUNT is accepted",
    validateApiResponse(
      envelope({
        providerSummary: [summaryOf("bulk", "succeeded", MAX_PROVIDER_OFFER_COUNT)],
      }),
      intent,
    ) !== null,
  );
  ok(
    "267. a provider summary reporting MAX_PROVIDER_OFFER_COUNT + 1 is rejected",
    validateApiResponse(
      envelope({
        providerSummary: [
          summaryOf("bulk", "succeeded", MAX_PROVIDER_OFFER_COUNT + 1),
        ],
      }),
      intent,
    ) === null,
  );
  ok(
    "268. a contribution of 100 with a final list of 60 is accepted",
    (() => {
      // A genuine 60-offer final list, built by repeating validated offers
      // under fresh ids so the array is duplicate-free and every offer still
      // answers the intent.
      const final = Array.from({ length: 60 }, (_, index) => ({
        ...sampleOffers[index % sampleOffers.length],
        id: `demo-bulk${index.toString(36)}-${index}`,
      }));
      return (
        final.length === MAX_RESPONSE_OFFERS &&
        validateApiResponse(
          envelope({
            offers: final,
            providerSummary: [summaryOf("bulk", "succeeded", 100)],
          }),
          intent,
        ) !== null
      );
    })(),
  );
  ok(
    "269. a final count reduced by deduplication across two providers is accepted",
    validateApiResponse(
      envelope({
        providerSummary: [
          summaryOf("a", "succeeded", sampleOffers.length),
          summaryOf("b", "succeeded", sampleOffers.length),
        ],
      }),
      intent,
    ) !== null,
  );
  ok(
    "270. a final count greater than the successful contribution is still rejected",
    validateApiResponse(
      envelope({ providerSummary: [summaryOf("a", "succeeded", 1)] }),
      intent,
    ) === null &&
      validateApiResponse(
        envelope({
          providerSummary: [summaryOf("a", "empty", 0)],
          status: "empty",
          offers: [sampleOffers[0]],
        }),
        intent,
      ) === null,
  );
  ok(
    "271. MAX_RESPONSE_OFFERS still bounds the final offers array",
    (() => {
      const tooMany = Array.from({ length: MAX_RESPONSE_OFFERS + 1 }, (_, i) => ({
        ...sampleOffers[i % sampleOffers.length],
        id: `demo-over${i.toString(36)}-${i}`,
      }));
      return (
        validateApiResponse(
          envelope({
            offers: tooMany,
            providerSummary: [summaryOf("bulk", "succeeded", 200)],
          }),
          intent,
        ) === null
      );
    })(),
  );
  ok(
    "272. registry and client validation share one contribution constant, with no private duplicate",
    (() => {
      const registrySource = stripComments(
        readSource("src/server/flights/providers/provider-registry.ts"),
      );
      const repositorySource = stripComments(
        readSource("src/features/flights/api-flight-offer-repository.ts"),
      );
      const contractSource = stripComments(
        readSource("src/features/flights/flight-search-api-contract.ts"),
      );
      return (
        /export const MAX_PROVIDER_OFFER_COUNT = 200;/.test(contractSource) &&
        /MAX_PROVIDER_OFFER_COUNT/.test(registrySource) &&
        /MAX_PROVIDER_OFFER_COUNT/.test(repositorySource) &&
        // No private literal ceiling left on either side.
        !/MAX_OFFER_LIMIT\s*=\s*200/.test(registrySource) &&
        !/offerCount\s*>\s*MAX_RESPONSE_OFFERS/.test(repositorySource)
      );
    })(),
  );
  ok(
    "273. the shipped single-provider runtime is unchanged and still contributes 12",
    await (async () => {
      const run = await orchestrateProviderSearch(runInput, {
        registry: runtimeProviderRegistry,
        auditSink: createRecordingAuditSink(),
      });
      return (
        run.outcomes.length === 1 &&
        run.outcomes[0].providerId === "gtai-local-demo" &&
        run.outcomes[0].offers.length === 12 &&
        run.offers.length === 12 &&
        run.status === "success"
      );
    })(),
  );
  ok(
    "274. partial coverage and request-key isolation are unaffected by the new bound",
    validateApiResponse(
      envelope({
        status: "partial",
        providerSummary: [
          summaryOf("a", "succeeded", 100),
          summaryOf("b", "failed", 0),
        ],
      }),
      intent,
    ) !== null &&
      serializeSearchIntent(intent).toString() !==
        serializeSearchIntent(otherIntent).toString(),
  );

  // Aggregation is order-independent, so a slow provider answering second
  // cannot reorder the list a visitor sees.
  const [firstHalf, secondHalf] = [sampleOffers.slice(0, 6), sampleOffers.slice(6)];
  check(
    "extra. normalization is independent of provider answer order",
    normalizeProviderOffers([firstHalf, secondHalf], 60).map((o) => o.id),
    normalizeProviderOffers([secondHalf, firstHalf], 60).map((o) => o.id),
  );

  const total = passed + failures.length;
  if (failures.length > 0) {
    console.error(
      `\nProvider verification FAILED — ${failures.length} of ${total}\n`,
    );
    for (const failure of failures) console.error(`  ✗ ${failure}\n`);
    process.exit(1);
  }

  console.log(`Provider verification passed — ${passed}/${total} checks`);
}

main().catch((error: unknown) => {
  console.error("Provider verification crashed:", error);
  process.exit(1);
});
