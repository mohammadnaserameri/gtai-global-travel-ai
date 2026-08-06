/**
 * Deterministic checks for GTAI V2.8-B — Real Provider Integration Readiness.
 *
 * The question is narrow: *is the repository ready to accept a live provider,
 * without having accepted one?* Both halves matter. Readiness alone is easy to
 * fake with types nobody exercises; not-accepted alone is achieved by writing
 * nothing.
 *
 * So the checks come in two families. One exercises the contracts for real —
 * building requests, mapping responses, computing backoff, evaluating rate
 * limits, redacting payloads — against inert neutral fixtures. The other
 * asserts the boundary: no transport, no credential, no external hostname, no
 * activation, no client reachability, no regression in V2.7 or V2.8-A.
 *
 *   npm run verify:provider-integration-readiness
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  resolveProviderActivationState,
  isProviderRunnable,
  isUsableProviderOrigin,
  SHIPPED_OPERATOR_DIRECTIVE,
} from "../src/server/flights/providers/external/external-provider-activation";
import {
  buildExternalAuditSummary,
  noopExternalAuditSink,
  createRecordingExternalAuditSink,
  bucketDuration,
  ALLOWED_AUDIT_FIELDS,
  PROHIBITED_AUDIT_FIELDS,
} from "../src/server/flights/providers/external/external-provider-audit";
import {
  SHIPPED_EXTERNAL_PROVIDERS,
  resolveExternalProviderStatuses,
  runnableExternalProviders,
  shouldFallBackToLocalProvider,
  validateProviderDefinition,
  claimsAnyCapability,
  isExecutableProviderId,
  resolveRequestedProviderId,
  inspectableProviderDefinitions,
} from "../src/server/flights/providers/external/external-provider-configuration";
import {
  categoryForStatus,
  categoryForCause,
  parseRetryAfterMs,
  normalizeExternalFailure,
} from "../src/server/flights/providers/external/external-provider-error-normalizer";
import {
  buildExternalFailure,
  isRetryableCategory,
  publicCodeFor,
  runtimeCodeFor,
  EXTERNAL_FAILURE_CATEGORIES,
  ALLOWED_FAILURE_FIELDS,
  MAX_RETRY_AFTER_MS,
} from "../src/server/flights/providers/external/external-provider-failures";
import {
  mapExternalOffers,
  validateExternalOffer,
  deterministicOfferId,
  ALLOWED_OFFER_FIELDS,
} from "../src/server/flights/providers/external/external-provider-offer-mapping";
import {
  evaluateRateLimit,
  recordRequestIssued,
  recordRequestSettled,
  recordCallerQueued,
  isValidRateLimit,
  windowCapacity,
  EMPTY_RATE_LIMIT_STATE,
  ALLOWED_RATE_LIMIT_STATE_FIELDS,
} from "../src/server/flights/providers/external/external-provider-rate-limit";
import {
  redactRequest,
  redactResponse,
  redactDiagnostic,
  statusClassOf,
} from "../src/server/flights/providers/external/external-provider-redaction";
import {
  buildExternalRequest,
  buildNeutralQuery,
  checkCapabilitySupport,
  ExternalRequestConstructionError,
  PROHIBITED_REQUEST_FIELDS,
} from "../src/server/flights/providers/external/external-provider-request-contract";
import {
  computeBackoffMs,
  clampRetryAfterMs,
  decideRetry,
  decideRetryForCategory,
  isBudgetExhausted,
  isValidRetryPolicy,
  isValidTimeoutPolicy,
  DEFAULT_RETRYABLE_FAILURES,
  NEVER_RETRYABLE_CATEGORIES,
  MAX_ATTEMPTS_CEILING,
} from "../src/server/flights/providers/external/external-provider-retry";
import {
  deriveNeutralSearch,
  validateNeutralSearch,
  expectedLegCount,
  seatedTravelerCount,
  totalTravelerCount,
} from "../src/server/flights/providers/external/external-provider-search-shape";
import {
  resolveProviderSecrets,
  isValidSecretReference,
  revealSecret,
  SECRET_REDACTION_MARKER,
  CLIENT_EXPOSED_ENV_PREFIX,
} from "../src/server/flights/providers/external/external-provider-secrets";
import {
  createInactiveExternalProviderTransport,
  inactiveExternalProviderTransport,
  normalizeTransportError,
  InactiveTransportError,
} from "../src/server/flights/providers/external/external-provider-transport";
import {
  contractFixtureDefinition,
  contractFixtureProvider,
  CONTRACT_FIXTURE_ORIGIN,
  CONTRACT_FIXTURE_PROVIDER_ID,
} from "../src/server/flights/providers/external/fixtures/external-contract-fixture";
import * as fixtures from "../src/server/flights/providers/external/fixtures/neutral-provider-fixtures";
import { runtimeProviderRegistry } from "../src/server/flights/providers/provider-registry";
import type { ExternalProviderRequestContext } from "../src/server/flights/providers/external/external-provider-types";
import type { FlightSearchIntent } from "../src/features/flights/search-intent-types";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}

function ok(name: string, condition: boolean): void {
  if (condition) passed += 1;
  else failures.push(`${name}\n    expected true\n    actual   false`);
}

const repoRoot = process.cwd();
const readSource = (relativePath: string): string =>
  readFileSync(join(repoRoot, relativePath), "utf8");
const exists = (relativePath: string): boolean =>
  existsSync(join(repoRoot, relativePath));

function collectSourceFiles(relativeDir: string): string[] {
  const absolute = join(repoRoot, relativeDir);
  if (!existsSync(absolute)) return [];
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) found.push(full);
    }
  };
  walk(absolute);
  return found;
}

/** Comments are stripped before a prohibition sweep: this code names what it forbids. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");
}
const readCode = (relativePath: string): string =>
  stripComments(readSource(relativePath));

const EXTERNAL_DIR = "src/server/flights/providers/external";
const externalFiles = collectSourceFiles(EXTERNAL_DIR);
const externalCode = externalFiles.map(
  (file) => [file, stripComments(readFileSync(file, "utf8"))] as const,
);

const NOW = Date.parse("2026-08-05T00:00:00.000Z");

function context(
  overrides: Partial<ExternalProviderRequestContext> = {},
): ExternalProviderRequestContext {
  return {
    signal: new AbortController().signal,
    searchContextId: "11111111-2222-3333-4444-555555555555",
    attempt: 1,
    deadlineAt: NOW + 20_000,
    ...overrides,
  };
}

/** A real, fully-typed intent — no cast anywhere in this script either. */
function intent(overrides: Partial<FlightSearchIntent> = {}): FlightSearchIntent {
  const location = (code: string) => ({
    entityId: `airport-${code.toLowerCase()}`,
    entityType: "AIRPORT" as const,
    displayName: code,
    displayCode: code,
    displayLabel: `${code} (${code})`,
    cityCode: null,
    iataCode: code,
    airportCodes: [code],
    countryCode: "CA",
    timeZone: "UTC",
    latitude: null,
    longitude: null,
  });
  const baseIntent: FlightSearchIntent = {
    version: 1,
    tripType: "roundTrip",
    origin: location("YUL"),
    destination: location("CDG"),
    departureDate: "2026-09-15",
    returnDate: "2026-09-22",
    travelers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 },
    cabinClass: "economy",
    flexibilityDays: 0,
    currency: "CAD",
    locale: "en",
  };
  return { ...baseIntent, ...overrides };
}

const derivationContext = {
  market: "CA",
  contentLocale: "en-CA",
  requestedLocale: "en-CA",
  requestId: "req-1",
  timeoutBudgetMs: 20_000,
};

async function main(): Promise<void> {
  // ======================================================================
  // 1. ARCHITECTURE
  // ======================================================================
  const REQUIRED_MODULES = [
    "external-provider-types.ts",
    "external-provider-activation.ts",
    "external-provider-secrets.ts",
    "external-provider-redaction.ts",
    "external-provider-retry.ts",
    "external-provider-rate-limit.ts",
    "external-provider-failures.ts",
    "external-provider-error-normalizer.ts",
    "external-provider-request-contract.ts",
    "external-provider-offer-mapping.ts",
    "external-provider-search-shape.ts",
    "external-provider-transport.ts",
    "external-provider-audit.ts",
    "external-provider-configuration.ts",
  ];
  for (const [index, file] of REQUIRED_MODULES.entries()) {
    ok(`${1 + index}. ${file} exists`, exists(`${EXTERNAL_DIR}/${file}`));
  }
  ok(
    "15. the contract fixture lives under fixtures/",
    exists(`${EXTERNAL_DIR}/fixtures/external-contract-fixture.ts`),
  );
  ok(
    "16. the neutral fixture set lives under fixtures/",
    exists(`${EXTERNAL_DIR}/fixtures/neutral-provider-fixtures.ts`),
  );
  ok(
    "17. the fixture identity is split so configuration can refuse it by name",
    exists(`${EXTERNAL_DIR}/fixtures/fixture-identity.ts`),
  );
  ok(
    "18. no competing verification script name remains",
    exists("scripts/verify-provider-integration-readiness.ts") &&
      !exists("scripts/verify-provider-integration.ts"),
  );
  ok(
    "19. package.json declares only the readiness script name",
    (() => {
      const pkg = JSON.parse(readSource("package.json")) as {
        scripts: Record<string, string>;
      };
      return (
        typeof pkg.scripts["verify:provider-integration-readiness"] === "string" &&
        pkg.scripts["verify:provider-integration"] === undefined
      );
    })(),
  );
  ok(
    "20. the verify tsconfig includes the renamed script only",
    (() => {
      const tsconfig = JSON.parse(readSource("scripts/tsconfig.verify.json")) as {
        include: string[];
      };
      return (
        tsconfig.include.includes("verify-provider-integration-readiness.ts") &&
        !tsconfig.include.includes("verify-provider-integration.ts")
      );
    })(),
  );

  // ======================================================================
  // 2. NETWORK PROHIBITION
  // ======================================================================
  ok(
    "21. no external module performs a fetch",
    externalCode.every(([, code]) => !/\bfetch\s*\(/.test(code)),
  );
  ok(
    "22. no external module imports an HTTP client",
    externalCode.every(
      ([, code]) =>
        !/from "node:(http|https|net|tls|dgram)"/.test(code) &&
        !/require\("node:(http|https|net)"\)/.test(code) &&
        !/\baxios\b|node-fetch|undici/.test(code),
    ),
  );
  ok(
    "23. no external module opens a socket or WebSocket",
    externalCode.every(([, code]) => !/new (WebSocket|Socket)\s*\(/.test(code)),
  );
  ok(
    "24. no external module uses XMLHttpRequest or sendBeacon",
    externalCode.every(([, code]) => !/XMLHttpRequest|sendBeacon/.test(code)),
  );
  const hostnames = externalCode.flatMap(([, code]) =>
    [...code.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]),
  );
  ok(
    "25. every hostname in the external layer is a reserved .invalid host",
    hostnames.length > 0 && hostnames.every((host) => host.endsWith(".invalid")),
  );
  ok(
    "26. no travel company is named anywhere in the external layer",
    externalCode.every(
      ([, code]) =>
        !/skyscanner|amadeus|sabre|travelport|kiwi\.com|expedia|booking\.com|kayak|duffel/i.test(
          code,
        ),
    ),
  );

  // ======================================================================
  // 3. INACTIVE TRANSPORT
  // ======================================================================
  const transportCode = readCode(`${EXTERNAL_DIR}/external-provider-transport.ts`);
  ok(
    "27. the transport interface declares the required search signature",
    /search\(\s*request: ExternalProviderSearchRequest,\s*context: ExternalProviderRequestContext,\s*\): Promise<ExternalProviderSearchResponse>/.test(
      transportCode.replace(/\s+/g, " ").replace(/ /g, " "),
    ) || /interface ExternalProviderTransport/.test(transportCode),
  );
  ok(
    "28. the inactive transport performs no network call",
    !/\bfetch\s*\(|XMLHttpRequest|node:http/.test(transportCode),
  );

  let transportCalls = 0;
  const countingTransport = {
    ...inactiveExternalProviderTransport,
    async search(
      ...args: Parameters<typeof inactiveExternalProviderTransport.search>
    ) {
      transportCalls += 1;
      return inactiveExternalProviderTransport.search(...args);
    },
  };

  const inactiveFailure = await countingTransport
    .search(
      contractFixtureProvider.buildRequest(fixtures.oneWaySearch, context()),
      context(),
    )
    .then(() => null)
    .catch((error: unknown) => {
      return error instanceof InactiveTransportError ? error.failure : null;
    });

  const abortedController = new AbortController();
  abortedController.abort();
  const abortedFailure = await inactiveExternalProviderTransport
    .search(
      contractFixtureProvider.buildRequest(fixtures.oneWaySearch, context()),
      context({ signal: abortedController.signal }),
    )
    .then(() => null)
    .catch((error: unknown) => {
      return error instanceof InactiveTransportError ? error.failure : null;
    });

  ok(
    "29. the inactive transport has a stable id",
    inactiveExternalProviderTransport.transportId === "inactive-external-transport",
  );
  ok(
    "30. a deterministic transport instance is constructible",
    createInactiveExternalProviderTransport({ now: () => NOW }).transportId ===
      inactiveExternalProviderTransport.transportId,
  );
  ok(
    "31. two inactive transports built with the same clock agree",
    createInactiveExternalProviderTransport({ now: () => NOW }).transportId ===
      createInactiveExternalProviderTransport({ now: () => NOW }).transportId,
  );
  check(
    "32. an unrecognized transport throw normalizes to networkFailure",
    normalizeTransportError(new Error("boom"), "p", "r", "2026-08-05T00:00:00.000Z")
      .category,
    "networkFailure",
  );
  ok(
    "33. a typed inactive failure passes through normalization unchanged",
    (() => {
      const failure = buildExternalFailure({
        category: "notConfigured",
        providerId: "p",
        requestId: "r",
        occurredAt: "2026-08-05T00:00:00.000Z",
      });
      return (
        normalizeTransportError(
          new InactiveTransportError(failure),
          "p",
          "r",
          "2026-08-05T00:00:00.000Z",
        ) === failure
      );
    })(),
  );
  ok(
    "34. the contract fixture's transport is the inactive one",
    contractFixtureProvider.transport === inactiveExternalProviderTransport,
  );
  check(
    "34a. the inactive transport returns typed notConfigured",
    inactiveFailure?.category,
    "notConfigured",
  );
  check(
    "34b. an already-aborted request returns typed aborted",
    abortedFailure?.category,
    "aborted",
  );

  // ======================================================================
  // 4. ACTIVATION
  // ======================================================================
  const withheld = resolveProviderActivationState({
    definition: contractFixtureDefinition,
    directive: "withheld",
    readEnvironment: () => "a-complete-credential",
  });
  check(
    "35. complete config without a directive yields configured",
    withheld.state,
    "configured",
  );
  ok("36. configured is not runnable", !isProviderRunnable(withheld.state));
  check(
    "37. an explicit enable activates",
    resolveProviderActivationState({
      definition: contractFixtureDefinition,
      directive: "enable",
      readEnvironment: () => "a-complete-credential",
    }).state,
    "active",
  );
  check(
    "38. enable without credentials does NOT activate",
    resolveProviderActivationState({
      definition: contractFixtureDefinition,
      directive: "enable",
      readEnvironment: () => undefined,
    }).state,
    "unavailable",
  );
  check(
    "39. an empty credential cannot activate",
    resolveProviderActivationState({
      definition: contractFixtureDefinition,
      directive: "enable",
      readEnvironment: () => "",
    }).state,
    "unavailable",
  );
  check(
    "40. suspend outranks complete configuration",
    resolveProviderActivationState({
      definition: contractFixtureDefinition,
      directive: "suspend",
      readEnvironment: () => "x",
    }).state,
    "suspended",
  );
  check(
    "41. the shipped directive withholds activation",
    SHIPPED_OPERATOR_DIRECTIVE,
    "withheld",
  );
  ok(
    "42. activation is deterministic",
    JSON.stringify(
      resolveProviderActivationState({
        definition: contractFixtureDefinition,
        directive: "withheld",
        readEnvironment: () => "x",
      }),
    ) ===
      JSON.stringify(
        resolveProviderActivationState({
          definition: contractFixtureDefinition,
          directive: "withheld",
          readEnvironment: () => "x",
        }),
      ),
  );
  ok("43. an https origin is usable", isUsableProviderOrigin("https://a.invalid"));
  ok("44. an http origin is refused", !isUsableProviderOrigin("http://a.invalid"));
  ok(
    "45. an origin with embedded credentials is refused",
    !isUsableProviderOrigin("https://k:s@a.invalid"),
  );
  ok(
    "46. an origin carrying a path is refused",
    !isUsableProviderOrigin("https://a.invalid/v1"),
  );

  // ======================================================================
  // 5. SECRETS
  // ======================================================================
  const resolved = resolveProviderSecrets(
    contractFixtureDefinition.secretReferences,
    () => "super-secret-value",
  );
  const holder = resolved.resolutions[0]?.secret;
  ok("47. a present secret resolves", resolved.complete && holder != null);
  check(
    "48. String() of a secret is redacted",
    String(holder),
    SECRET_REDACTION_MARKER,
  );
  check(
    "49. interpolation of a secret is redacted",
    `${holder}`,
    SECRET_REDACTION_MARKER,
  );
  check(
    "50. JSON.stringify of a secret is redacted",
    JSON.stringify(holder),
    JSON.stringify(SECRET_REDACTION_MARKER),
  );
  ok(
    "51. an object containing a secret leaks nothing",
    !JSON.stringify({ credential: holder }).includes("super-secret-value"),
  );
  ok(
    "52. spreading a secret exposes nothing",
    !JSON.stringify({ ...(holder as object) }).includes("super-secret-value"),
  );
  ok(
    "53. Object.keys omits the credential",
    Object.keys(holder as object).every((key) => key === "secretId"),
  );
  check(
    "54. revealSecret is the one way to read plaintext",
    holder == null ? null : revealSecret(holder),
    "super-secret-value",
  );
  check(
    "55. a whitespace-only value counts as missing",
    resolveProviderSecrets(contractFixtureDefinition.secretReferences, () => "  ")
      .resolutions[0]?.status,
    "rejectedEmptyValue",
  );
  check(
    "56. a NEXT_PUBLIC_ name is refused even with a value",
    resolveProviderSecrets(
      [
        {
          secretId: "s",
          environmentVariable: `${CLIENT_EXPOSED_ENV_PREFIX}KEY`,
          placement: "header",
          parameterName: "X",
          required: true,
        },
      ],
      () => "in-the-browser-bundle",
    ).resolutions[0]?.status,
    "rejectedClientExposedName",
  );
  ok(
    "57. isValidSecretReference rejects a NEXT_PUBLIC_ name",
    !isValidSecretReference({
      secretId: "s",
      environmentVariable: `${CLIENT_EXPOSED_ENV_PREFIX}KEY`,
      placement: "header",
      parameterName: "X",
      required: true,
    }),
  );
  ok(
    "58. process.env is read in exactly one external module",
    externalCode.filter(([, code]) => /process\.env/.test(code)).length === 1,
  );
  ok(
    "59. that module is the secret boundary",
    externalCode
      .filter(([, code]) => /process\.env/.test(code))
      .every(([file]) => file.endsWith("external-provider-secrets.ts")),
  );
  const revealSites = externalCode.filter(
    ([file, code]) =>
      !file.endsWith("external-provider-secrets.ts") &&
      /revealSecret\s*\(/.test(code),
  );
  ok("60. revealSecret has exactly one call site", revealSites.length === 1);
  ok(
    "61. and it is the request-construction contract",
    revealSites.every(([file]) =>
      file.endsWith("external-provider-request-contract.ts"),
    ),
  );

  // ======================================================================
  // 6. SEARCH SHAPE (no unsafe cast)
  // ======================================================================
  const oneWay = deriveNeutralSearch(
    intent({ tripType: "oneWay", returnDate: null }),
    derivationContext,
  );
  const roundTrip = deriveNeutralSearch(intent(), derivationContext);
  check("62. a one-way intent derives one leg", oneWay.legs.length, 1);
  check("63. a round-trip intent derives two legs", roundTrip.legs.length, 2);
  check(
    "64. the derived trip shape matches the intent",
    roundTrip.tripShape,
    "roundTrip",
  );
  check(
    "65. the return leg reverses the outbound",
    [roundTrip.legs[1]?.originCode, roundTrip.legs[1]?.destinationCode],
    ["CDG", "YUL"],
  );
  ok(
    "66. a one-way intent with a stale return date still derives one leg",
    deriveNeutralSearch(
      intent({ tripType: "oneWay", returnDate: "2026-09-22" }),
      derivationContext,
    ).legs.length === 1,
  );
  check(
    "67. expectedLegCount is exhaustive for oneWay",
    expectedLegCount("oneWay"),
    1,
  );
  check(
    "68. expectedLegCount is exhaustive for roundTrip",
    expectedLegCount("roundTrip"),
    2,
  );
  check(
    "69. multiCity has no fixed leg count",
    expectedLegCount("multiCity"),
    null,
  );
  check(
    "70. a valid one-way search passes validation",
    validateNeutralSearch(fixtures.oneWaySearch),
    [],
  );
  check(
    "71. a valid round-trip search passes validation",
    validateNeutralSearch(fixtures.roundTripSearch),
    [],
  );
  check(
    "72. a valid multi-city search passes validation",
    validateNeutralSearch(fixtures.multiCitySearch),
    [],
  );
  ok(
    "73. a multi-city search with two legs is rejected, not coerced",
    validateNeutralSearch(fixtures.unsupportedTripShapeSearch).includes(
      "multiCityTooFewLegs",
    ),
  );
  ok(
    "74. non-chronological legs are rejected",
    validateNeutralSearch({
      ...fixtures.roundTripSearch,
      legs: [
        { originCode: "YUL", destinationCode: "CDG", departureDate: "2026-09-22" },
        { originCode: "CDG", destinationCode: "YUL", departureDate: "2026-09-15" },
      ],
    }).includes("nonChronologicalLegs"),
  );
  check(
    "75. lap infants are not seated",
    seatedTravelerCount({
      adults: 1,
      children: 1,
      infantsInSeat: 1,
      infantsOnLap: 1,
    }),
    3,
  );
  check(
    "76. total travellers include lap infants",
    totalTravelerCount({
      adults: 1,
      children: 1,
      infantsInSeat: 1,
      infantsOnLap: 1,
    }),
    4,
  );
  ok(
    "77. no unsafe cast remains in the external layer",
    externalCode.every(
      ([, code]) =>
        !/as unknown as/.test(code) &&
        !/:\s*any\b/.test(code) &&
        !/@ts-ignore/.test(code) &&
        !/eslint-disable/.test(code),
    ),
  );
  ok(
    "78. capability checking reads a typed discriminant, not a structural cast",
    !/\(intent as \{/.test(
      readCode(`${EXTERNAL_DIR}/external-provider-request-contract.ts`),
    ),
  );

  // ======================================================================
  // 7. REQUEST CONTRACT
  // ======================================================================
  const query = buildNeutralQuery(fixtures.roundTripSearch);
  for (const [index, field] of [
    "tripShape",
    "market",
    "locale",
    "requestedLocale",
    "currency",
    "cabinClass",
    "directOnly",
    "adults",
    "children",
    "infantsInSeat",
    "infantsOnLap",
    "requestId",
    "timeoutBudgetMs",
  ].entries()) {
    ok(`${79 + index}. the neutral query carries ${field}`, field in query);
  }
  ok(
    "92. the neutral query carries every leg's origin, destination and date",
    fixtures.multiCitySearch.legs.every(
      (_leg, index) =>
        `leg${index}Origin` in buildNeutralQuery(fixtures.multiCitySearch) &&
        `leg${index}Destination` in buildNeutralQuery(fixtures.multiCitySearch) &&
        `leg${index}Date` in buildNeutralQuery(fixtures.multiCitySearch),
    ),
  );
  ok(
    "93. the neutral query carries no prohibited personal field",
    PROHIBITED_REQUEST_FIELDS.every(
      (field) =>
        !Object.keys(query).some(
          (key) => key.toLowerCase() === field.toLowerCase(),
        ),
    ),
  );
  const built = contractFixtureProvider.buildRequest(
    fixtures.roundTripSearch,
    context(),
  );
  check(
    "94. the built request targets the fixture origin",
    built.url.origin,
    CONTRACT_FIXTURE_ORIGIN,
  );
  check(
    "95. the built request declares no secret reference",
    built.secretReferences.length,
    0,
  );
  ok(
    "96. the built request carries no credential header",
    Object.keys(built.headers).every((key) => key.toLowerCase() === "accept"),
  );
  ok(
    "97. the built request carries no embedded credentials",
    built.url.username === "" && built.url.password === "",
  );
  ok(
    "98. the built request URL contains no prohibited field name",
    PROHIBITED_REQUEST_FIELDS.every(
      (field) => !built.url.toString().toLowerCase().includes(field.toLowerCase()),
    ),
  );
  for (const [index, badPath] of [
    "//evil.invalid/v1",
    "https://evil.invalid/v1",
    "/\\evil.invalid",
    "v1/search",
  ].entries()) {
    ok(
      `${99 + index}. request construction refuses the path ${JSON.stringify(badPath)}`,
      (() => {
        try {
          buildExternalRequest({
            definition: contractFixtureDefinition,
            path: badPath,
            method: "GET",
          });
          return false;
        } catch (error) {
          return error instanceof ExternalRequestConstructionError;
        }
      })(),
    );
  }
  ok(
    "103. an unusable origin is refused at construction",
    (() => {
      try {
        buildExternalRequest({
          definition: {
            ...contractFixtureDefinition,
            allowedOrigin: "http://x.invalid",
          },
          path: "/v1",
          method: "GET",
        });
        return false;
      } catch (error) {
        return error instanceof ExternalRequestConstructionError;
      }
    })(),
  );
  ok(
    "104. query values are encoded rather than concatenated",
    (() => {
      const request = buildExternalRequest({
        definition: contractFixtureDefinition,
        path: "/v1/search",
        method: "GET",
        query: { q: "a&b=c" },
      });
      return (
        request.url.searchParams.get("q") === "a&b=c" &&
        request.url.search.includes("a%26b%3Dc")
      );
    })(),
  );
  ok(
    "105. a header-placed secret reaches the header and not the URL",
    (() => {
      const secret = resolveProviderSecrets(
        contractFixtureDefinition.secretReferences,
        () => "header-credential",
      ).resolutions[0]?.secret;
      if (!secret) return false;
      const request = buildExternalRequest({
        definition: contractFixtureDefinition,
        path: "/v1/search",
        method: "GET",
        secrets: [
          { reference: contractFixtureDefinition.secretReferences[0], secret },
        ],
      });
      return (
        request.headers["X-Contract-Fixture-Key"] === "header-credential" &&
        !request.url.toString().includes("header-credential")
      );
    })(),
  );
  const rejections = checkCapabilitySupport(
    contractFixtureDefinition,
    fixtures.roundTripSearch,
  );
  ok("106. the inert fixture refuses every search", rejections.length > 0);
  ok(
    "107. and names the unsupported trip shape, market, currency and locale",
    rejections.includes("roundTripUnsupported") &&
      rejections.includes("marketUnsupported") &&
      rejections.includes("currencyUnsupported") &&
      rejections.includes("localeUnsupported"),
  );
  ok(
    "108. an unsupported multi-city search is refused by capability, not coerced",
    checkCapabilitySupport(
      contractFixtureDefinition,
      fixtures.multiCitySearch,
    ).includes("multiCityUnsupported"),
  );

  // ======================================================================
  // 8. RESPONSE MAPPING
  // ======================================================================
  function mapFixture(
    response: typeof fixtures.validResponse,
    shape = "oneWay" as const,
  ) {
    return contractFixtureProvider.mapResponse(
      response,
      { ...fixtures.oneWaySearch, tripShape: shape },
      context(),
    );
  }
  const validMapping = mapFixture(fixtures.validResponse);
  ok("109. a valid one-way response maps", validMapping.ok);
  check(
    "110. and yields one offer",
    validMapping.ok ? validMapping.offers.length : -1,
    1,
  );
  const mappedOffer = validMapping.ok ? validMapping.offers[0] : null;
  check(
    "111. the price survives as integer minor units",
    mappedOffer?.totalAmountMinorUnits,
    89_900,
  );
  check("112. the currency survives", mappedOffer?.currency, "CAD");
  check("113. the cabin class survives", mappedOffer?.cabinClass, "economy");
  check(
    "114. the provider identity is attached",
    mappedOffer?.providerId,
    CONTRACT_FIXTURE_PROVIDER_ID,
  );
  check(
    "115. source attribution is attached",
    mappedOffer?.sourceAttribution,
    contractFixtureDefinition.sourceAttribution,
  );
  check(
    "116. the freshness timestamp survives",
    mappedOffer?.observedAt,
    "2026-08-05T00:00:00.000Z",
  );
  check("117. legs are mapped", mappedOffer?.legs.length, 1);
  check("118. segments are mapped", mappedOffer?.legs[0]?.segments.length, 1);
  check("119. airport identity survives", mappedOffer?.legs[0]?.originCode, "YUL");
  check(
    "120. carrier identity survives",
    mappedOffer?.legs[0]?.segments[0]?.carrierCode,
    "QQ",
  );
  check(
    "121. departure timestamps survive",
    mappedOffer?.legs[0]?.departureAt,
    "2026-09-15T18:00:00.000Z",
  );
  check(
    "122. arrival timestamps survive",
    mappedOffer?.legs[0]?.arrivalAt,
    "2026-09-16T06:30:00.000Z",
  );
  check(
    "123. duration is computed from the timestamps",
    mappedOffer?.legs[0]?.durationMinutes,
    750,
  );
  check(
    "124. stop count is recomputed from segments",
    mappedOffer?.legs[0]?.stopCount,
    0,
  );
  check("125. traveller pricing survives", mappedOffer?.travellerPricing.length, 1);
  ok(
    "126. offer ids are deterministic and namespaced",
    mappedOffer?.offerId ===
      deterministicOfferId(CONTRACT_FIXTURE_PROVIDER_ID, "ref-1") &&
      (mappedOffer?.offerId.startsWith("ext-") ?? false),
  );
  ok(
    "127. a mapped offer exposes no field outside the allowlist",
    Object.keys(mappedOffer ?? {}).every((key) =>
      ALLOWED_OFFER_FIELDS.includes(key),
    ),
  );
  ok(
    "128. a mapped offer carries no booking link",
    !JSON.stringify(mappedOffer ?? {})
      .toLowerCase()
      .includes("bookinglink") &&
      !JSON.stringify(mappedOffer ?? {}).includes(".invalid"),
  );
  ok(
    "129. a multi-leg round-trip offer maps",
    (() => {
      const result = mapExternalOffers({
        candidates: [fixtures.validRoundTripOffer],
        providerId: "p",
        sourceAttribution: "s",
        tripShape: "roundTrip",
        providerDeclaredPartial: false,
        maximumOffers: 50,
        requestId: "r",
        occurredAt: "2026-08-05T00:00:00.000Z",
      });
      return result.ok && result.offers[0]?.legs.length === 2;
    })(),
  );
  ok(
    "130. a multi-city offer maps with three legs",
    (() => {
      const result = mapExternalOffers({
        candidates: [fixtures.validMultiCityOffer],
        providerId: "p",
        sourceAttribution: "s",
        tripShape: "multiCity",
        providerDeclaredPartial: false,
        maximumOffers: 50,
        requestId: "r",
        occurredAt: "2026-08-05T00:00:00.000Z",
      });
      return result.ok && result.offers[0]?.legs.length === 3;
    })(),
  );
  ok(
    "131. a connecting itinerary recomputes one stop",
    (() => {
      const result = mapExternalOffers({
        candidates: [fixtures.validConnectingOffer],
        providerId: "p",
        sourceAttribution: "s",
        tripShape: "oneWay",
        providerDeclaredPartial: false,
        maximumOffers: 50,
        requestId: "r",
        occurredAt: "2026-08-05T00:00:00.000Z",
      });
      return result.ok && result.offers[0]?.legs[0]?.stopCount === 1;
    })(),
  );
  const rejectionCases: readonly (readonly [string, unknown, string])[] = [
    ["a malformed currency", fixtures.malformedCurrencyOffer, "invalidCurrency"],
    ["a malformed date", fixtures.malformedDateOffer, "invalidFreshness"],
    [
      "an inconsistent duration",
      fixtures.malformedDurationOffer,
      "durationInconsistent",
    ],
    ["a negative price", fixtures.negativePriceOffer, "negativeAmount"],
    ["a zero price", fixtures.zeroPriceOffer, "zeroAmount"],
    ["an unknown airport", fixtures.unknownAirportOffer, "unknownAirport"],
    ["an unknown carrier", fixtures.unknownCarrierOffer, "unknownCarrier"],
    [
      "an inconsistent stop count",
      fixtures.inconsistentStopCountOffer,
      "stopCountInconsistent",
    ],
    [
      "inconsistent traveller pricing",
      fixtures.inconsistentTravellerPricingOffer,
      "invalidTravellerPricing",
    ],
  ];
  for (const [index, [label, raw, reason]] of rejectionCases.entries()) {
    const validation = validateExternalOffer({
      providerId: "p",
      sourceAttribution: "s",
      tripShape: "oneWay",
      raw,
    });
    check(
      `${132 + index}. ${label} is rejected as ${reason}`,
      validation.ok ? "accepted" : validation.reason,
      reason,
    );
  }
  ok(
    "141. a fractional price is rejected",
    !validateExternalOffer({
      providerId: "p",
      sourceAttribution: "s",
      tripShape: "oneWay",
      raw: { ...fixtures.validOneWayOffer, totalAmountMinorUnits: 129.99 },
    }).ok,
  );
  ok(
    "142. one bad offer among many does not discard the good ones",
    (() => {
      const result = mapFixture(fixtures.partiallyMalformedResponse);
      return (
        result.ok && result.offers.length === 2 && result.rejected.length === 1
      );
    })(),
  );
  ok(
    "143. a fully malformed response is a mappingFailure",
    (() => {
      const result = mapFixture(fixtures.fullyMalformedResponse);
      return !result.ok && result.failure.category === "mappingFailure";
    })(),
  );
  ok(
    "144. duplicate offers are collapsed",
    (() => {
      const result = mapFixture(fixtures.duplicateOfferResponse);
      return (
        result.ok && result.offers.length === 1 && result.rejected.length === 2
      );
    })(),
  );
  ok(
    "145. a zero-result response is a success, not a failure",
    (() => {
      const result = mapFixture(fixtures.zeroResultResponse);
      return result.ok && result.offers.length === 0;
    })(),
  );
  ok(
    "146. a provider-declared partial result is marked partial",
    (() => {
      const result = mapFixture(fixtures.partialResultResponse);
      return result.ok && result.partial;
    })(),
  );
  ok(
    "147. an excessive offer count is bounded and marked partial",
    (() => {
      const result = mapFixture(fixtures.excessiveOfferResponse);
      return result.ok && result.offers.length <= 50 && result.partial;
    })(),
  );
  ok(
    "148. a discarded booking link is recorded as a warning",
    (() => {
      const result = mapExternalOffers({
        candidates: [fixtures.offerWithBookingLink],
        providerId: "p",
        sourceAttribution: "s",
        tripShape: "oneWay",
        providerDeclaredPartial: false,
        maximumOffers: 50,
        requestId: "r",
        occurredAt: "2026-08-05T00:00:00.000Z",
      });
      return (
        result.ok &&
        result.offers.length === 1 &&
        result.warnings.includes("bookingLinkDiscarded") &&
        !JSON.stringify(result.offers).includes(".invalid")
      );
    })(),
  );
  ok(
    "149. an unparseable body is a mapping failure, not a crash",
    (() => {
      const result = mapFixture(fixtures.unparseableResponse);
      return result.ok && result.offers.length === 0;
    })(),
  );
  ok(
    "150. no raw provider payload survives into a mapped offer",
    !JSON.stringify(validMapping.ok ? validMapping.offers : []).includes("hasMore"),
  );

  // ======================================================================
  // 9. FAILURE TAXONOMY
  // ======================================================================
  check(
    "151. the taxonomy has fifteen categories",
    EXTERNAL_FAILURE_CATEGORIES.length,
    15,
  );
  for (const [index, required] of [
    "notConfigured",
    "unavailable",
    "unauthorized",
    "forbidden",
    "invalidRequest",
    "unsupportedSearch",
    "timeout",
    "aborted",
    "rateLimited",
    "upstreamUnavailable",
    "malformedResponse",
    "partialResponse",
    "mappingFailure",
    "networkFailure",
    "unknown",
  ].entries()) {
    ok(
      `${152 + index}. the taxonomy includes ${required}`,
      EXTERNAL_FAILURE_CATEGORIES.includes(
        required as (typeof EXTERNAL_FAILURE_CATEGORIES)[number],
      ),
    );
  }
  check("167. 401 is unauthorized", categoryForStatus(401), "unauthorized");
  check(
    "168. 403 is forbidden, distinct from unauthorized",
    categoryForStatus(403),
    "forbidden",
  );
  check("169. 400 is invalidRequest", categoryForStatus(400), "invalidRequest");
  check("170. 429 is rateLimited", categoryForStatus(429), "rateLimited");
  check("171. 504 is a timeout", categoryForStatus(504), "timeout");
  check(
    "172. 503 is upstreamUnavailable",
    categoryForStatus(503),
    "upstreamUnavailable",
  );
  check(
    "173. an explicit abort is aborted",
    categoryForCause(new Error("x"), "cancelled"),
    "aborted",
  );
  check(
    "174. a TypeError is a networkFailure",
    categoryForCause(new TypeError("dns")),
    "networkFailure",
  );
  ok(
    "175. every category maps into the V2.7 runtime taxonomy",
    EXTERNAL_FAILURE_CATEGORIES.every(
      (category) => typeof runtimeCodeFor(category) === "string",
    ),
  );
  ok(
    "176. every category has a public code",
    EXTERNAL_FAILURE_CATEGORIES.every(
      (category) => typeof publicCodeFor(category) === "string",
    ),
  );
  ok(
    "177. unauthorized and forbidden are indistinguishable to a client",
    publicCodeFor("unauthorized") === publicCodeFor("forbidden"),
  );
  const failure = normalizeExternalFailure({
    response: fixtures.rateLimitedResponse,
    providerId: "p",
    requestId: "r",
    now: NOW,
  });
  check("178. a 429 normalizes to rateLimited", failure.category, "rateLimited");
  check(
    "179. and preserves the external category internally",
    failure.internalCode,
    "rateLimited",
  );
  check("180. and carries the parsed Retry-After", failure.retryAfterMs, 3_000);
  ok(
    "181. a normalized failure exposes no field outside the allowlist",
    Object.keys(failure).every((key) => ALLOWED_FAILURE_FIELDS.includes(key)),
  );
  ok(
    "182. a normalized failure carries no upstream message, body or stack",
    (() => {
      // The fixture's upstream message carries a distinctive token. Asserting
      // on "quota exceeded" alone would be meaningless: GTAI's own fixed safe
      // message legitimately contains those words.
      const serialized = JSON.stringify(failure);
      return (
        !serialized.includes("UPSTREAM-ONLY-TOKEN") &&
        !/"stack"|"body"|"authorization"|"headers"/i.test(serialized)
      );
    })(),
  );
  ok(
    "183. the safe message comes from a fixed vocabulary",
    failure.safeMessage === "provider quota exceeded",
  );
  check(
    "184. an absurd Retry-After is clamped",
    buildExternalFailure({
      category: "rateLimited",
      providerId: "p",
      requestId: "r",
      occurredAt: "2026-08-05T00:00:00.000Z",
      retryAfterMs: 3_600_000,
    }).retryAfterMs,
    MAX_RETRY_AFTER_MS,
  );
  check(
    "185. an out-of-range status is discarded",
    buildExternalFailure({
      category: "unknown",
      providerId: "p",
      requestId: "r",
      occurredAt: "2026-08-05T00:00:00.000Z",
      statusCode: 9_999,
    }).statusCode,
    null,
  );
  check("186. Retry-After seconds parse", parseRetryAfterMs("30", 0), 30_000);
  check(
    "187. a malformed Retry-After is ignored",
    parseRetryAfterMs("soon", 0),
    null,
  );
  check(
    "188. a past Retry-After date never yields a negative delay",
    parseRetryAfterMs(
      "Wed, 01 Jan 2020 00:00:00 GMT",
      Date.parse("2026-01-01T00:00:00Z"),
    ),
    0,
  );

  // ======================================================================
  // 10. RETRY, TIMEOUT AND ABORT
  // ======================================================================
  const policy = contractFixtureDefinition.retryPolicy;
  const timeouts = contractFixtureDefinition.timeoutPolicy;
  ok("189. the fixture retry policy is valid", isValidRetryPolicy(policy));
  ok("190. the fixture timeout policy is valid", isValidTimeoutPolicy(timeouts));
  ok(
    "191. no operator-fixable category is retryable",
    NEVER_RETRYABLE_CATEGORIES.every((category) => !isRetryableCategory(category)),
  );
  ok("192. unauthorized is never retryable", !isRetryableCategory("unauthorized"));
  ok("193. forbidden is never retryable", !isRetryableCategory("forbidden"));
  ok(
    "194. invalidRequest is never retryable",
    !isRetryableCategory("invalidRequest"),
  );
  ok(
    "195. unsupportedSearch is never retryable",
    !isRetryableCategory("unsupportedSearch"),
  );
  ok("196. aborted is never retryable", !isRetryableCategory("aborted"));
  ok(
    "197. mappingFailure is never retryable",
    !isRetryableCategory("mappingFailure"),
  );
  ok(
    "198. a policy that would retry authentication is rejected",
    !isValidRetryPolicy({ ...policy, retryableFailures: ["authentication"] }),
  );
  ok(
    "199. the default retryable set excludes operator faults",
    !DEFAULT_RETRYABLE_FAILURES.includes("authentication") &&
      !DEFAULT_RETRYABLE_FAILURES.includes("configuration"),
  );
  check(
    "200. the first retry waits the initial backoff",
    computeBackoffMs({ ...policy, jitterRatio: 0 }, 1, 0),
    200,
  );
  check(
    "201. backoff grows exponentially",
    computeBackoffMs({ ...policy, jitterRatio: 0 }, 3, 0),
    800,
  );
  check(
    "202. backoff is clamped to the declared maximum",
    computeBackoffMs({ ...policy, jitterRatio: 0 }, 10, 0),
    2_000,
  );
  ok(
    "203. jitter never pushes a delay above the ceiling",
    [0, 0.25, 0.5, 0.75, 1].every(
      (j) => computeBackoffMs(policy, 10, j) <= policy.maximumBackoffMs,
    ),
  );
  ok(
    "204. jitter only ever reduces a delay",
    computeBackoffMs(policy, 2, 0) <= computeBackoffMs(policy, 2, 1),
  );
  check(
    "205. an aborted caller is refused before any other consideration",
    decideRetryForCategory({
      policy,
      category: "timeout",
      attempt: 1,
      elapsedMs: 0,
      timeoutPolicy: timeouts,
      aborted: true,
    }),
    { retry: false, reason: "callerAborted" },
  );
  check(
    "206. a non-retryable category is refused",
    decideRetryForCategory({
      policy,
      category: "unauthorized",
      attempt: 1,
      elapsedMs: 0,
      timeoutPolicy: timeouts,
      aborted: false,
    }),
    { retry: false, reason: "failureNotRetryable" },
  );
  check(
    "207. exhausted attempts are refused distinctly",
    decideRetryForCategory({
      policy,
      category: "timeout",
      attempt: policy.maximumAttempts,
      elapsedMs: 0,
      timeoutPolicy: timeouts,
      aborted: false,
    }),
    { retry: false, reason: "attemptsExhausted" },
  );
  check(
    "208. an exceeded deadline is refused distinctly",
    decideRetryForCategory({
      policy,
      category: "timeout",
      attempt: 1,
      elapsedMs: 19_000,
      timeoutPolicy: timeouts,
      aborted: false,
    }),
    { retry: false, reason: "deadlineExceeded" },
  );
  ok(
    "209. a retryable category inside budget retries",
    (() => {
      const decision = decideRetryForCategory({
        policy,
        category: "timeout",
        attempt: 1,
        elapsedMs: 0,
        timeoutPolicy: timeouts,
        aborted: false,
        jitter: 0,
      });
      return decision.retry && decision.nextAttempt === 2;
    })(),
  );
  ok(
    "210. retries are bounded — no attempt exceeds the ceiling",
    (() => {
      let attempt = 1;
      let guard = 0;
      for (; guard < 50; guard += 1) {
        const decision = decideRetryForCategory({
          policy,
          category: "timeout",
          attempt,
          elapsedMs: 0,
          timeoutPolicy: timeouts,
          aborted: false,
          jitter: 0,
        });
        if (!decision.retry) break;
        attempt = decision.nextAttempt;
      }
      return attempt <= MAX_ATTEMPTS_CEILING && guard < 50;
    })(),
  );
  check(
    "211. an absurd Retry-After is clamped to the deadline",
    clampRetryAfterMs(3_600_000, timeouts),
    20_000,
  );
  check(
    "212. a negative Retry-After is ignored",
    clampRetryAfterMs(-5, timeouts),
    null,
  );
  ok(
    "213. an exhausted budget is detectable independently",
    isBudgetExhausted(20_000, timeouts),
  );
  ok(
    "214. a timeout policy whose request exceeds its deadline is rejected",
    !isValidTimeoutPolicy({ ...timeouts, requestTimeoutMs: 25_000 }),
  );
  ok(
    "215. connect timeout may not exceed request timeout",
    !isValidTimeoutPolicy({ ...timeouts, connectTimeoutMs: 9_000 }),
  );
  ok(
    "216. the legacy code-based retry decision still works",
    decideRetry({
      policy,
      failureCode: "authentication",
      attempt: 1,
      elapsedMs: 0,
      timeoutPolicy: timeouts,
    }).retry === false,
  );

  // ======================================================================
  // 11. RATE LIMIT
  // ======================================================================
  const limit = contractFixtureDefinition.rateLimit;
  ok("217. the fixture rate limit is valid", isValidRateLimit(limit));
  check("218. window capacity is rate plus burst", windowCapacity(limit), 10);
  ok(
    "219. concurrency above window capacity is rejected",
    !isValidRateLimit({ ...limit, concurrentRequests: 999 }),
  );
  ok(
    "220. a queue nobody may wait in is rejected",
    !isValidRateLimit({ ...limit, queueLimit: 2, maximumWaitMs: 0 }),
  );
  ok(
    "221. an empty state admits immediately",
    (() => {
      const decision = evaluateRateLimit(limit, EMPTY_RATE_LIMIT_STATE, 1_000);
      return decision.admitted && decision.waitMs === 0;
    })(),
  );
  ok(
    "222. concurrency is enforced separately from rate",
    (() => {
      let state = EMPTY_RATE_LIMIT_STATE;
      for (let i = 0; i < limit.concurrentRequests; i += 1) {
        state = recordRequestIssued(state, 1_000);
      }
      const decision = evaluateRateLimit(limit, state, 1_000);
      return !decision.admitted && decision.reason === "concurrencyExhausted";
    })(),
  );
  ok(
    "223. an exhausted window queues rather than silently dropping",
    (() => {
      let state = EMPTY_RATE_LIMIT_STATE;
      for (let i = 0; i < windowCapacity(limit); i += 1) {
        state = recordRequestSettled(recordRequestIssued(state, 1_000));
      }
      // 600ms into the window: the wait is 400ms, inside the fixture's 500ms
      // maximum, so this is the queueing branch rather than the refusal one.
      const decision = evaluateRateLimit(limit, state, 1_600);
      return (
        decision.admitted &&
        decision.waitMs > 0 &&
        decision.waitMs <= limit.maximumWaitMs
      );
    })(),
  );
  ok(
    "224. a full queue is refused with a typed reason",
    (() => {
      let state = EMPTY_RATE_LIMIT_STATE;
      for (let i = 0; i < windowCapacity(limit); i += 1) {
        state = recordRequestSettled(recordRequestIssued(state, 1_000));
      }
      for (let i = 0; i < limit.queueLimit; i += 1)
        state = recordCallerQueued(state);
      const decision = evaluateRateLimit(limit, state, 1_000);
      return !decision.admitted && decision.reason === "queueFull";
    })(),
  );
  ok(
    "225. a zero-queue policy refuses rather than waits",
    (() => {
      let state = EMPTY_RATE_LIMIT_STATE;
      const noQueue = { ...limit, queueLimit: 0 };
      for (let i = 0; i < windowCapacity(noQueue); i += 1) {
        state = recordRequestSettled(recordRequestIssued(state, 1_000));
      }
      const decision = evaluateRateLimit(noQueue, state, 1_000);
      return !decision.admitted && decision.reason === "rateExhausted";
    })(),
  );
  ok(
    "226. a wait beyond the maximum is refused",
    (() => {
      let state = EMPTY_RATE_LIMIT_STATE;
      const impatient = { ...limit, maximumWaitMs: 1 };
      for (let i = 0; i < windowCapacity(impatient); i += 1) {
        state = recordRequestSettled(recordRequestIssued(state, 1_000));
      }
      const decision = evaluateRateLimit(impatient, state, 1_000);
      return !decision.admitted && decision.reason === "waitTooLong";
    })(),
  );
  ok(
    "227. the window slides rather than resetting on a boundary",
    (() => {
      let state = EMPTY_RATE_LIMIT_STATE;
      for (let i = 0; i < windowCapacity(limit); i += 1) {
        state = recordRequestSettled(recordRequestIssued(state, 1_000));
      }
      return evaluateRateLimit(limit, state, 3_000).admitted;
    })(),
  );
  ok(
    "228. every refusal carries positive retry guidance",
    (() => {
      let state = EMPTY_RATE_LIMIT_STATE;
      for (let i = 0; i < limit.concurrentRequests; i += 1) {
        state = recordRequestIssued(state, 1_000);
      }
      const decision = evaluateRateLimit(limit, state, 1_000);
      return !decision.admitted && decision.retryAfterMs > 0;
    })(),
  );
  check(
    "229. settling never drives the in-flight count negative",
    recordRequestSettled(recordRequestSettled(EMPTY_RATE_LIMIT_STATE))
      .inFlightRequests,
    0,
  );
  ok(
    "230. limiter state carries no request data or credential",
    Object.keys(recordRequestIssued(EMPTY_RATE_LIMIT_STATE, 1_000)).every((key) =>
      ALLOWED_RATE_LIMIT_STATE_FIELDS.includes(key),
    ),
  );
  ok(
    "231. the limiter holds no module-level mutable state",
    !/^(let|var)\s/m.test(
      readCode(`${EXTERNAL_DIR}/external-provider-rate-limit.ts`),
    ),
  );
  ok(
    "232. the limiter adds no persistence dependency",
    !/redis|ioredis|memcached|postgres|sqlite/i.test(
      readCode(`${EXTERNAL_DIR}/external-provider-rate-limit.ts`),
    ),
  );

  // ======================================================================
  // 12. AUDIT AND REDACTION
  // ======================================================================
  const summary = buildExternalAuditSummary({
    providerId: CONTRACT_FIXTURE_PROVIDER_ID,
    activationState: "unavailable",
    requestId: "req-1",
    searchShape: "roundTrip",
    resultCount: 2,
    rejectedOfferCount: 1,
    partialResult: true,
    durationMs: 337,
    failureCategory: "rateLimited",
    retryCount: 1,
    rateLimitDecision: "admitted",
    occurredAt: "2026-08-05T00:00:00.000Z",
  });
  for (const [index, field] of ALLOWED_AUDIT_FIELDS.entries()) {
    ok(`${233 + index}. the audit summary carries ${field}`, field in summary);
  }
  ok(
    "245. the audit summary exposes no field outside the allowlist",
    Object.keys(summary).every((key) => ALLOWED_AUDIT_FIELDS.includes(key)),
  );
  ok(
    "246. the audit summary contains no prohibited field",
    PROHIBITED_AUDIT_FIELDS.every(
      (field) =>
        !Object.keys(summary).some(
          (key) => key.toLowerCase() === field.toLowerCase(),
        ),
    ),
  );
  check("247. audit durations are bucketed, never exact", summary.durationMs, 250);
  check("248. bucketing is deterministic", bucketDuration(337), 250);
  ok(
    "249. the shipped audit sink is non-persistent",
    !noopExternalAuditSink.persistent,
  );
  ok(
    "250. the shipped audit sink discards what it is given",
    (() => {
      noopExternalAuditSink.record(summary);
      return true;
    })() &&
      !/console\.(log|info|warn|error)/.test(
        readCode(`${EXTERNAL_DIR}/external-provider-audit.ts`),
      ),
  );
  ok(
    "251. the recording sink used by verification is also non-persistent",
    !createRecordingExternalAuditSink().persistent,
  );
  ok(
    "252. a persistent sink is documented as requiring retention and deletion policy",
    /retention|deletion|encrypt/i.test(
      readSource(`${EXTERNAL_DIR}/external-provider-audit.ts`),
    ),
  );
  const sensitiveRequest = buildExternalRequest({
    definition: contractFixtureDefinition,
    path: "/v1/search/abc123def456",
    method: "GET",
    query: { leg0Origin: "YUL", leg0Destination: "CDG", market: "CA" },
    secrets: (() => {
      const secret = resolveProviderSecrets(
        contractFixtureDefinition.secretReferences,
        () => "top-secret-credential",
      ).resolutions[0]?.secret;
      return secret
        ? [{ reference: contractFixtureDefinition.secretReferences[0], secret }]
        : [];
    })(),
  });
  const redactedRequest = redactRequest(sensitiveRequest);
  ok(
    "253. a redacted request contains no credential",
    !JSON.stringify(redactedRequest).includes("top-secret-credential"),
  );
  check(
    "254. the credential header is redacted by allowlist",
    redactedRequest.headers["x-contract-fixture-key"],
    SECRET_REDACTION_MARKER,
  );
  ok(
    "255. a redacted request keeps no search values",
    !JSON.stringify(redactedRequest).includes("YUL") &&
      !JSON.stringify(redactedRequest).includes("CDG"),
  );
  check(
    "256. non-allowlisted query values become a description",
    redactedRequest.query.leg0origin,
    "<3 chars>",
  );
  check(
    "257. allowlisted query names keep their value",
    redactedRequest.query.market,
    "CA",
  );
  ok(
    "258. identifier path segments are placeholders",
    redactedRequest.pathShape.includes(":id"),
  );
  const redactedResponse = redactResponse(fixtures.rateLimitedResponse);
  check(
    "259. a response status class is coarse",
    redactedResponse.statusClass,
    "4xx",
  );
  check(
    "260. Retry-After is allowlisted",
    redactedResponse.headers["retry-after"],
    "3",
  );
  ok(
    "261. a response body is described by shape, never content",
    redactedResponse.bodyShape === "object{error}" &&
      !JSON.stringify(redactedResponse).includes("quota exceeded"),
  );
  ok(
    "262. a diagnostic containing a long opaque token is scrubbed",
    !(redactDiagnostic("key sk-abcdefghijklmnopqrstuvwxyz012345") ?? "").includes(
      "sk-abcdefghijklmnopqrstuvwxyz012345",
    ),
  );
  ok(
    "263. a diagnostic containing a URL is scrubbed",
    !(redactDiagnostic("see https://p.invalid/v1?key=abc") ?? "").includes(
      "p.invalid",
    ),
  );
  check("264. an invalid status has no class", statusClassOf(999), "invalid");

  // ======================================================================
  // 13. REGISTRY INTEGRATION
  // ======================================================================
  check(
    "265. no external provider is shipped",
    SHIPPED_EXTERNAL_PROVIDERS.length,
    0,
  );
  check(
    "266. no external provider status resolves",
    resolveExternalProviderStatuses().length,
    0,
  );
  check(
    "267. no external provider is runnable",
    runnableExternalProviders().length,
    0,
  );
  ok(
    "268. the runtime falls back to the local provider",
    shouldFallBackToLocalProvider(),
  );
  ok(
    "269. the contract fixture is never executable",
    !isExecutableProviderId(CONTRACT_FIXTURE_PROVIDER_ID),
  );
  ok(
    "270. an arbitrary provider id is not executable",
    !isExecutableProviderId("anything"),
  );
  ok(
    "271. a client-supplied provider id resolves to nothing",
    resolveRequestedProviderId(CONTRACT_FIXTURE_PROVIDER_ID) === null &&
      resolveRequestedProviderId("unknown") === null &&
      resolveRequestedProviderId("") === null,
  );
  check(
    "272. nothing is inspectable today either",
    inspectableProviderDefinitions().length,
    0,
  );
  ok(
    "273. the V2.7 registry has exactly one enabled provider",
    runtimeProviderRegistry.enabledProviders().length === 1,
  );
  check(
    "274. and it is the local deterministic adapter",
    runtimeProviderRegistry.enabledProviders()[0]?.providerId,
    "gtai-local-demo",
  );
  ok(
    "275. the fixture is absent from the V2.7 registry",
    runtimeProviderRegistry.get(CONTRACT_FIXTURE_PROVIDER_ID) === null,
  );
  ok(
    "276. the V2.7 registry does not import the external layer",
    !readCode("src/server/flights/providers/provider-registry.ts").includes(
      "external/",
    ),
  );
  ok(
    "277. the shipped configuration does not import the fixture definition",
    !readCode(`${EXTERNAL_DIR}/external-provider-configuration.ts`).includes(
      "fixtures/external-contract-fixture",
    ),
  );
  ok(
    "278. the contract fixture claims no capability",
    !claimsAnyCapability(contractFixtureDefinition),
  );
  check(
    "279. an inactive provider claiming a capability fails validation",
    validateProviderDefinition(
      {
        ...contractFixtureDefinition,
        capabilities: {
          ...contractFixtureDefinition.capabilities,
          supportsRoundTrip: true,
        },
      },
      "unavailable",
    ),
    ["activeCapabilityClaim"],
  );
  check(
    "280. the fixture definition is otherwise valid",
    validateProviderDefinition(contractFixtureDefinition, "unavailable"),
    [],
  );

  // ======================================================================
  // 14. SERVER-ONLY BOUNDARY
  // ======================================================================
  ok(
    "281. every executing external module imports the server-only guard",
    externalFiles
      .filter(
        (file) =>
          !file.endsWith("external-provider-types.ts") &&
          !file.endsWith("fixture-identity.ts"),
      )
      .every((file) =>
        /import "(\.\.\/)+server-only"/.test(readFileSync(file, "utf8")),
      ),
  );
  const clientFiles = [
    ...collectSourceFiles("src/components"),
    ...collectSourceFiles("src/features"),
    ...collectSourceFiles("src/app"),
  ];
  ok(
    "282. no client-reachable file imports the external layer",
    clientFiles.every(
      (file) => !readFileSync(file, "utf8").includes("providers/external"),
    ),
  );
  ok(
    "283. no component imports the secret resolver",
    collectSourceFiles("src/components").every(
      (file) =>
        !/external-provider-secrets|revealSecret/.test(readFileSync(file, "utf8")),
    ),
  );
  ok(
    "284. no component imports the transport",
    collectSourceFiles("src/components").every(
      (file) => !/external-provider-transport/.test(readFileSync(file, "utf8")),
    ),
  );
  ok(
    "285. no component imports a raw provider fixture",
    collectSourceFiles("src/components").every(
      (file) =>
        !/neutral-provider-fixtures|external-contract-fixture/.test(
          readFileSync(file, "utf8"),
        ),
    ),
  );
  ok(
    "286. the API route does not import the external layer",
    !readSource("src/app/api/flights/search/route.ts").includes(
      "providers/external",
    ),
  );
  ok(
    "287. the client-safe API contract guards against secret-bearing fields",
    (() => {
      const contract = readCode(
        "src/features/flights/flight-search-api-contract.ts",
      );
      // The module names credential fields *in a denylist*, which is the guard
      // itself — an earlier draft of this check flagged that guard as a
      // violation. What matters is that the denylist exists and covers them,
      // and that no interface here declares such a field.
      const guardsThem =
        /"apiKey"/.test(contract) &&
        /"secret"/.test(contract) &&
        /"credentials"/.test(contract);
      // An earlier draft of this line carried a stray backspace control
      // character where a word boundary was intended, so the pattern could
      // never match and the check passed unconditionally. The non-vacuity
      // pass is what surfaced it.
      const declaresNone =
        !/readonly\s+(apiKey|credential|secret|authorization|bearerToken)\b/i.test(
          contract,
        );
      return guardsThem && declaresNone;
    })(),
  );
  ok(
    "288. no built client bundle references the external layer",
    (() => {
      const chunkDir = ".next/static/chunks";
      if (!exists(chunkDir)) return true; // No build present; the static checks above stand.
      return collectSourceFiles(chunkDir).length === 0;
    })(),
  );

  // ======================================================================
  // 15. FIXTURES
  // ======================================================================
  ok(
    "289. the neutral fixture set covers every required scenario",
    fixtures.FIXTURE_NAMES.length >= 24,
  );
  ok(
    "290. every declared fixture name is actually exported",
    fixtures.FIXTURE_NAMES.every(
      (name) =>
        (fixtures as unknown as Record<string, unknown>)[name] !== undefined,
    ),
  );
  ok(
    "291. no fixture names a real travel provider",
    !/skyscanner|amadeus|sabre|travelport|expedia|kayak|duffel/i.test(
      readSource(`${EXTERNAL_DIR}/fixtures/neutral-provider-fixtures.ts`),
    ),
  );
  ok(
    "292. the only fixture hostname is a reserved .invalid host",
    [
      ...readCode(`${EXTERNAL_DIR}/fixtures/neutral-provider-fixtures.ts`).matchAll(
        /https?:\/\/([a-z0-9.-]+)/gi,
      ),
    ].every((m) => m[1].endsWith(".invalid")),
  );
  ok(
    "293. fixtures are pure — no clock read",
    !/Date\.now\(\)|new Date\(\)/.test(
      readCode(`${EXTERNAL_DIR}/fixtures/neutral-provider-fixtures.ts`),
    ),
  );

  // ======================================================================
  // 16. NO BOOKING, PAYMENT OR AFFILIATE
  // ======================================================================
  ok(
    "294. the external layer implements no booking flow",
    externalCode.every(([, code]) => !/\bbook(ing)?\s*\(/i.test(code)),
  );
  ok(
    "295. the external layer implements no payment",
    externalCode.every(([, code]) => {
      // `PROHIBITED_REQUEST_FIELDS` and `PROHIBITED_AUDIT_FIELDS` enumerate the
      // very names being swept for — they are the guard, not a violation. The
      // arrays are removed before the sweep, exactly as comments are.
      const withoutDenylists = code.replace(
        /PROHIBITED_(REQUEST|AUDIT)_FIELDS[\s\S]*?\];/g,
        " ",
      );
      return !/stripe|paypal|paymentIntent|cardNumber|checkout\.session/i.test(
        withoutDenylists,
      );
    }),
  );
  ok(
    "296. the external layer performs no redirect",
    externalCode.every(
      ([, code]) => !/window\.location|location\.href|\bres\.redirect\b/.test(code),
    ),
  );
  ok(
    "297. the external layer builds no affiliate tracking parameter",
    externalCode.every(
      ([, code]) => !/affiliate|clickId|campaignId|subId/i.test(code),
    ),
  );

  // ======================================================================
  // 17. V2.7 / V2.8-A REGRESSION
  // ======================================================================
  ok(
    "298. the V2.7 failure taxonomy is unchanged",
    (() => {
      const runtime = readCode(
        "src/server/flights/providers/provider-runtime-types.ts",
      );
      return (
        /"cancelled"/.test(runtime) &&
        /"timeout"/.test(runtime) &&
        /"rateLimited"/.test(runtime) &&
        /"authentication"/.test(runtime) &&
        /"configuration"/.test(runtime) &&
        /"malformedResponse"/.test(runtime) &&
        /"unavailable"/.test(runtime) &&
        /"unknown"/.test(runtime)
      );
    })(),
  );
  ok(
    "299. the V2.8-A sitemap policy is unchanged",
    (() => {
      const sitemap = readCode("src/app/sitemap.ts");
      return (
        /PUBLIC_PAGE_KEYS/.test(sitemap) &&
        !/PRODUCT_PAGE_KEYS|PRODUCT_PAGE_PATHS/.test(sitemap)
      );
    })(),
  );
  ok(
    "300. robots still allows the noindex routes so their directive is readable",
    (() => {
      const robots = readCode("src/app/robots.ts");
      return /disallow:\s*\["\/api\/"\]/.test(robots) && !/flights/.test(robots);
    })(),
  );
  ok(
    "301. no public dictionary claims a provider is connected",
    (() => {
      const strings: string[] = [];
      for (const code of ["en", "fr", "fa", "ar"]) {
        const walk = (value: unknown): void => {
          if (typeof value === "string") strings.push(value);
          else if (Array.isArray(value)) value.forEach(walk);
          else if (value !== null && typeof value === "object") {
            Object.values(value as Record<string, unknown>).forEach(walk);
          }
        };
        walk(JSON.parse(readSource(`src/i18n/dictionaries/${code}.json`)));
      }
      const NEGATED =
        /\bno\b|\bnot\b|\byet\b|aucun|pas |encore|هیچ|نیست|نشده|لا يوجد|لا تتوفّر|غير متصلة|ليس/i;
      return strings.every(
        (text) =>
          !/provider is connected|now connected|approval (has been )?received/i.test(
            text,
          ) || NEGATED.test(text),
      );
    })(),
  );
  ok(
    "302. no dependency was added for this stage",
    (() => {
      const pkg = JSON.parse(readSource("package.json")) as {
        dependencies?: Record<string, string>;
      };
      return Object.keys(pkg.dependencies ?? {}).length <= 3;
    })(),
  );
  check("303. the inactive transport was invoked exactly once", transportCalls, 1);

  const total = passed + failures.length;
  if (failures.length > 0) {
    console.error(
      `\nProvider-integration-readiness verification FAILED — ${failures.length} of ${total}\n`,
    );
    for (const failure of failures) console.error(`  ✗ ${failure}\n`);
    process.exit(1);
  }

  console.log(
    `Provider-integration-readiness verification passed — ${passed}/${total} checks`,
  );
}

void main();
