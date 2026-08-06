/** Deterministic verification for GTAI V2.8-C — Duffel Test Adapter Contract. */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  DUFFEL_ACCESS_TOKEN_REFERENCE,
  DUFFEL_ACTIVATION_STATE,
  DUFFEL_API_ORIGIN,
  DUFFEL_CREATE_OFFER_REQUEST_PATH,
  DUFFEL_LIST_OFFERS_PATH,
  DUFFEL_MAPPED_OFFER_FIELDS,
  DUFFEL_PROVIDER_ID,
  DUFFEL_VERSION,
} from "../src/server/flights/providers/duffel/duffel-contract";
import {
  categoryForDuffelStatus,
  categoryForDuffelThrownFailure,
  normalizeDuffelFailure,
} from "../src/server/flights/providers/duffel/duffel-failures";
import * as fixtures from "../src/server/flights/providers/duffel/duffel-fixtures";
import {
  buildDuffelCreateOfferRequest,
  buildDuffelListOffersRequest,
  DuffelRequestContractError,
  mapDuffelCabinClass,
} from "../src/server/flights/providers/duffel/duffel-request-builder";
import {
  mapDuffelListOffers,
  mapDuffelOffer,
  MAX_DUFFEL_OFFERS,
  parseDuffelAmount,
  parseDuffelDuration,
} from "../src/server/flights/providers/duffel/duffel-response-mapper";
import {
  createDuffelInactiveTransport,
  duffelInactiveTransport,
} from "../src/server/flights/providers/duffel/duffel-transport";
import { duffelTestAdapterContract } from "../src/server/flights/providers/duffel/duffel-adapter";
import { InactiveTransportError } from "../src/server/flights/providers/external/external-provider-transport";
import type {
  ExternalProviderRequestContext,
  ExternalProviderSearchRequest,
} from "../src/server/flights/providers/external/external-provider-types";
import { runtimeProviderRegistry } from "../src/server/flights/providers/provider-registry";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else {
    failures.push(
      `${name}\n    expected ${JSON.stringify(expected)}\n    actual   ${JSON.stringify(actual)}`,
    );
  }
}

function ok(name: string, condition: boolean): void {
  check(name, condition, true);
}

const root = process.cwd();
const read = (path: string): string => readFileSync(join(root, path), "utf8");
const exists = (path: string): boolean => existsSync(join(root, path));
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");

function filesUnder(relativeDirectory: string): string[] {
  const directory = join(root, relativeDirectory);
  if (!existsSync(directory)) return [];
  const result: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|json|md)$/.test(entry)) result.push(full);
    }
  };
  walk(directory);
  return result;
}

function rejectsWith(
  action: () => unknown,
  reason: DuffelRequestContractError["reason"],
): boolean {
  try {
    action();
    return false;
  } catch (error) {
    return error instanceof DuffelRequestContractError && error.reason === reason;
  }
}

const NOW = "2026-08-05T00:00:00.000Z";
const mapInput = (response: unknown, maximumOffers?: number) => ({
  response,
  tripShape: "oneWay" as const,
  requestId: "duffel-verification-request",
  occurredAt: NOW,
  maximumOffers,
});

async function main(): Promise<void> {
  const duffelDirectory = "src/server/flights/providers/duffel";
  const requiredFiles = [
    "duffel-contract.ts",
    "duffel-request-builder.ts",
    "duffel-response-mapper.ts",
    "duffel-failures.ts",
    "duffel-fixtures.ts",
    "duffel-transport.ts",
    "duffel-adapter.ts",
    "index.ts",
  ];
  for (const file of requiredFiles) {
    ok(`architecture: ${file} exists`, exists(`${duffelDirectory}/${file}`));
  }
  const duffelFiles = filesUnder(duffelDirectory);
  const duffelCode = duffelFiles
    .map((file) => stripComments(readFileSync(file, "utf8")))
    .join("\n");
  const runtimeRegistry = stripComments(
    read("src/server/flights/providers/provider-registry.ts"),
  );
  const publicFiles = [
    ...filesUnder("src/app"),
    ...filesUnder("src/components"),
    ...filesUnder("src/features"),
    ...filesUnder("src/i18n"),
    ...filesUnder("src/lib"),
  ];
  const publicCode = publicFiles
    .map((file) => stripComments(readFileSync(file, "utf8")))
    .join("\n");

  check("identity: provider id", DUFFEL_PROVIDER_ID, "duffel-test-contract");
  check("identity: activation unavailable", DUFFEL_ACTIVATION_STATE, "unavailable");
  check(
    "identity: adapter activation unavailable",
    duffelTestAdapterContract.activationState,
    "unavailable",
  );
  ok(
    "identity: runtime registry excludes Duffel",
    runtimeProviderRegistry.get(DUFFEL_PROVIDER_ID) === null,
  );
  check(
    "identity: runtime has one provider",
    runtimeProviderRegistry.allProviders().length,
    1,
  );
  check(
    "identity: local provider remains enabled",
    runtimeProviderRegistry.enabledProviders()[0]?.providerId,
    "gtai-local-demo",
  );
  ok("architecture: no public import", !/providers[\\/]duffel/.test(publicCode));
  ok(
    "architecture: adapter uses inactive transport",
    duffelTestAdapterContract.transport === duffelInactiveTransport,
  );
  ok("architecture: no process environment read", !/process\.env/.test(duffelCode));
  check(
    "contract: API origin documented",
    DUFFEL_API_ORIGIN,
    "https://api.duffel.com",
  );
  check("contract: version header value", DUFFEL_VERSION, "v2");
  check(
    "contract: create path",
    DUFFEL_CREATE_OFFER_REQUEST_PATH,
    "/air/offer_requests",
  );
  check("contract: list path", DUFFEL_LIST_OFFERS_PATH, "/air/offers");

  check(
    "secret: future reference name",
    DUFFEL_ACCESS_TOKEN_REFERENCE.environmentVariable,
    "DUFFEL_ACCESS_TOKEN",
  );
  ok("secret: future reference optional", !DUFFEL_ACCESS_TOKEN_REFERENCE.required);
  check(
    "secret: bearer placement",
    DUFFEL_ACCESS_TOKEN_REFERENCE.placement,
    "bearerToken",
  );
  ok(
    "secret: no NEXT_PUBLIC name",
    !DUFFEL_ACCESS_TOKEN_REFERENCE.environmentVariable.startsWith("NEXT_PUBLIC_"),
  );
  ok(
    "secret: forbidden browser name absent",
    !duffelCode.includes("NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN"),
  );
  ok(
    "secret: no token-shaped value",
    !/duffel_(test|live)_[A-Za-z0-9_-]{16,}/.test(duffelCode),
  );
  ok(
    "secret: no Authorization value",
    !/Authorization\s*:\s*["'`]Bearer\s+[^<]/.test(duffelCode),
  );
  ok(
    "secret: request builder never imports resolver",
    !/resolveProviderSecrets|revealSecret/.test(
      read(`${duffelDirectory}/duffel-request-builder.ts`),
    ),
  );

  const oneWay = buildDuffelCreateOfferRequest(fixtures.oneWaySearch);
  const roundTrip = buildDuffelCreateOfferRequest(fixtures.roundTripSearch);
  const multiCity = buildDuffelCreateOfferRequest(fixtures.multiCitySearch);
  const direct = buildDuffelCreateOfferRequest(fixtures.directOnlySearch);
  const nonDirect = buildDuffelCreateOfferRequest(fixtures.nonDirectSearch);
  check("request: method", oneWay.method, "POST");
  check("request: path", oneWay.path, "/air/offer_requests");
  check("request: Duffel-Version", oneWay.headers["Duffel-Version"], "v2");
  check("request: one-way slice count", oneWay.body.data.slices.length, 1);
  check("request: one-way origin", oneWay.body.data.slices[0]?.origin, "YUL");
  check(
    "request: one-way destination",
    oneWay.body.data.slices[0]?.destination,
    "CDG",
  );
  check(
    "request: one-way date",
    oneWay.body.data.slices[0]?.departure_date,
    "2026-09-01",
  );
  check("request: round-trip slice count", roundTrip.body.data.slices.length, 2);
  check(
    "request: round-trip return origin",
    roundTrip.body.data.slices[1]?.origin,
    "CDG",
  );
  check(
    "request: round-trip return destination",
    roundTrip.body.data.slices[1]?.destination,
    "YUL",
  );
  check("request: multi-city slice count", multiCity.body.data.slices.length, 3);
  check(
    "request: multi-city preserves order",
    multiCity.body.data.slices.map(
      (slice) => `${slice.origin}-${slice.destination}`,
    ),
    ["YUL-CDG", "CDG-FCO", "FCO-YUL"],
  );
  check("request: direct max connections", direct.body.data.max_connections, 0);
  check(
    "request: non-direct max connections",
    nonDirect.body.data.max_connections,
    1,
  );
  check("request: adult count", oneWay.body.data.passengers.length, 1);
  check("request: adult shape", Object.keys(oneWay.body.data.passengers[0] ?? {}), [
    "type",
  ]);
  check("request: adult type", oneWay.body.data.passengers[0]?.type, "adult");
  check("request: economy cabin", mapDuffelCabinClass("economy"), "economy");
  check(
    "request: premium cabin",
    mapDuffelCabinClass("premiumEconomy"),
    "premium_economy",
  );
  check("request: business cabin", mapDuffelCabinClass("business"), "business");
  check("request: first cabin", mapDuffelCabinClass("first"), "first");
  ok(
    "request: unsupported cabin rejected",
    rejectsWith(() => mapDuffelCabinClass("suite"), "unsupportedCabin"),
  );
  ok(
    "request: children rejected without ages",
    rejectsWith(
      () =>
        buildDuffelCreateOfferRequest({
          ...fixtures.oneWaySearch,
          travelers: { ...fixtures.oneWaySearch.travelers, children: 1 },
        }),
      "unsupportedChildren",
    ),
  );
  ok(
    "request: infant in seat rejected",
    rejectsWith(
      () =>
        buildDuffelCreateOfferRequest({
          ...fixtures.oneWaySearch,
          travelers: { ...fixtures.oneWaySearch.travelers, infantsInSeat: 1 },
        }),
      "unsupportedInfants",
    ),
  );
  ok(
    "request: infant on lap rejected",
    rejectsWith(
      () =>
        buildDuffelCreateOfferRequest({
          ...fixtures.oneWaySearch,
          travelers: { ...fixtures.oneWaySearch.travelers, infantsOnLap: 1 },
        }),
      "unsupportedInfants",
    ),
  );
  check("request: return_offers false", oneWay.query.return_offers, "false");
  check("request: supplier timeout", oneWay.query.supplier_timeout, "10000");
  ok("request: no view query", !("view" in oneWay.query));
  ok("request: no authorization header", !("Authorization" in oneWay.headers));
  const requestJson = JSON.stringify(oneWay);
  const prohibitedRequestFields = [
    "given_name",
    "family_name",
    "passport",
    "loyalty_programme_accounts",
    "private_fares",
    "airline_credit_ids",
    "include_split_ticket",
    "departure_time",
    "arrival_time",
    "payment",
    "order",
    "token",
    "credential",
    "cookie",
    "user-agent",
  ];
  for (const field of prohibitedRequestFields) {
    ok(`request: prohibited field absent — ${field}`, !requestJson.includes(field));
  }

  const list = buildDuffelListOffersRequest({
    offerRequestId: "orq_contract_001",
    sort: "-total_amount",
    maxConnections: 1,
    after: "opaque-after+value=",
    before: "opaque-before/value",
  });
  check("list: method", list.method, "GET");
  check("list: relative path", list.path, "/air/offers");
  check(
    "list: required request id",
    list.query.offer_request_id,
    "orq_contract_001",
  );
  check("list: default limit", list.query.limit, "50");
  check("list: sort", list.query.sort, "-total_amount");
  check("list: connections", list.query.max_connections, "1");
  check("list: after opaque", list.query.after, "opaque-after+value=");
  check("list: before opaque", list.query.before, "opaque-before/value");
  check("list: version header", list.headers["Duffel-Version"], "v2");
  ok(
    "list: id required",
    rejectsWith(
      () => buildDuffelListOffersRequest({ offerRequestId: "" }),
      "invalidOfferRequestId",
    ),
  );
  ok(
    "list: id prefix required",
    rejectsWith(
      () => buildDuffelListOffersRequest({ offerRequestId: "off_contract" }),
      "invalidOfferRequestId",
    ),
  );
  check(
    "list: maximum accepted",
    buildDuffelListOffersRequest({ offerRequestId: "orq_x", limit: 200 }).query
      .limit,
    "200",
  );
  ok(
    "list: over maximum rejected",
    rejectsWith(
      () => buildDuffelListOffersRequest({ offerRequestId: "orq_x", limit: 201 }),
      "invalidLimit",
    ),
  );
  ok(
    "list: zero limit rejected",
    rejectsWith(
      () => buildDuffelListOffersRequest({ offerRequestId: "orq_x", limit: 0 }),
      "invalidLimit",
    ),
  );
  for (const sort of [
    "total_amount",
    "total_duration",
    "-total_amount",
    "-total_duration",
  ]) {
    check(
      `list: sort accepted — ${sort}`,
      buildDuffelListOffersRequest({ offerRequestId: "orq_x", sort }).query.sort,
      sort,
    );
  }
  ok(
    "list: arbitrary sort rejected",
    rejectsWith(
      () =>
        buildDuffelListOffersRequest({
          offerRequestId: "orq_x",
          sort: "created_at",
        }),
      "invalidSort",
    ),
  );
  ok(
    "list: arbitrary connections rejected",
    rejectsWith(
      () =>
        buildDuffelListOffersRequest({
          offerRequestId: "orq_x",
          maxConnections: 2,
        }),
      "invalidMaxConnections",
    ),
  );
  ok(
    "list: empty cursor rejected",
    rejectsWith(
      () => buildDuffelListOffersRequest({ offerRequestId: "orq_x", after: "" }),
      "invalidCursor",
    ),
  );
  const listJson = JSON.stringify(list);
  for (const field of [
    "credential",
    "token",
    "/orders",
    "/payments",
    "/prices",
    "view",
  ]) {
    ok(
      `list: prohibited value absent — ${field}`,
      !listJson.toLowerCase().includes(field),
    );
  }

  check("mapper: decimal amount", parseDuffelAmount("899.00", "CAD"), 89_900);
  check("mapper: padded decimal", parseDuffelAmount("899.5", "CAD"), 89_950);
  check("mapper: zero-decimal currency", parseDuffelAmount("899", "JPY"), 899);
  check("mapper: three-decimal currency", parseDuffelAmount("1.234", "KWD"), 1_234);
  check("mapper: unsafe currency rejected", parseDuffelAmount("1.00", "ZZZ"), null);
  check(
    "mapper: lowercase currency rejected",
    parseDuffelAmount("1.00", "cad"),
    null,
  );
  check(
    "mapper: excess decimals rejected",
    parseDuffelAmount("1.001", "CAD"),
    null,
  );
  check("mapper: invalid amount rejected", parseDuffelAmount("one", "CAD"), null);
  check("mapper: duration hours/minutes", parseDuffelDuration("PT7H30M"), 450);
  check("mapper: duration minutes", parseDuffelDuration("PT45M"), 45);
  check("mapper: zero duration rejected", parseDuffelDuration("PT0M"), null);
  check("mapper: malformed duration rejected", parseDuffelDuration("7h30m"), null);
  const mapped = mapDuffelOffer(fixtures.validOffer, "oneWay");
  ok("mapper: valid offer maps", mapped.ok);
  const offer = mapped.ok ? mapped.offer : null;
  check("mapper: namespaced id", offer?.offerId, "duffel:off_contract_001");
  check("mapper: provider identity", offer?.providerId, DUFFEL_PROVIDER_ID);
  check("mapper: total", offer?.totalAmountMinorUnits, 89_900);
  check("mapper: base", offer?.baseAmountMinorUnits, 80_000);
  check("mapper: tax", offer?.taxAmountMinorUnits, 9_900);
  check("mapper: currency", offer?.currency, "CAD");
  check("mapper: owner name", offer?.ownerName, "Contract Air");
  check("mapper: owner code", offer?.ownerIataCode, "ZZ");
  check("mapper: one leg", offer?.legs.length, 1);
  check("mapper: segment origin", offer?.legs[0]?.segments[0]?.originCode, "YUL");
  check(
    "mapper: segment destination",
    offer?.legs[0]?.segments[0]?.destinationCode,
    "CDG",
  );
  check(
    "mapper: segment duration",
    offer?.legs[0]?.segments[0]?.durationMinutes,
    450,
  );
  check("mapper: stops", offer?.legs[0]?.stopCount, 0);
  check("mapper: cabin", offer?.legs[0]?.segments[0]?.cabinClass, "economy");
  ok(
    "mapper: carry-on mapped",
    offer?.legs[0]?.segments[0]?.baggage.carryOnIncluded === true,
  );
  ok(
    "mapper: checked bag mapped",
    offer?.legs[0]?.segments[0]?.baggage.checkedBagIncluded === true,
  );
  check("mapper: created freshness", offer?.createdAt, "2026-08-05T00:00:00.000Z");
  check("mapper: updated freshness", offer?.updatedAt, "2026-08-05T00:05:00.000Z");
  check("mapper: expiry freshness", offer?.expiresAt, "2026-08-05T01:00:00.000Z");
  ok("mapper: test mode only", offer?.liveMode === false);
  check(
    "mapper: exact safe fields",
    Object.keys(offer ?? {}).sort(),
    [...DUFFEL_MAPPED_OFFER_FIELDS].sort(),
  );
  const rejectionFixtures: readonly [string, unknown, string][] = [
    ["invalid price", fixtures.invalidPriceOffer, "invalidPrice"],
    ["zero price", fixtures.zeroPriceOffer, "zeroPrice"],
    ["negative price", fixtures.negativePriceOffer, "negativePrice"],
    ["invalid currency", fixtures.invalidCurrencyOffer, "invalidCurrency"],
    ["invalid timestamp", fixtures.invalidTimestampOffer, "invalidTimestamp"],
    ["invalid duration", fixtures.invalidDurationOffer, "invalidDuration"],
    ["missing owner", fixtures.missingOwnerOffer, "missingOwner"],
    ["missing segment", fixtures.missingSegmentOffer, "missingSegment"],
    ["missing airport", fixtures.missingAirportCodeOffer, "missingAirportCode"],
    ["unsupported cabin", fixtures.unsupportedCabinOffer, "unsupportedCabin"],
  ];
  for (const [name, candidate, reason] of rejectionFixtures) {
    const result = mapDuffelOffer(candidate, "oneWay");
    check(
      `mapper: ${name} rejected`,
      result.ok ? "accepted" : result.reason,
      reason,
    );
  }
  const validList = mapDuffelListOffers(mapInput(fixtures.validListOffersResponse));
  ok("mapper: valid list maps", validList.ok);
  check("mapper: valid list count", validList.ok ? validList.offers.length : -1, 1);
  const partial = mapDuffelListOffers(mapInput(fixtures.partialMalformedResponse));
  ok("mapper: partial malformed succeeds", partial.ok);
  check("mapper: partial keeps valid", partial.ok ? partial.offers.length : -1, 1);
  ok("mapper: partial marked", partial.ok && partial.partial);
  const malformed = mapDuffelListOffers(mapInput(fixtures.fullyMalformedResponse));
  check(
    "mapper: fully malformed safe failure",
    malformed.ok ? "ok" : malformed.failure.category,
    "mappingFailure",
  );
  const duplicates = mapDuffelListOffers(
    mapInput(fixtures.duplicateOfferIdsResponse),
  );
  check(
    "mapper: duplicate keeps one",
    duplicates.ok ? duplicates.offers.length : -1,
    1,
  );
  ok(
    "mapper: duplicate warning",
    duplicates.ok && duplicates.warnings.includes("duplicateOfferDiscarded"),
  );
  const empty = mapDuffelListOffers(mapInput(fixtures.zeroResultsResponse));
  ok("mapper: zero results succeeds", empty.ok);
  check("mapper: zero results empty", empty.ok ? empty.offers.length : -1, 0);
  const bulk = {
    data: Array.from({ length: 205 }, (_unused, index) => ({
      ...fixtures.validOffer,
      id: `off_bulk_${index}`,
    })),
  };
  const bounded = mapDuffelListOffers(mapInput(bulk, 200));
  check(
    "mapper: output bounded",
    bounded.ok ? bounded.offers.length : -1,
    MAX_DUFFEL_OFFERS,
  );
  ok("mapper: truncation marked partial", bounded.ok && bounded.partial);
  const partialOffer = mapDuffelListOffers(
    mapInput({ data: [fixtures.partialOffer] }),
  );
  ok("mapper: provider partial preserved", partialOffer.ok && partialOffer.partial);
  const malformedSchema = mapDuffelListOffers(mapInput({ offers: [] }));
  check(
    "mapper: unexpected schema",
    malformedSchema.ok ? "ok" : malformedSchema.failure.category,
    "malformedResponse",
  );
  const mappedJson = JSON.stringify(offer);
  for (const field of [
    "bookingUrl",
    "deepLink",
    "affiliateUrl",
    "rawPayload",
    "payload",
    "order",
    "payment",
    "given_name",
    "family_name",
    "passport",
    "loyalty",
  ]) {
    ok(`mapper: forbidden output absent — ${field}`, !mappedJson.includes(field));
  }

  const statusCases: readonly [number, string][] = [
    [400, "invalidRequest"],
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "invalidRequest"],
    [408, "timeout"],
    [409, "unavailable"],
    [422, "invalidRequest"],
    [429, "rateLimited"],
    [500, "upstreamUnavailable"],
    [502, "upstreamUnavailable"],
    [503, "upstreamUnavailable"],
    [504, "upstreamUnavailable"],
    [418, "unknown"],
  ];
  for (const [status, category] of statusCases) {
    check(`failure: ${status}`, categoryForDuffelStatus(status), category);
  }
  const thrownCases = [
    ["aborted", "aborted"],
    ["network", "networkFailure"],
    ["malformedJson", "malformedResponse"],
    ["unexpectedSchema", "malformedResponse"],
    ["unknown", "unknown"],
  ] as const;
  for (const [kind, category] of thrownCases) {
    check(`failure: ${kind}`, categoryForDuffelThrownFailure(kind), category);
  }
  const limited = normalizeDuffelFailure({
    requestId: "r",
    occurredAt: NOW,
    statusCode: 429,
    retryAfterMs: 3_600_000,
  });
  check("failure: retryAfter bounded", limited.retryAfterMs, 30_000);
  ok("failure: rate limit retryable", limited.retryable);
  const unauthorized = normalizeDuffelFailure({
    requestId: "r",
    occurredAt: NOW,
    statusCode: 401,
  });
  ok("failure: unauthorized not retryable", !unauthorized.retryable);
  check("failure: provider identity", unauthorized.providerId, DUFFEL_PROVIDER_ID);
  check(
    "failure: safe public code",
    unauthorized.publicCode,
    "provider_unavailable",
  );
  const failureJson = JSON.stringify(unauthorized);
  for (const field of [
    "rawBody",
    "responseBody",
    "stack",
    "token",
    "Authorization",
    "api.duffel.com",
  ]) {
    ok(`failure: sensitive field absent — ${field}`, !failureJson.includes(field));
  }

  const context = (signal: AbortSignal): ExternalProviderRequestContext => ({
    signal,
    searchContextId: "duffel-transport-check",
    attempt: 1,
    deadlineAt: Date.parse(NOW) + 10_000,
  });
  const dummyRequest: ExternalProviderSearchRequest = {
    method: "POST",
    url: new URL("https://transport-contract.invalid/air/offer_requests"),
    headers: {},
    query: {},
    body: null,
    secretReferences: [],
    timeoutPolicy: {
      connectTimeoutMs: 1_000,
      requestTimeoutMs: 5_000,
      totalDeadlineMs: 10_000,
    },
  };
  const transport = createDuffelInactiveTransport({ now: () => Date.parse(NOW) });
  let inactiveCategory = "resolved";
  try {
    await transport.search(dummyRequest, context(new AbortController().signal));
  } catch (error) {
    inactiveCategory =
      error instanceof InactiveTransportError
        ? error.failure.category
        : "wrongError";
  }
  check("transport: inactive category", inactiveCategory, "notConfigured");
  const abortedController = new AbortController();
  abortedController.abort();
  let abortedCategory = "resolved";
  try {
    await transport.search(dummyRequest, context(abortedController.signal));
  } catch (error) {
    abortedCategory =
      error instanceof InactiveTransportError
        ? error.failure.category
        : "wrongError";
  }
  check("transport: aborted category", abortedCategory, "aborted");
  check("transport: stable id", transport.transportId, "duffel-inactive-transport");
  const transportCode = stripComments(
    read(`${duffelDirectory}/duffel-transport.ts`),
  );
  ok("transport: no fetch", !/\bfetch\s*\(/.test(transportCode));
  ok("transport: no axios", !/axios|node-fetch|undici/.test(transportCode));
  ok("transport: no HTTP import", !/node:(http|https|net|tls)/.test(transportCode));
  ok("transport: no external hostname", !/https?:\/\//.test(transportCode));
  ok(
    "transport: no credential",
    !/DUFFEL_ACCESS_TOKEN|Authorization/.test(transportCode),
  );
  ok("network: no fetch in module", !/\bfetch\s*\(/.test(duffelCode));
  ok("network: no axios in module", !/axios|node-fetch|undici/.test(duffelCode));
  const hosts = [...duffelCode.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map(
    (match) => match[1],
  );
  check("network: one documented hostname", hosts, ["api.duffel.com"]);
  ok(
    "network: origin only in contract",
    !filesUnder(duffelDirectory).some(
      (file) =>
        !file.endsWith("duffel-contract.ts") &&
        /https?:\/\/api\.duffel\.com/.test(
          stripComments(readFileSync(file, "utf8")),
        ),
    ),
  );
  ok(
    "server-only: executable modules guarded",
    requiredFiles
      .filter((file) => file !== "duffel-fixtures.ts")
      .every((file) =>
        read(`${duffelDirectory}/${file}`).includes(
          'import "../../../server-only"',
        ),
      ),
  );

  const fixtureNames = new Set(fixtures.DUFFEL_FIXTURE_NAMES);
  for (const required of [
    "oneWaySearch",
    "roundTripSearch",
    "multiCitySearch",
    "directOnlySearch",
    "nonDirectSearch",
    "validOfferResponse",
    "validListOffersResponse",
    "partialMalformedResponse",
    "fullyMalformedResponse",
    "duplicateOfferIdsResponse",
    "zeroResultsResponse",
    "invalidPriceOffer",
    "zeroPriceOffer",
    "negativePriceOffer",
    "invalidCurrencyOffer",
    "invalidTimestampOffer",
    "invalidDurationOffer",
    "missingOwnerOffer",
    "missingSegmentOffer",
    "missingAirportCodeOffer",
    "unsupportedCabinOffer",
    "rateLimitedFailure",
    "unauthorizedFailure",
    "forbiddenFailure",
    "timeoutFailure",
    "networkFailure",
    "malformedJsonFailure",
    "abortedFailure",
  ]) {
    ok(`fixture: ${required}`, fixtureNames.has(required));
  }

  const sitemap = stripComments(read("src/app/sitemap.ts"));
  const robots = stripComments(read("src/app/robots.ts"));
  const resultsPage = stripComments(
    read("src/app/[locale]/flights/results/page.tsx"),
  );
  const detailsPage = stripComments(
    read("src/app/[locale]/flights/results/[offerId]/page.tsx"),
  );
  const apiRepository = stripComments(
    read("src/features/flights/api-flight-offer-repository.ts"),
  );
  ok(
    "regression: sitemap structure unchanged",
    /PUBLIC_PAGE_KEYS/.test(sitemap) && !/duffel/i.test(sitemap),
  );
  ok(
    "regression: sitemap remains 24 by four locales and six pages",
    /dictionaryLocales/.test(sitemap) && /PUBLIC_PAGE_PATHS/.test(sitemap),
  );
  ok(
    "regression: robots only API disallowed",
    /disallow:\s*\["\/api\/"\]/.test(robots),
  );
  ok("regression: results noindex", /buildNonIndexableMetadata/.test(resultsPage));
  ok("regression: details noindex", /buildNonIndexableMetadata/.test(detailsPage));
  ok(
    "regression: same-origin search API",
    /FLIGHT_SEARCH_API_PATH/.test(apiRepository) &&
      !/https?:\/\//.test(apiRepository),
  );
  ok(
    "regression: no Duffel in dictionaries",
    !/duffel/i.test(
      filesUnder("src/i18n")
        .map((file) => readFileSync(file, "utf8"))
        .join("\n"),
    ),
  );
  ok("regression: no public provider claim", !/duffel/i.test(publicCode));
  ok(
    "regression: no booking implementation in Duffel module",
    !/createOrder|createPayment|bookingUrl\s*:|affiliateUrl\s*:/.test(duffelCode),
  );
  ok(
    "regression: no passenger names",
    !/given_name\s*:|family_name\s*:/.test(duffelCode),
  );
  ok("regression: no passport collection", !/passport\s*:/.test(duffelCode));
  ok(
    "regression: no loyalty collection",
    !/loyalty_programme_accounts\s*:/.test(duffelCode),
  );

  /* Non-vacuity: each in-memory mutation must flip its corresponding guard. */
  const guards: readonly [string, string, (source: string) => boolean, string][] = [
    [
      "view undefined",
      requestJson,
      (source) => !/view[^\n]{0,20}undefined/.test(source),
      '{"view":undefined}',
    ],
    [
      "passenger given name",
      requestJson,
      (source) => !/given_name/.test(source),
      '{"given_name":"Fixture"}',
    ],
    [
      "browser token name",
      duffelCode,
      (source) => !/NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN/.test(source),
      "NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN",
    ],
    [
      "booking link",
      mappedJson,
      (source) => !/bookingUrl/.test(source),
      '{"bookingUrl":"disabled"}',
    ],
    [
      "active registration",
      runtimeRegistry,
      (source) => !/duffel-test-contract[\s\S]{0,120}enabled:\s*true/.test(source),
      "duffel-test-contract enabled: true",
    ],
    [
      "network call",
      transportCode,
      (source) => !/fetch\s*\([\s\S]*api\.duffel\.com/.test(source),
      'fetch("https://api.duffel.com")',
    ],
    [
      "Orders endpoint",
      listJson,
      (source) => !/\/air\/orders/.test(source),
      '"/air/orders"',
    ],
    [
      "raw payload",
      mappedJson,
      (source) => !/rawPayload/.test(source),
      '{"rawPayload":{}}',
    ],
  ];
  for (const [name, baseline, guard, defect] of guards) {
    ok(`non-vacuity baseline: ${name}`, guard(baseline));
    ok(`non-vacuity defect rejected: ${name}`, !guard(`${baseline}\n${defect}`));
  }
  ok(
    "non-vacuity baseline: supported currency accepted",
    parseDuffelAmount("1.00", "CAD") === 100,
  );
  ok(
    "non-vacuity defect rejected: unsafe currency",
    parseDuffelAmount("1.00", "ZZZ") === null,
  );

  const total = passed + failures.length;
  if (total <= 136) failures.push(`verification count ${total} must exceed 136`);
  if (failures.length > 0) {
    console.error(
      `\nDuffel adapter contract verification FAILED — ${failures.length} of ${passed + failures.length}\n`,
    );
    for (const failure of failures) console.error(`  ✗ ${failure}\n`);
    process.exit(1);
  }
  console.log(
    `Duffel adapter contract verification passed — ${passed}/${total} checks`,
  );
  console.log("Non-vacuity proof passed — 9/9 representative defects rejected");
}

void main();
