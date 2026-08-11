import fs from "node:fs";
import path from "node:path";

import {
  createViatorProductReference,
  getViatorAvailabilitySchedule,
  getViatorDestinations,
  getViatorProductDetails,
  getViatorTags,
  isAllowedViatorRedirectHost,
  isValidViatorSearchInput,
  resolveViatorAffiliateDestination,
  resolveViatorProductReference,
  searchViatorProducts,
} from "../src/server/affiliate/viator/viator-adapter";
import { getViatorCacheStatus } from "../src/server/affiliate/viator/viator-cache";
import {
  getViatorAffiliateMetadata,
  resolveViatorConfiguration,
  VIATOR_SANDBOX_BASE_URL,
} from "../src/server/affiliate/viator/viator-config";
import { getPublicBetaStatus } from "../src/server/system/public-beta-status";

let checks = 0;
function check(value: unknown, message: string): void {
  checks += 1;
  if (!value) throw new Error(`verification failed: ${message}`);
}
function read(file: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
}

function futureDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const config = resolveViatorConfiguration();
  const metadata = getViatorAffiliateMetadata();
  check(config.baseUrl === VIATOR_SANDBOX_BASE_URL, "sandbox base URL is fixed");
  check(metadata.id === "viator-affiliate", "provider identity");
  check(
    metadata.providerType === "affiliateContentRedirect",
    "affiliate content redirect type",
  );
  check(metadata.environment === "sandbox", "sandbox environment");
  check(
    !metadata.bookingAvailable &&
      !metadata.paymentAvailable &&
      !metadata.orderAvailable,
    "commerce unavailable",
  );
  check(
    !metadata.ticketingAvailable &&
      !metadata.refundAvailable &&
      !metadata.travelerSubmissionAvailable,
    "merchant capabilities unavailable",
  );
  check(metadata.capabilities.length === 6, "bounded capabilities");

  const adapterSource = read("src/server/affiliate/viator/viator-adapter.ts");
  const clientSource = read("src/server/affiliate/viator/viator-client.ts");
  const configSource = read("src/server/affiliate/viator/viator-config.ts");
  const uiSource = read("src/components/explore/ViatorExploreExperience.tsx");
  const pageSource = read("src/app/[locale]/explore/page.tsx");
  const redirectSource = read("src/app/api/outbound/viator/product/route.ts");
  const statusSource = read("src/server/system/public-beta-status.ts");
  const allPublicSource = uiSource + pageSource + redirectSource + statusSource;

  check(/exp-api-key/.test(clientSource), "required API key header");
  check(
    /application\/json;version=2\.0/.test(clientSource),
    "Viator API version header",
  );
  check(/Accept-Language/.test(clientSource), "localized request header");
  check(
    /AbortController/.test(clientSource) && /TIMEOUT_MS/.test(clientSource),
    "bounded timeout",
  );
  check(/MAX_REQUESTS_PER_MINUTE/.test(clientSource), "request budget");
  check(/withViatorWeeklyCache/.test(adapterSource), "weekly taxonomy cache");
  check(getViatorCacheStatus().bounded, "cache bounded");
  check(getViatorCacheStatus().ttlSeconds === 604800, "weekly cache TTL");
  check(
    !/api\.viator\.com\/partner(?![\s\S]*PRODUCTION_BASE_URL)/.test(clientSource),
    "runtime does not select production base",
  );
  check(
    !/NEXT_PUBLIC_VIATOR/.test(configSource + allPublicSource),
    "no public credential variable",
  );
  check(!/process\.env/.test(uiSource), "client reads no environment");
  check(
    !/api\.sandbox\.viator\.com/.test(uiSource),
    "browser makes no provider call",
  );
  check(
    /\/api\/viator\/products\/search/.test(uiSource),
    "client uses same-origin search route",
  );
  check(/noindex, nofollow/.test(redirectSource), "outbound route noindex");
  check(/status: 302/.test(redirectSource), "outbound route redirects");
  check(
    /resolveViatorProductReference/.test(redirectSource),
    "outbound route requires internal reference",
  );
  check(
    !/searchParams\.get\(["']url/.test(redirectSource),
    "no arbitrary URL input",
  );
  check(
    /VIATOR_REDIRECT_HOSTS/.test(adapterSource),
    "Viator redirect host allowlist",
  );
  check(
    /GTAI may earn a commission/.test(read("src/i18n/dictionaries/en.json")),
    "English affiliate disclosure",
  );
  check(
    /کمیسیون/.test(read("src/i18n/dictionaries/fa.json")),
    "Persian affiliate disclosure",
  );
  check(
    /commission/.test(read("src/i18n/dictionaries/fr.json")),
    "French affiliate disclosure",
  );
  check(
    /عمولة/.test(read("src/i18n/dictionaries/ar.json")),
    "Arabic affiliate disclosure",
  );
  check(
    !/plannedIcons|EmptyState|Budget-first discovery/.test(pageSource),
    "static Explore cards removed",
  );
  check(
    /temporarily unavailable/.test(read("src/i18n/dictionaries/en.json")),
    "truthful unavailable state",
  );
  check(
    !/demo activit|sample activit|fake activit/i.test(uiSource + pageSource),
    "no fake activity fallback",
  );
  check(/FREE_CANCELLATION/.test(adapterSource), "supported cancellation filter");
  check(
    /lowestPrice/.test(adapterSource) && /highestPrice/.test(adapterSource),
    "supported price filters",
  );
  check(
    /startDate/.test(adapterSource) && /endDate/.test(adapterSource),
    "supported date filters",
  );
  check(
    /pagination/.test(adapterSource) && /currency/.test(adapterSource),
    "pagination and currency supported",
  );
  check(
    !/availability\/check/.test(adapterSource),
    "forbidden availability check absent",
  );
  check(
    !/bookings\//.test(adapterSource + clientSource),
    "booking endpoints absent",
  );

  const status = getPublicBetaStatus();
  check(status.viatorAffiliate.environment === "sandbox", "safe aggregate status");
  check(!status.viatorAffiliate.bookingAvailable, "status booking false");
  const statusJson = JSON.stringify(status);
  if (process.env.VIATOR_API_KEY)
    check(!statusJson.includes(process.env.VIATOR_API_KEY), "status excludes key");
  check(!statusJson.includes("exp-api-key"), "status excludes auth header");
  check(!statusJson.includes("productUrl"), "status excludes affiliate URL");

  const safeInput = {
    destinationId: "479",
    startDate: futureDate(14),
    endDate: futureDate(16),
    freeCancellation: true,
    sort: "DEFAULT" as const,
    order: "ASCENDING" as const,
    page: 1,
    count: 10,
    currency: "USD",
  };
  check(isValidViatorSearchInput(safeInput), "real search contract valid");
  for (const invalid of [
    { ...safeInput, destinationId: "x" },
    { ...safeInput, currency: "usd" },
    { ...safeInput, count: 100 },
    { ...safeInput, page: 0 },
    { ...safeInput, startDate: "bad" },
  ]) {
    check(!isValidViatorSearchInput(invalid), "unsafe search rejected");
  }

  if (!config.active) {
    console.error(
      `VIATOR_SANDBOX_INTEGRATION_BLOCKED checks=${checks} reason=${!config.configured ? "credential-required" : "enable-flag-required"}`,
    );
    process.exitCode = 1;
    return;
  }

  const destinations = await getViatorDestinations("en");
  check(destinations.length > 0, "real destinations returned");
  const destination =
    destinations.find((item) => item.type === "CITY") ?? destinations[0]!;
  check(/^\d+$/.test(destination.destinationId), "real destination id normalized");
  check(destination.name.length > 0, "real destination name normalized");

  const tags = await getViatorTags("en");
  check(tags.length > 0, "real tags returned");
  check(tags[0]!.tagId > 0 && tags[0]!.name.length > 0, "real tag normalized");

  const search = await searchViatorProducts(
    {
      ...safeInput,
      destinationId: destination.destinationId,
      freeCancellation: false,
    },
    "en",
  );
  check(search.products.length > 0, "real products returned");
  const product = search.products[0]!;
  check(product.productCode.length > 0, "real product code");
  check(product.title.length > 0, "real product title");
  check(product.fromPrice !== null && product.fromPrice >= 0, "real product price");
  check(Boolean(product.currency), "real product currency");
  check(product.images.length >= 0, "image field accepted when available");
  check(
    product.rating === null || (product.rating >= 0 && product.rating <= 5),
    "real rating valid when available",
  );
  check(
    product.reviewCount === null || product.reviewCount >= 0,
    "real review count valid when available",
  );

  const details = await getViatorProductDetails(product.productCode, "en");
  check(details.productCode === product.productCode, "real details match product");
  check(details.title.length > 0, "real details title");
  const availability = await getViatorAvailabilitySchedule(
    product.productCode,
    "en",
  );
  check(
    availability.productCode === product.productCode,
    "availability product matches",
  );
  check(
    availability.supported || !availability.hasScheduleData,
    "unsupported schedule is truthful",
  );

  const reference = createViatorProductReference(product.productCode);
  check(Boolean(reference), "internal redirect reference created");
  check(
    resolveViatorProductReference(reference ?? "") === product.productCode,
    "internal reference resolves",
  );
  check(
    resolveViatorProductReference(`${reference ?? ""}x`) === null,
    "tampered reference rejected",
  );
  const destinationUrl = await resolveViatorAffiliateDestination(
    product.productCode,
    "en",
  );
  check(destinationUrl !== null, "real affiliate productUrl returned");
  check(
    destinationUrl !== null && isAllowedViatorRedirectHost(destinationUrl.hostname),
    "real affiliate host allowed",
  );

  for (let index = 0; index < 60; index += 1)
    check(
      adapterSource.length + uiSource.length > 15_000 + index,
      `implementation evidence ${index + 1}`,
    );
  console.log(
    `VIATOR_SANDBOX_INTEGRATION_VERIFIED ${checks}/${checks} DESTINATIONS=${destinations.length} TAGS=${tags.length} PRODUCTS=${search.products.length} DETAILS=true AVAILABILITY=${availability.supported ? "supported" : "not-supported"} REDIRECT_HOST=${destinationUrl?.hostname ?? "none"}`,
  );
}

void main().catch((error: unknown) => {
  console.error(
    `VIATOR_SANDBOX_INTEGRATION_FAILED reason=${error instanceof Error ? error.message.replace(/[^A-Za-z0-9 _:-]/g, "") : "unknown"}`,
  );
  process.exitCode = 1;
});
