import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildTripComCategoryRedirect,
  getTripComAffiliateProviderMetadata,
} from "../src/server/affiliate/trip-com/trip-com-affiliate";
import { getPublicBetaStatus } from "../src/server/system/public-beta-status";

function check(value: unknown, label: string): void {
  if (!value) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}
function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const template =
  "https://www.trip.com/?aid={affiliateId}&sid={sid}&trip_sub1={trip_sub1}";
const environment = {
  TRIP_COM_AFFILIATE_ENABLED: "true",
  TRIP_COM_AFFILIATE_BASE_URL: "https://www.trip.com/",
  TRIP_COM_AFFILIATE_ID: "server-affiliate",
  TRIP_COM_AFFILIATE_SID: "server-sid",
  TRIP_COM_AFFILIATE_TEMPLATE:
    "https://www.trip.com/flights/showfarefirst?dcity={originLower}&acity={destinationLower}&ddate={departureDate}&rdate={returnDate}&triptype=rt&class={tripComCabin}&quantity={adults}&locale={tripComLocale}&curr={currency}&aid={affiliateId}&sid={sid}&trip_sub1={trip_sub1}",
  TRIP_COM_HOTEL_AFFILIATE_TEMPLATE: template,
  TRIP_COM_TRAIN_AFFILIATE_TEMPLATE: template,
  TRIP_COM_ATTRACTION_AFFILIATE_TEMPLATE: template,
  TRIP_COM_PACKAGE_AFFILIATE_TEMPLATE: template,
  TRIP_COM_CAR_AFFILIATE_TEMPLATE: template,
};

const metadata = getTripComAffiliateProviderMetadata(environment);
check(
  metadata.providerType === "affiliateRedirect",
  "provider remains affiliateRedirect",
);
for (const capability of [
  "flightRedirect",
  "hotelRedirect",
  "trainRedirect",
  "attractionRedirect",
  "packageRedirect",
  "carRentalRedirect",
  "trackedOutboundClick",
] as const) {
  check(metadata.capabilities.includes(capability), `${capability} registered`);
}
check(
  !metadata.bookingAvailable &&
    !metadata.paymentAvailable &&
    !metadata.orderAvailable,
  "commerce capabilities false",
);

for (const vertical of [
  "hotel",
  "train",
  "attraction",
  "package",
  "car",
] as const) {
  const redirect = buildTripComCategoryRedirect(vertical, {
    environment,
    createClickId: () => "safe-click-123456",
  });
  check(
    redirect?.destination.protocol === "https:" &&
      redirect.destination.hostname === "www.trip.com",
    `${vertical} exact HTTPS Trip.com redirect`,
  );
  check(
    redirect?.attributionToken.startsWith(`gtai_${vertical}_`) &&
      !redirect.attributionToken.includes("safe-click"),
    `${vertical} hashed non-PII attribution`,
  );
  check(
    !redirect?.destination.toString().includes("trip_sub3"),
    `${vertical} omits trip_sub3`,
  );
}
check(
  buildTripComCategoryRedirect("hotel", {
    environment: {
      ...environment,
      TRIP_COM_HOTEL_AFFILIATE_TEMPLATE: "javascript:alert(1)",
    },
  }) === null,
  "javascript redirect rejected",
);
check(
  buildTripComCategoryRedirect("hotel", {
    environment: {
      ...environment,
      TRIP_COM_HOTEL_AFFILIATE_TEMPLATE:
        "https://evil.example/?aid={affiliateId}&sid={sid}&trip_sub1={trip_sub1}",
    },
  }) === null,
  "arbitrary host rejected",
);
check(
  getTripComAffiliateProviderMetadata({
    ...environment,
    TRIP_COM_HOTEL_AFFILIATE_TEMPLATE: undefined,
  }).flightRedirectAvailable,
  "missing category template preserves flights",
);
check(
  !getTripComAffiliateProviderMetadata({
    ...environment,
    TRIP_COM_AFFILIATE_ENABLED: "false",
  }).active,
  "global rollback works",
);

const status = JSON.stringify(getPublicBetaStatus(environment));
check(
  !status.includes("server-affiliate") &&
    !status.includes("server-sid") &&
    !status.includes(template),
  "status exposes no secrets or templates",
);
const categoryRoute = read("src/app/api/outbound/trip-com/[vertical]/route.ts");
check(
  categoryRoute.includes("dynamicSearchNotSupported") &&
    categoryRoute.includes("searchParams.keys"),
  "dynamic category parameters fail closed",
);
check(
  !/booking|payment|order/i.test(categoryRoute),
  "redirect route adds no commerce code",
);
const ui =
  read("src/i18n/dictionaries/en.json") +
  read("src/components/affiliate/TripComCategoryCta.tsx");
check(
  ui.includes("Booking and payment are completed on Trip.com") &&
    ui.includes("generic Trip.com category search"),
  "truthful CTA disclosure rendered",
);
const flightUi = read("src/components/flights/FlightResultsExperience.tsx");
check(
  flightUi.includes("tripComAffiliate") &&
    read(
      "src/server/flights/providers/adapters/local-deterministic-provider-adapter.ts",
    ).includes("gtai-local-demo"),
  "existing flight demo remains separate",
);
console.log("Trip.com multi-vertical affiliate expansion verification passed.");
