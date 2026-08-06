import "../src/server/server-only";

import type { ExternalNeutralSearch } from "../src/server/flights/providers/external/external-provider-search-shape";
import {
  buildDuffelCreateOfferRequest,
  buildDuffelListOffersRequest,
} from "../src/server/flights/providers/duffel/duffel-request-builder";
import { mapDuffelListOffers } from "../src/server/flights/providers/duffel/duffel-response-mapper";
import {
  resolveDuffelCredential,
  type DuffelCredentialEnvironment,
} from "../src/server/flights/providers/duffel/duffel-credential-resolver";
import {
  createDuffelRuntimeTransport,
  type DuffelFetchLike,
} from "../src/server/flights/providers/duffel/duffel-runtime-transport";

export const GTAI_DUFFEL_LOCAL_REAL_TEST_ENV_NAME =
  "GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED" as const;
export const LOCAL_REAL_TEST_SKIP_MARKER = "SKIPPED_LOCAL_REAL_TEST" as const;

type LocalRealTestResult =
  | { readonly status: "SKIPPED"; readonly reason: string }
  | { readonly status: "REAL_TEST_FAILED"; readonly reason: string }
  | { readonly status: "REAL_TEST_PASSED"; readonly summary: SafeSummary };

export interface SafeSummary {
  readonly provider: "duffel-test-contract";
  readonly offerCount: number;
  readonly currencies: readonly string[];
  readonly minimumPriceMinorUnits: number | null;
  readonly maximumPriceMinorUnits: number | null;
  readonly airlines: readonly string[];
  readonly route: "YUL-CDG";
  readonly partialCount: number;
  readonly rejectionCount: number;
}

export interface LocalRealTestOptions {
  readonly environment?: DuffelCredentialEnvironment;
  readonly fetch?: DuffelFetchLike;
  readonly now?: () => Date;
  readonly write?: (line: string) => void;
}

function futureDate(now: Date): string {
  const value = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  value.setUTCDate(value.getUTCDate() + 100);
  return value.toISOString().slice(0, 10);
}

function skipReason(environment: DuffelCredentialEnvironment): string | null {
  if (
    environment.NODE_ENV === "production" ||
    environment.VERCEL_ENV === "production"
  ) {
    return "production-forbidden";
  }
  if (environment.VERCEL_ENV !== undefined || environment.VERCEL === "1") {
    return "vercel-forbidden";
  }
  if ((environment.NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN ?? "").trim() !== "") {
    return "public-token-name-forbidden";
  }
  if ((environment.NEXT_PUBLIC_DUFFEL_MANUAL_TEST_ENABLED ?? "").trim() !== "") {
    return "public-manual-flag-forbidden";
  }
  if (
    (environment.NEXT_PUBLIC_DUFFEL_LOCAL_REAL_TEST_ENABLED ?? "").trim() !== ""
  ) {
    return "public-local-flag-forbidden";
  }
  if (environment.DUFFEL_MANUAL_TEST_ENABLED !== "true") {
    return "manual-flag-required";
  }
  if (environment[GTAI_DUFFEL_LOCAL_REAL_TEST_ENV_NAME] !== "true") {
    return "local-real-flag-required";
  }
  const credential = resolveDuffelCredential(environment);
  if (credential.state === "missing") return "credential-required";
  if (credential.state !== "presentButInactive") return "credential-invalid";
  return null;
}

function createSearch(now: Date): ExternalNeutralSearch {
  return Object.freeze({
    tripShape: "oneWay" as const,
    legs: Object.freeze([
      Object.freeze({
        originCode: "YUL",
        destinationCode: "CDG",
        departureDate: futureDate(now),
      }),
    ]),
    travelers: Object.freeze({
      adults: 1,
      children: 0,
      infantsInSeat: 0,
      infantsOnLap: 0,
    }),
    cabinClass: "economy" as const,
    directOnly: false,
    market: "CA",
    contentLocale: "en",
    requestedLocale: "en-CA",
    currency: "CAD",
    requestId: "duffel-local-manual-real-test",
    timeoutBudgetMs: 25_000,
  });
}

function offerRequestId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const data = (body as { readonly data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const id = (data as { readonly id?: unknown }).id;
  return typeof id === "string" && /^orq_[A-Za-z0-9_]+$/.test(id) ? id : null;
}

function safeSummary(
  mapped: Extract<ReturnType<typeof mapDuffelListOffers>, { readonly ok: true }>,
): SafeSummary {
  const prices = mapped.offers.map((offer) => offer.totalAmountMinorUnits);
  return Object.freeze({
    provider: "duffel-test-contract" as const,
    offerCount: mapped.offers.length,
    currencies: Object.freeze(
      [...new Set(mapped.offers.map((offer) => offer.currency))].sort(),
    ),
    minimumPriceMinorUnits: prices.length === 0 ? null : Math.min(...prices),
    maximumPriceMinorUnits: prices.length === 0 ? null : Math.max(...prices),
    airlines: Object.freeze(
      [
        ...new Set(
          mapped.offers.map(
            (offer) => `${offer.ownerName} (${offer.ownerIataCode})`,
          ),
        ),
      ].sort(),
    ),
    route: "YUL-CDG" as const,
    partialCount: mapped.offers.filter((offer) => offer.partial).length,
    rejectionCount: mapped.rejected.length,
  });
}

export async function runDuffelLocalRealTest(
  options: LocalRealTestOptions = {},
): Promise<LocalRealTestResult> {
  const environment = options.environment ?? process.env;
  const write =
    options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const reason = skipReason(environment);
  if (reason !== null) {
    write(`${LOCAL_REAL_TEST_SKIP_MARKER} reason=${reason}`);
    write(
      "Configure .env.local locally only; never paste a token into chat, screenshots, source, or logs.",
    );
    return { status: "SKIPPED", reason };
  }

  const credential = resolveDuffelCredential(environment);
  if (credential.state !== "presentButInactive") {
    write("REAL_TEST_FAILED reason=credential-unavailable");
    return { status: "REAL_TEST_FAILED", reason: "credential-unavailable" };
  }
  write("LOCAL_REAL_TEST credential=[redacted:configured] environment=local");

  const transport = createDuffelRuntimeTransport({
    credential: credential.credential,
    fetch: options.fetch ?? (globalThis.fetch as DuffelFetchLike),
    retryPolicy: Object.freeze({
      maximumAttempts: 1,
      initialBackoffMs: 0,
      backoffMultiplier: 1,
      maximumBackoffMs: 0,
      jitterRatio: 0,
      retryableFailures: [] as const,
    }),
  });
  const now = options.now?.() ?? new Date();
  const context = () => ({
    signal: new AbortController().signal,
    requestId: "duffel-local-manual-real-test",
    deadlineAt: Date.now() + 25_000,
  });
  const createResult = await transport.execute(
    buildDuffelCreateOfferRequest(createSearch(now)),
    context(),
  );
  if (!createResult.ok) {
    write("REAL_TEST_FAILED reason=create-offer-request-failed");
    return { status: "REAL_TEST_FAILED", reason: "create-offer-request-failed" };
  }
  const requestId = offerRequestId(createResult.body);
  if (requestId === null) {
    write("REAL_TEST_FAILED reason=create-offer-request-schema");
    return { status: "REAL_TEST_FAILED", reason: "create-offer-request-schema" };
  }
  const listResult = await transport.execute(
    buildDuffelListOffersRequest({
      offerRequestId: requestId,
      limit: 50,
      maxConnections: 1,
    }),
    context(),
  );
  if (!listResult.ok) {
    write("REAL_TEST_FAILED reason=list-offers-failed");
    return { status: "REAL_TEST_FAILED", reason: "list-offers-failed" };
  }
  const mapped = mapDuffelListOffers({
    response: listResult.body,
    tripShape: "oneWay",
    requestId: "duffel-local-manual-real-test",
    occurredAt: now.toISOString(),
    maximumOffers: 50,
  });
  if (!mapped.ok) {
    write("REAL_TEST_FAILED reason=offer-mapping-failed");
    return { status: "REAL_TEST_FAILED", reason: "offer-mapping-failed" };
  }
  const summary = safeSummary(mapped);
  write(`REAL_TEST_PASSED ${JSON.stringify(summary)}`);
  return { status: "REAL_TEST_PASSED", summary };
}

if (require.main === module) {
  void runDuffelLocalRealTest().then((result) => {
    if (result.status === "REAL_TEST_FAILED") process.exitCode = 1;
  });
}
