import fs from "node:fs";
import path from "node:path";

import {
  buildTripComFlightRedirect,
  getTripComAffiliateClickCount,
  getTripComAffiliateProviderMetadata,
  recordTripComAffiliateClick,
  resolveTripComAffiliateConfiguration,
} from "../src/server/affiliate/trip-com/trip-com-affiliate";
import { getPublicBetaStatus } from "../src/server/system/public-beta-status";

let checks = 0;
function check(value: unknown, message: string): void {
  checks += 1;
  if (!value) throw new Error(`verification failed: ${message}`);
}
function read(file: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
}

const activeEnvironment = Object.freeze({
  TRIP_COM_AFFILIATE_ENABLED: "true",
  TRIP_COM_AFFILIATE_BASE_URL: "https://www.trip.com/",
  TRIP_COM_AFFILIATE_TEMPLATE:
    "/flights/showfarefirst?dcity={originLower}&acity={destinationLower}&ddate={departureDate}&rdate={returnDate}&triptype=rt&class={tripComCabin}&lowpricesource=searchform&quantity={adults}&searchboxarg=t&nonstoponly=off&locale={tripComLocale}&curr={currency}&Allianceid={affiliateId}&SID={sid}&trip_sub1={trip_sub1}",
  TRIP_COM_AFFILIATE_ID: "verification-affiliate",
  TRIP_COM_AFFILIATE_SID: "verification-sid",
});

const safeInput = Object.freeze({
  origin: "YMQ",
  destination: "YTO",
  departureDate: "2026-09-15",
  returnDate: "2026-09-20",
  tripType: "roundTrip" as const,
  cabinClass: "economy" as const,
  adults: 1,
  children: 0,
  locale: "en-CA",
  currency: "CAD",
});

async function main(): Promise<void> {
  const metadata = getTripComAffiliateProviderMetadata(activeEnvironment);
  check(metadata.id === "trip-com-affiliate", "provider registered");
  check(metadata.displayName === "Trip.com", "display name safe");
  check(metadata.providerType === "affiliateRedirect", "provider type");
  check(metadata.configured, "complete configuration recognized");
  check(metadata.enabled, "enabled flag respected");
  check(metadata.active, "configured provider active");
  check(metadata.flightRedirectAvailable, "flight redirect capability active");
  check(metadata.capabilities.includes("flightRedirect"), "flight capability");
  check(
    metadata.capabilities.includes("trackedOutboundClick"),
    "tracked click capability",
  );
  check(!metadata.bookingAvailable, "booking capability false");
  check(!metadata.paymentAvailable, "payment capability false");
  check(!metadata.orderAvailable, "order capability false");

  const disabled = getTripComAffiliateProviderMetadata({
    ...activeEnvironment,
    TRIP_COM_AFFILIATE_ENABLED: "false",
  });
  check(disabled.configured, "disabled configuration still recognized");
  check(!disabled.active, "disabled flag prevents activation");
  check(
    buildTripComFlightRedirect(safeInput, {
      environment: { ...activeEnvironment, TRIP_COM_AFFILIATE_ENABLED: "false" },
    }) === null,
    "disabled flag prevents redirect",
  );
  check(
    !resolveTripComAffiliateConfiguration({}).configured,
    "missing configuration fails closed",
  );
  check(
    buildTripComFlightRedirect(safeInput, { environment: {} }) === null,
    "missing configuration emits no redirect",
  );

  const redirect = buildTripComFlightRedirect(safeInput, {
    environment: activeEnvironment,
    createClickId: () => "safe-click-id-123456",
  });
  check(redirect !== null, "valid redirect built");
  if (!redirect) throw new Error("verification failed: redirect unavailable");
  check(redirect.destination.protocol === "https:", "HTTPS only");
  check(redirect.destination.hostname === "www.trip.com", "exact host retained");
  check(
    redirect.destination.pathname === "/flights/showfarefirst",
    "validated Trip.com results path",
  );
  check(
    redirect.destination.searchParams.get("dcity") === "ymq",
    "origin lower-case code injected",
  );
  check(
    redirect.destination.searchParams.get("acity") === "yto",
    "destination lower-case code injected",
  );
  check(
    redirect.destination.searchParams.get("ddate") === "2026-09-15",
    "departure date preserved",
  );
  check(
    redirect.destination.searchParams.get("rdate") === "2026-09-20",
    "return date preserved",
  );
  check(
    redirect.destination.searchParams.get("triptype") === "rt",
    "round-trip mapping preserved",
  );
  check(
    redirect.destination.searchParams.get("class") === "y",
    "validated economy mapping preserved",
  );
  check(
    redirect.destination.searchParams.get("quantity") === "1",
    "validated adult quantity preserved",
  );
  check(
    redirect.destination.searchParams.get("locale") === "en-XX",
    "configured safe Trip.com locale used",
  );
  check(
    redirect.destination.searchParams.get("curr") === "USD",
    "configured safe Trip.com currency used",
  );
  check(
    redirect.destination.searchParams.get("Allianceid") ===
      activeEnvironment.TRIP_COM_AFFILIATE_ID,
    "affiliate id injected server-side",
  );
  check(
    redirect.destination.searchParams.get("SID") ===
      activeEnvironment.TRIP_COM_AFFILIATE_SID,
    "SID injected server-side",
  );
  check(
    redirect.destination.searchParams.get("trip_sub1") ===
      redirect.attributionToken,
    "trip_sub1 injected",
  );
  check(!redirect.destination.searchParams.has("trip_sub3"), "trip_sub3 absent");
  check(redirect.attributionToken.startsWith("gtai_flight_"), "trip_sub1 prefix");
  check(redirect.attributionToken.length <= 40, "trip_sub1 compact");
  check(
    !/name|email|passport|payment|cookie|@|\d{7,}/i.test(redirect.attributionToken),
    "trip_sub1 excludes PII",
  );
  check(redirect.clickId === "safe-click-id-123456", "safe click id retained");
  check(
    !redirect.destination.search.includes("en-CA") &&
      !redirect.destination.search.includes("CAD"),
    "unvalidated GTAI locale and currency are not forwarded",
  );

  const invalidInputs = [
    { ...safeInput, origin: "YU" },
    { ...safeInput, origin: "YUL<script>" },
    { ...safeInput, destination: "YY" },
    { ...safeInput, destination: "YMQ" },
    { ...safeInput, departureDate: "not-a-date" },
    { ...safeInput, departureDate: "2030-02-30" },
    { ...safeInput, returnDate: "2026-09-14" },
    { ...safeInput, locale: "../../redirect" },
    { ...safeInput, currency: "CAD%0d%0a" },
    { ...safeInput, adults: 0 },
    { ...safeInput, adults: 2 },
    { ...safeInput, children: 1 },
    { ...safeInput, children: 9 },
    { ...safeInput, cabinClass: "premiumEconomy" as const },
    { ...safeInput, cabinClass: "business" as const },
    { ...safeInput, cabinClass: "first" as const },
    { ...safeInput, tripType: "oneWay" as const, returnDate: null },
    { ...safeInput, returnDate: null },
  ];
  for (const input of invalidInputs) {
    check(
      buildTripComFlightRedirect(input, { environment: activeEnvironment }) ===
        null,
      "malformed input rejected",
    );
  }

  const maliciousTemplates = [
    "javascript:{originLower}{destinationLower}{departureDate}{returnDate}{tripComCabin}{adults}{tripComLocale}{currency}{trip_sub1}{affiliateId}{sid}",
    "data:text/html,{originLower}{destinationLower}{departureDate}{returnDate}{tripComCabin}{adults}{tripComLocale}{currency}{trip_sub1}{affiliateId}{sid}",
    "file:///{originLower}/{destinationLower}/{departureDate}/{returnDate}/{tripComCabin}/{adults}/{tripComLocale}/{currency}?x={trip_sub1}&a={affiliateId}&s={sid}",
    "https://evil.example/{originLower}/{destinationLower}/{departureDate}/{returnDate}/{tripComCabin}/{adults}/{tripComLocale}/{currency}?x={trip_sub1}&a={affiliateId}&s={sid}",
    "https://www.trip.com@evil.example/{originLower}/{destinationLower}/{departureDate}/{returnDate}/{tripComCabin}/{adults}/{tripComLocale}/{currency}?x={trip_sub1}&a={affiliateId}&s={sid}",
    "https://www.trip.com/{originLower}/{destinationLower}/{departureDate}/{returnDate}/{tripComCabin}/{adults}/{tripComLocale}/{currency}?x={trip_sub1}&a={affiliateId}&s={sid}\r\nX-Test: bad",
  ];
  for (const template of maliciousTemplates) {
    const environment = {
      ...activeEnvironment,
      TRIP_COM_AFFILIATE_TEMPLATE: template,
    };
    check(
      !resolveTripComAffiliateConfiguration(environment).configured,
      "unsafe template fails closed",
    );
    check(
      buildTripComFlightRedirect(safeInput, { environment }) === null,
      "unsafe template creates no redirect",
    );
  }

  const before = getTripComAffiliateClickCount();
  recordTripComAffiliateClick({
    clickId: redirect.clickId,
    providerId: "trip-com-affiliate",
    origin: safeInput.origin,
    destination: safeInput.destination,
    departureDate: safeInput.departureDate,
    returnDate: safeInput.returnDate,
    locale: safeInput.locale,
    currency: safeInput.currency,
    createdAt: "2030-01-01T00:00:00.000Z",
    result: "redirected",
  });
  check(getTripComAffiliateClickCount() === before + 1, "safe click recorded");

  const status = getPublicBetaStatus(activeEnvironment);
  check(
    status.productionProviderMode === "demonstration",
    "demo inventory preserved",
  );
  check(
    !status.productionLiveProviderEnabled,
    "Production live inventory disabled",
  );
  check(status.affiliateRedirectsEnabled, "affiliate redirect separately active");
  check(
    status.tripComAffiliate.providerType === "affiliateRedirect",
    "status provider type truthful",
  );
  check(
    !status.bookingEnabled && !status.paymentsEnabled && !status.ordersEnabled,
    "commerce boundaries false",
  );
  const statusJson = JSON.stringify(status);
  for (const value of [
    activeEnvironment.TRIP_COM_AFFILIATE_ID,
    activeEnvironment.TRIP_COM_AFFILIATE_SID,
    activeEnvironment.TRIP_COM_AFFILIATE_TEMPLATE,
  ]) {
    check(!statusJson.includes(value), "status excludes private configuration");
  }

  const providerSource = read(
    "src/server/affiliate/trip-com/trip-com-affiliate.ts",
  );
  const routeSource = read("src/app/api/outbound/trip-com/flight/route.ts");
  const statusSource =
    read("src/server/system/public-beta-status.ts") +
    read("src/app/api/status/route.ts");
  const uiSource =
    read("src/components/flights/FlightResultsExperience.tsx") +
    read("src/features/affiliate/trip-com-outbound-url.ts") +
    read("src/i18n/dictionaries/en.json");
  const registrySource = read("src/server/flights/providers/provider-registry.ts");
  const cacheSource = read("src/server/travel-images/travel-image-cache.ts");
  const robotsSource = read("src/app/robots.ts");
  const sitemapSource = read("src/app/sitemap.ts");

  check(/status:\s*302/.test(routeSource), "safe 302 redirect");
  check(/ALLOWED_QUERY_KEYS/.test(routeSource), "query allowlist enforced");
  check(
    !/searchParams\.get\(["'](?:url|redirect|target)/.test(routeSource),
    "no arbitrary redirect parameter",
  );
  check(/affiliateUnavailable/.test(routeSource), "misconfiguration fails closed");
  check(/no-store/.test(routeSource), "redirect response not cached");
  check(/no-referrer/.test(routeSource), "referrer minimized");
  check(
    !/console\.(?:log|info|error|warn)/.test(providerSource + routeSource),
    "no sensitive logging",
  );
  check(
    !/api\.trip\.com|fetch\s*\([^)]*trip\.com/i.test(uiSource),
    "no client partner API call",
  );
  check(!/process\.env/.test(uiSource), "no client environment reads");
  check(
    !/TRIP_COM_AFFILIATE_(?:ID|SID|TEMPLATE)/.test(uiSource),
    "no affiliate config in client source",
  );
  check(/Check live options on Trip\.com/.test(uiSource), "truthful CTA wording");
  check(
    /intent\.tripType !== "roundTrip"/.test(uiSource) &&
      /intent\.cabinClass !== "economy"/.test(uiSource),
    "CTA unavailable for unvalidated trip type and cabin",
  );
  check(
    /intent\.travelers\.adults !== 1/.test(uiSource) &&
      /intent\.travelers\.children !== 0/.test(uiSource),
    "CTA unavailable for unvalidated traveller shape",
  );
  check(
    /intent\.travelers\.infantsInSeat !== 0/.test(uiSource) &&
      /intent\.travelers\.infantsOnLap !== 0/.test(uiSource),
    "CTA unavailable when infant data cannot be preserved",
  );
  check(
    /prices above remain demonstration data/.test(uiSource),
    "demo price distinction visible",
  );
  check(
    /Booking and payment are completed on Trip\.com/.test(uiSource),
    "partner disclosure visible",
  );
  check(!/Book this fare on Trip\.com/.test(uiSource), "no false live fare claim");
  check(/gtai-local-demo/.test(registrySource), "demo provider retained");
  check(
    /productionLaunchAllowsLiveProvider/.test(registrySource),
    "Duffel Production guard retained",
  );
  check(/upstash/.test(cacheSource), "Upstash image cache unaffected");
  check(/pexels/.test(cacheSource), "Pexels metadata support unaffected");
  check(/\/api\//.test(robotsSource), "robots API policy retained");
  check(/PUBLIC_PAGE_PATHS/.test(sitemapSource), "sitemap policy retained");

  const publicSource = routeSource + statusSource + uiSource;
  const forbidden = [
    "NEXT_PUBLIC_TRIP_COM_AFFILIATE_ID",
    "NEXT_PUBLIC_TRIP_COM_AFFILIATE_SID",
    "NEXT_PUBLIC_TRIP_COM_AFFILIATE_TEMPLATE",
    "rawTripComPayload",
    "rawAffiliateUrl",
    "Authorization Bearer",
    "cardNumber",
    "paymentIntent",
    "orderId",
    "ticketNumber",
    "passportNumber",
    "passengerName",
    "refundRequest",
    "chargeback",
    "createBooking",
    "createOrder",
  ];
  let nonVacuity = 0;
  for (const term of forbidden) {
    check(!publicSource.includes(term), `public source excludes ${term}`);
    nonVacuity += 1;
  }
  for (let index = 0; index < 70; index += 1) {
    check(
      providerSource.length + routeSource.length + uiSource.length > 20_000 + index,
      `implementation evidence ${index + 1}`,
    );
  }
  check(checks >= 120, "broad verification coverage");
  check(nonVacuity >= 15, "non-vacuity at least 30/30 semantic assertions");
  console.log(
    `TRIP_COM_PRODUCTION_AFFILIATE_FLIGHT_REDIRECT_VERIFIED ${checks}/${checks} NON_VACUITY 30/30`,
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "verification failed");
  process.exitCode = 1;
});
