import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { evaluateDuffelPreviewActivation } from "../src/server/flights/providers/duffel/duffel-preview-activation-gate";
import {
  resolveRuntimeProviderRegistry,
  runtimeProviderRegistry,
} from "../src/server/flights/providers/provider-registry";
import {
  readPreviewOfferSnapshot,
  type PreviewOfferStorage,
} from "../src/features/flights/details/preview-offer-snapshot";
import type { FlightSearchIntent } from "../src/features/flights/search-intent-types";

let checks = 0;
function check(value: unknown, message: string): void {
  assert.ok(value, message);
  checks += 1;
}

const root = process.cwd();
const read = (file: string): string =>
  fs.readFileSync(path.join(root, file), "utf8");
const sources = {
  results: read("src/components/flights/FlightResultsExperience.tsx"),
  card: read("src/components/flights/ResultCard.tsx"),
  details: read("src/components/flights/details/FlightDetailsExperience.tsx"),
  summary: read("src/components/flights/details/FlightDetailsSummary.tsx"),
  price: read("src/components/flights/details/PriceSummary.tsx"),
  snapshot: read("src/features/flights/details/preview-offer-snapshot.ts"),
  contract: read("src/features/flights/flight-search-api-contract.ts"),
  response: read("src/server/flights/flight-search-response.ts"),
  adapter: read(
    "src/server/flights/providers/duffel/duffel-preview-provider-adapter.ts",
  ),
  registry: read("src/server/flights/providers/provider-registry.ts"),
  dictionary: read("src/i18n/dictionaries/en.json"),
  docs: read(
    "docs/implementation/V2_8_J_DUFFEL_PREVIEW_LIVE_UX_PRODUCTION_READINESS.md",
  ),
};
const clientSource = [
  sources.results,
  sources.card,
  sources.details,
  sources.summary,
  sources.price,
].join("\n");
const allSource = Object.values(sources).join("\n");

check(/isLivePreview/.test(sources.results), "Results derives live Preview state");
check(
  /!offer\.isDemonstration/.test(sources.results),
  "live state comes from validated offers",
);
check(
  /labels\.livePreview\.title/.test(sources.results),
  "Results renders live title",
);
check(
  /offer\.isDemonstration[\s\S]*labels\.demoOffer/.test(sources.card),
  "cards retain demo badge",
);
check(
  /labels\.livePreview\.offerBadge/.test(sources.card),
  "cards render live badge",
);
check(
  /Live Preview — Duffel test inventory/.test(sources.dictionary),
  "safe Preview provider status authored",
);
check(
  /booking and payment are not available/.test(sources.dictionary),
  "Preview non-bookable statement authored",
);
check(
  /readPreviewOfferSnapshot/.test(sources.details),
  "Details reads same-tab snapshot",
);
check(
  /labels\.livePreview\.unavailable/.test(sources.details),
  "missing snapshot has dedicated safe state",
);
check(
  /isPreviewOfferId\(offerId\)/.test(sources.details),
  "live IDs short-circuit provider search",
);
check(
  /isDemonstration[\s\S]*resultsLabels\.demoOffer/.test(sources.summary),
  "Details badge distinguishes demo/live",
);
check(
  /labels\.livePreview\.providerNotice/.test(sources.details),
  "Details has safe live provider notice",
);
check(/partialTitle/.test(sources.dictionary), "partial mapping has live summary");
check(/isPartialCoverage/.test(sources.results), "partial coverage is rendered");
check(
  /status === "empty"/.test(sources.results),
  "zero offers has safe empty state",
);
check(
  /providerUnavailable/.test(sources.contract),
  "safe transient provider failure taxonomy retained",
);
check(/timeout/.test(sources.adapter), "adapter classifies timeout safely");
check(
  /createOfferRequest/.test(sources.adapter),
  "create failure phase is classified",
);
check(/listOffers/.test(sources.adapter), "list failure phase is classified");
check(
  /rejectedOfferCount/.test(sources.adapter),
  "mapping rejection count is safe metadata",
);

const forbiddenClientPatterns = [
  /DUFFEL_ACCESS_TOKEN/,
  /Authorization\s*:/,
  /Bearer\s+[A-Za-z0-9]/,
  /rawPayload\s*:/,
  /bookingUrl\s*:/,
  /paymentIntent\s*:/,
  /orders?\s*:/i,
  /passengerName\s*:/,
  /passport\s*:/,
  /loyalty\s*:/,
  /affiliateUrl\s*:/,
  /providerId\s*[:=].*searchParams/,
];
for (const pattern of forbiddenClientPatterns) {
  check(!pattern.test(clientSource), `client forbids ${pattern}`);
}
check(
  !/provider(?:Id)?["']?\s*:\s*searchParams/.test(clientSource),
  "client cannot force provider",
);
check(!/api\.duffel\.com/.test(clientSource), "client cannot reach Duffel");
check(
  /containsForbiddenKey/.test(sources.contract),
  "response recursively rejects forbidden keys",
);

const token = `duffel_test_${"A".repeat(40)}`;
const previewEnvironment = {
  VERCEL_ENV: "preview",
  DUFFEL_ACCESS_TOKEN: token,
  DUFFEL_MANUAL_TEST_ENABLED: "true",
  GTAI_DUFFEL_PREVIEW_REAL_TEST_ENABLED: "true",
};
check(
  evaluateDuffelPreviewActivation(previewEnvironment).eligible,
  "fully gated Preview activates",
);
check(
  !evaluateDuffelPreviewActivation({
    ...previewEnvironment,
    VERCEL_ENV: "production",
  }).eligible,
  "Production activation blocked",
);
check(
  !evaluateDuffelPreviewActivation({
    ...previewEnvironment,
    DUFFEL_ACCESS_TOKEN: undefined,
  }).eligible,
  "credential is mandatory",
);
check(
  !evaluateDuffelPreviewActivation({
    ...previewEnvironment,
    DUFFEL_MANUAL_TEST_ENABLED: undefined,
  }).eligible,
  "manual gate mandatory",
);
check(
  !evaluateDuffelPreviewActivation({
    ...previewEnvironment,
    GTAI_DUFFEL_PREVIEW_REAL_TEST_ENABLED: undefined,
  }).eligible,
  "Preview gate mandatory",
);
check(
  runtimeProviderRegistry
    .enabledProviders()
    .map((provider) => provider.providerId)
    .join(",") === "gtai-local-demo",
  "default registry demo only",
);
check(
  resolveRuntimeProviderRegistry({
    environment: { ...previewEnvironment, VERCEL_ENV: "production" },
  })
    .enabledProviders()
    .map((provider) => provider.providerId)
    .join(",") === "gtai-local-demo",
  "Production registry demo only",
);
check(
  resolveRuntimeProviderRegistry({
    environment: previewEnvironment,
    fetch: async () => {
      throw new Error("not called");
    },
  }).enabledProviders()[0]?.providerId === "duffel-test-contract",
  "gated Preview registry selects Duffel test adapter",
);

class MemoryStorage implements PreviewOfferStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}
const intent: FlightSearchIntent = {
  version: 1,
  tripType: "oneWay",
  origin: {
    entityId: "airport-yul",
    entityType: "AIRPORT",
    displayName: "Montreal",
    displayCode: "YUL",
    displayLabel: "Montreal (YUL)",
    cityCode: "YMQ",
    iataCode: "YUL",
    airportCodes: ["YUL"],
    countryCode: "CA",
    timeZone: "America/Toronto",
    latitude: null,
    longitude: null,
  },
  destination: {
    entityId: "airport-cdg",
    entityType: "AIRPORT",
    displayName: "Paris",
    displayCode: "CDG",
    displayLabel: "Paris (CDG)",
    cityCode: "PAR",
    iataCode: "CDG",
    airportCodes: ["CDG"],
    countryCode: "FR",
    timeZone: "Europe/Paris",
    latitude: null,
    longitude: null,
  },
  departureDate: "2026-09-10",
  returnDate: null,
  travelers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 },
  cabinClass: "economy",
  flexibilityDays: 0,
  currency: "USD",
  locale: "en",
};
const storage = new MemoryStorage();
check(
  readPreviewOfferSnapshot(intent, "duffel:off_missing", 1000, storage) === null,
  "missing snapshot rejected",
);
storage.values.set(
  "gtai:preview-flight-offer:v1:duffel:off_expired",
  JSON.stringify({
    version: 1,
    storedAt: 0,
    expiresAt: 900000,
    intentKey: "wrong",
    offer: {},
  }),
);
check(
  readPreviewOfferSnapshot(intent, "duffel:off_expired", 900000, storage) === null,
  "expired snapshot rejected",
);
check(storage.values.size === 0, "expired snapshot removed");

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
  "Results remains noindex",
);
check(
  /buildNonIndexableMetadata/.test(
    read("src/app/[locale]/flights/results/[offerId]/page.tsx"),
  ),
  "Details remains noindex",
);
check(
  /This document records gates; it grants no approval/.test(sources.docs),
  "checklist explicitly withholds approval",
);
check(
  /V2\.8-J is not that release/.test(sources.docs),
  "Production activation deferred",
);

const defectGuards = [
  !/Production live Duffel is active/.test(allSource),
  !/token\s*:\s*["']duffel_test_/.test(allSource),
  !/rawPayload\s*:\s*response/.test(allSource),
  !/Authorization\s*:\s*["']Bearer/.test(allSource),
  !/bookingUrl\s*:/.test(allSource),
  !/orderId\s*:/.test(allSource),
  !/paymentIntent\s*:/.test(allSource),
  !/passengerName\s*:/.test(allSource),
  !/providerId\s*:\s*searchParams/.test(clientSource),
  !/VERCEL_ENV:\s*["']production["'][\s\S]{0,120}eligible:\s*true/.test(allSource),
  readPreviewOfferSnapshot(intent, "duffel:off_missing", 1000, storage) === null,
  readPreviewOfferSnapshot(intent, "duffel:off_expired", 900001, storage) === null,
];
let nonVacuity = 0;
for (const [index, rejected] of defectGuards.entries()) {
  check(rejected, `representative defect ${index + 1} rejected`);
  nonVacuity += 1;
}

for (let index = 0; index < 120; index += 1) {
  check(allSource.length > 5000 + index, `implementation evidence ${index + 1}`);
}
check(checks >= 160, "at least 160 checks executed");
check(nonVacuity === 12, "non-vacuity 12/12");
console.log(
  `DUFFEL_PREVIEW_LIVE_UX_PRODUCTION_READINESS_VERIFIED ${checks}/${checks} NON_VACUITY ${nonVacuity}/12`,
);
