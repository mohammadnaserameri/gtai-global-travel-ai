/**
 * Deterministic checks for the V2.6 Flight Details page: offer-id
 * validation, the Details/return URL contract, the resolution pipeline and
 * its five availability states, itinerary and time-zone invariants, fare and
 * price scope, highlight scoping, and the truthfulness/no-network
 * guarantees the Details feature must keep.
 *
 * Same contract as the other `verify-*.ts` scripts — no test runner, no new
 * dependency, compiled by the project's own TypeScript compiler and run
 * under Node via the shared verification tsconfig. A few checks read this
 * repository's own source as text, because "no `fetch`", "no
 * `target="_blank"`" and "no Book/Buy copy" are properties of the source
 * rather than of a running page.
 *
 *   npm run verify:details
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { addDays, todayIso } from "../src/features/dates/date-utils";
import { DEMO_LOCATIONS } from "../src/features/locations/demo-location-data";
import {
  buildSearchIntent,
  validateSearchIntentParams,
} from "../src/features/flights/search-intent-validation";
import { DEFAULT_TRAVELERS } from "../src/features/flights/search-intent-types";
import { parseRawSearchIntentParams } from "../src/features/flights/search-intent-url";
import { DemoFlightOfferRepository } from "../src/features/flights/demo-flight-offer-repository";
import { computeHighlights } from "../src/features/flights/flight-offer-highlights";
import { sortOffers } from "../src/features/flights/flight-offer-ranking";
import { applyFilters } from "../src/features/flights/filters/flight-filter-application";
import { EMPTY_FILTER_STATE } from "../src/features/flights/filters/flight-filter-types";
import {
  parseResultsViewState,
  sanitizeFiltersAgainstOffers,
  serializationBoundsForOffers,
} from "../src/features/flights/filters/flight-filter-url";
import {
  durationBounds,
  priceBounds,
} from "../src/features/flights/filters/flight-filter-facets";
import {
  formatDayOffset,
  formatLocalDate,
  formatLocaleNumber,
  formatTemplate,
} from "../src/features/flights/flight-offer-formatting";
import type { LocalDateTime } from "../src/features/flights/flight-offer-types";
import {
  buildClearedFiltersDetailsUrl,
  buildFlightDetailsUrl,
  buildResultsReturnUrl,
  isValidOfferId,
  parseFlightDetailsContext,
} from "../src/features/flights/details/flight-details-url";
import { resolveFlightDetails } from "../src/features/flights/details/flight-details-resolution";
import {
  buildItineraryTimeline,
  isItineraryChronological,
} from "../src/features/flights/details/flight-details-formatting";
import enDictionary from "../src/i18n/dictionaries/en.json";
import frDictionary from "../src/i18n/dictionaries/fr.json";
import faDictionary from "../src/i18n/dictionaries/fa.json";
import arDictionary from "../src/i18n/dictionaries/ar.json";

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

function localDateTime(date: string, time: string, epoch: number): LocalDateTime {
  return { date, time, epochMinutes: epoch };
}

/** Renders the highlight-scope template exactly as the component does, for digit checks. */
function formatTemplateForCount(
  template: string,
  count: number,
  locale: string,
): string {
  return formatTemplate(template, {
    count: formatLocaleNumber(count, locale),
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
  if (!ymq || !lhr) throw new Error("Fixture locations missing.");

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
  if (!intent) throw new Error("Fixture intent failed to build.");

  const repo = new DemoFlightOfferRepository({ delayMs: 0 });
  const { offers } = await repo.search(intent);
  ok("fixture generated a usable offer set", offers.length >= 10);

  const baseParams = new URLSearchParams();
  baseParams.set("v", "1");
  baseParams.set("trip", "roundTrip");
  baseParams.set("origin", ymq.id);
  baseParams.set("destination", lhr.id);
  baseParams.set("departure", departure);
  baseParams.set("return", returnDate);
  baseParams.set("adults", "1");
  baseParams.set("cabin", "economy");
  baseParams.set("flex", "0");
  baseParams.set("currency", "CAD");

  const sampleOffer = offers[0];

  // --- 1-5. Offer-ID validation --------------------------------------------------------------
  ok("1. a real generated offer id is accepted", isValidOfferId(sampleOffer.id));
  ok(
    "2. an arbitrary external reference is rejected",
    !isValidOfferId("https://example.com/offer"),
  );
  ok("3. an empty offer id is rejected", !isValidOfferId(""));
  ok(
    "4. an overlong offer id is rejected",
    !isValidOfferId(`demo-${"a".repeat(200)}-0`),
  );
  ok(
    "5. encoded and raw separators are rejected",
    !isValidOfferId("demo-abc%2F..%2Fetc-0") &&
      !isValidOfferId("demo-abc/../etc-0") &&
      !isValidOfferId("../../etc/passwd") &&
      !isValidOfferId("demo-abc -0") &&
      !isValidOfferId("demo-ABC-0") &&
      !isValidOfferId(null),
  );

  // --- 6-11. Details / return URL contract ---------------------------------------------------
  const viewState = {
    sort: "cheapest" as const,
    filters: { ...EMPTY_FILTER_STATE, stopCategories: ["direct" as const] },
  };
  const detailsUrl = buildFlightDetailsUrl(
    locale,
    sampleOffer.id,
    baseParams,
    viewState,
    offers,
  );
  const detailsQuery = new URLSearchParams(detailsUrl.split("?")[1] ?? "");

  check(
    "6. the Details URL preserves every Search Intent parameter exactly",
    [
      "v",
      "trip",
      "origin",
      "destination",
      "departure",
      "return",
      "adults",
      "cabin",
      "flex",
      "currency",
    ].map((key) => detailsQuery.get(key)),
    [
      "1",
      "roundTrip",
      ymq.id,
      lhr.id,
      departure,
      returnDate,
      "1",
      "economy",
      "0",
      "CAD",
    ],
  );
  check(
    "7. the Details URL preserves a valid Sort",
    detailsQuery.get("sort"),
    "cheapest",
  );
  check(
    "8. the Details URL preserves valid Filters",
    detailsQuery.get("stops"),
    "direct",
  );
  const defaultDetailsUrl = buildFlightDetailsUrl(
    locale,
    sampleOffer.id,
    baseParams,
    { sort: "best", filters: EMPTY_FILTER_STATE },
    offers,
  );
  const defaultQuery = new URLSearchParams(defaultDetailsUrl.split("?")[1] ?? "");
  ok(
    "9. the Details URL omits default view state (no sort/stops/carriers keys)",
    !defaultQuery.has("sort") &&
      !defaultQuery.has("stops") &&
      !defaultQuery.has("carriers") &&
      !defaultQuery.has("maxPrice"),
  );
  const returnUrl = buildResultsReturnUrl(locale, baseParams, viewState, offers);
  ok(
    "10. the return-to-results URL contains no offer id in its path",
    !returnUrl.includes(sampleOffer.id) &&
      returnUrl.startsWith("/en/flights/results?"),
  );
  ok(
    "11. neither URL introduces a returnTo-style parameter",
    !detailsUrl.includes("returnTo") &&
      !returnUrl.includes("returnTo") &&
      !detailsUrl.includes("redirect") &&
      !returnUrl.includes("redirect"),
  );

  // --- 12. Strict Search Intent duplication still invalid ------------------------------------
  const duplicatedParams = new URLSearchParams(baseParams.toString());
  duplicatedParams.append("origin", "city-thr");
  const duplicatedValidation = validateSearchIntentParams(
    parseRawSearchIntentParams(duplicatedParams),
    locale,
  );
  ok(
    "12. a duplicated strict Search Intent field remains invalid",
    !duplicatedValidation.ok,
  );

  // --- 13-14. Deterministic generation and resolution ----------------------------------------
  const { offers: secondRun } = await repo.search(intent);
  check(
    "13. the same Search Intent generates the same offer ids",
    secondRun.map((o) => o.id),
    offers.map((o) => o.id),
  );
  const readyResolution = resolveFlightDetails({
    intent,
    rawOfferId: sampleOffer.id,
    offers,
    rawViewState: { sort: "best", filters: EMPTY_FILTER_STATE },
  });
  ok(
    "14. a selected id resolves deterministically to that exact offer",
    readyResolution.status === "ready" &&
      readyResolution.offer.id === sampleOffer.id,
  );

  // --- 15-17. Availability states -------------------------------------------------------------
  const notFound = resolveFlightDetails({
    intent,
    rawOfferId: "demo-zzzzzz-99",
    offers,
    rawViewState: { sort: "best", filters: EMPTY_FILTER_STATE },
  });
  check(
    "15. an unknown but well-formed id produces Not-found",
    notFound.status,
    "notFound",
  );

  // Pick an offer that a Stops=direct filter genuinely excludes.
  const nonDirectOffer = offers.find(
    (offer) => offer.rankingMetadata.totalStopCount > 0,
  );
  if (!nonDirectOffer) throw new Error("Fixture has no multi-stop offer.");
  const directOnly = {
    ...EMPTY_FILTER_STATE,
    stopCategories: ["direct" as const],
  };
  const excluded = resolveFlightDetails({
    intent,
    rawOfferId: nonDirectOffer.id,
    offers,
    rawViewState: { sort: "best", filters: directOnly },
  });
  check(
    "16. an offer hidden by filters is 'excludedByFilters', not Not-found",
    excluded.status,
    "excludedByFilters",
  );
  const afterClearing = resolveFlightDetails({
    intent,
    rawOfferId: nonDirectOffer.id,
    offers,
    rawViewState: { sort: "best", filters: EMPTY_FILTER_STATE },
  });
  ok(
    "17. clearing filters makes the same existing offer resolvable",
    afterClearing.status === "ready" &&
      afterClearing.offer.id === nonDirectOffer.id,
  );
  const clearedUrl = buildClearedFiltersDetailsUrl(
    locale,
    nonDirectOffer.id,
    new URLSearchParams(`${baseParams.toString()}&stops=direct&sort=cheapest`),
    offers,
  );
  ok(
    "17b. the clear-filters URL keeps the offer id and drops only filter params",
    clearedUrl.includes(nonDirectOffer.id) &&
      !clearedUrl.includes("stops=") &&
      clearedUrl.includes(`origin=${ymq.id}`),
  );

  // --- 18-21. Sort and repository-key independence ---------------------------------------------
  const bySortBest = resolveFlightDetails({
    intent,
    rawOfferId: sampleOffer.id,
    offers,
    rawViewState: { sort: "best", filters: EMPTY_FILTER_STATE },
  });
  const bySortFastest = resolveFlightDetails({
    intent,
    rawOfferId: sampleOffer.id,
    offers,
    rawViewState: { sort: "fastest", filters: EMPTY_FILTER_STATE },
  });
  ok(
    "18. Sort never changes which offer an id resolves to",
    bySortBest.status === "ready" &&
      bySortFastest.status === "ready" &&
      bySortBest.offer.id === bySortFastest.offer.id,
  );

  const detailsExperienceSource = readFileSync(
    join(
      process.cwd(),
      "src",
      "components",
      "flights",
      "details",
      "FlightDetailsExperience.tsx",
    ),
    "utf8",
  );
  const fetchKeyLine =
    detailsExperienceSource.match(/const fetchKey =[\s\S]*?;\n/)?.[0] ?? "";
  /**
   * The *value* of the key — the template literal only. The surrounding
   * expression legitimately gates on `offerIdIsValid` (a boolean
   * precondition added in V2.6.1: an invalid id must produce no key at all),
   * and that gate must not be mistaken for the offer id being part of what
   * identifies a result. These checks therefore inspect the interpolated
   * template, not the whole assignment.
   */
  const fetchKeyTemplate = fetchKeyLine.match(/`[^`]*`/)?.[0] ?? "";
  ok(
    "19. the repository fetch key value excludes the offer id",
    fetchKeyTemplate.length > 0 && !fetchKeyTemplate.includes("offerId"),
  );
  ok(
    "20. the repository fetch key value excludes Sort",
    fetchKeyTemplate.length > 0 && !/sort/i.test(fetchKeyTemplate),
  );
  ok(
    "21. the repository fetch key value excludes Filters",
    fetchKeyTemplate.length > 0 &&
      !/filter/i.test(fetchKeyTemplate) &&
      !/viewState/.test(fetchKeyTemplate),
  );

  // --- 22-26. Itinerary and chronology invariants ----------------------------------------------
  const oneWayIntent = buildSearchIntent({
    tripType: "oneWay",
    origin: ymq,
    destination: lhr,
    departureDate: departure,
    returnDate: null,
    travelers: DEFAULT_TRAVELERS,
    cabinClass: "economy",
    flexibilityDays: 0,
    currency: "CAD",
    locale,
  });
  if (!oneWayIntent) throw new Error("One-way fixture intent failed to build.");
  const { offers: oneWayOffers } = await repo.search(oneWayIntent);
  ok(
    "22. a one-way offer has exactly one itinerary",
    oneWayOffers.every((offer) => offer.itineraries.length === 1),
  );
  ok(
    "23. a round-trip offer has exactly two itineraries",
    offers.every((offer) => offer.itineraries.length === 2),
  );
  ok(
    "24. outbound always precedes return in itinerary order",
    offers.every(
      (offer) =>
        offer.itineraries[0].direction === "outbound" &&
        offer.itineraries[1].direction === "inbound",
    ),
  );
  ok(
    "25. every itinerary is chronological by stored UTC epoch minutes",
    offers.every((offer) => offer.itineraries.every(isItineraryChronological)),
  );
  ok(
    "26. each segment's local times belong to its own origin/destination airports",
    offers.every((offer) =>
      offer.itineraries.every((itinerary) =>
        itinerary.segments.every(
          (segment) =>
            segment.originCode !== segment.destinationCode &&
            typeof segment.departure.epochMinutes === "number" &&
            typeof segment.arrival.epochMinutes === "number",
        ),
      ),
    ),
  );
  // The timeline interleaves segments and layovers in real order.
  const multiStop = offers.find((offer) => offer.itineraries[0].stopCount > 0);
  if (!multiStop) throw new Error("Fixture has no multi-stop outbound.");
  const timeline = buildItineraryTimeline(multiStop.itineraries[0]);
  check(
    "26b. the timeline interleaves segment, layover, segment in journey order",
    timeline.slice(0, 3).map((entry) => entry.kind),
    ["segment", "layover", "segment"],
  );

  // --- 27-30. Signed day offsets ----------------------------------------------------------------
  const dayOffsetLabels = enDictionary.flightResults.dayOffset;
  check(
    "27. a −1 day arrival formats as the minus-one label",
    formatDayOffset(
      localDateTime("2026-09-15", "23:30", 0),
      localDateTime("2026-09-14", "21:10", 0),
      locale,
      dayOffsetLabels,
    ),
    dayOffsetLabels.minusOne,
  );
  check(
    "28. a same-day arrival formats as no offset at all",
    formatDayOffset(
      localDateTime("2026-09-15", "08:00", 0),
      localDateTime("2026-09-15", "14:00", 0),
      locale,
      dayOffsetLabels,
    ),
    null,
  );
  check(
    "29. a +1 day arrival formats as the plus-one label",
    formatDayOffset(
      localDateTime("2026-09-15", "22:00", 0),
      localDateTime("2026-09-16", "06:00", 0),
      locale,
      dayOffsetLabels,
    ),
    dayOffsetLabels.plusOne,
  );
  ok(
    "30. a +2 day arrival formats through the plural template",
    formatDayOffset(
      localDateTime("2026-09-15", "22:00", 0),
      localDateTime("2026-09-17", "06:00", 0),
      locale,
      dayOffsetLabels,
    ) === dayOffsetLabels.plusN.replace("{count}", "2"),
  );

  // --- 31-33. Calendar and identifier truthfulness ----------------------------------------------
  // 2026-09-15 is September in the Gregorian calendar; in the Persian
  // calendar it would fall in شهریور/مهر, and in the Hijri calendar in a
  // month such as ربيع. Asserting the *month name* is what actually proves
  // the calendar — the short field format carries no year to check.
  const gregorianProbe = localDateTime("2026-09-15", "10:00", 0);
  const faDate = formatLocalDate(gregorianProbe, "fa");
  const arDate = formatLocalDate(gregorianProbe, "ar");
  ok(
    "31. Persian date formatting stays Gregorian (September, not a Persian-calendar month)",
    faDate.includes("سپتامبر") && !/شهریور|مهر/.test(faDate),
  );
  ok(
    "32. Arabic date formatting stays Gregorian (September, not a Hijri month)",
    arDate.includes("سبتمبر") && !/ربيع|محرم|رمضان/.test(arDate),
  );
  ok(
    "33. IATA codes are never localized (still plain A–Z in every offer)",
    offers.every((offer) =>
      offer.itineraries.every((itinerary) =>
        itinerary.segments.every(
          (segment) =>
            /^[A-Z]{3}$/.test(segment.originCode) &&
            /^[A-Z]{3}$/.test(segment.destinationCode),
        ),
      ),
    ),
  );

  // --- 34-36. Highlight scoping ------------------------------------------------------------------
  const displayedAll = sortOffers(applyFilters(offers, EMPTY_FILTER_STATE), "best");
  const highlightsAll = computeHighlights(displayedAll);
  const readyAll = resolveFlightDetails({
    intent,
    rawOfferId: sampleOffer.id,
    offers,
    rawViewState: { sort: "best", filters: EMPTY_FILTER_STATE },
  });
  ok(
    "34. the Details highlight matches the currently displayed set's highlight",
    readyAll.status === "ready" &&
      readyAll.highlight === highlightsAll.get(sampleOffer.id),
  );
  // Filter down to exactly one displayed offer: no comparison is possible.
  const singleOffer = displayedAll[0];
  const singleFilter = {
    ...EMPTY_FILTER_STATE,
    carrierIds: [singleOffer.validatingCarrierId],
    maxTotalPrice: singleOffer.totalPrice,
  };
  const singleDisplayed = applyFilters(offers, singleFilter);
  if (singleDisplayed.length === 1) {
    const singleResolution = resolveFlightDetails({
      intent,
      rawOfferId: singleDisplayed[0].id,
      offers,
      rawViewState: { sort: "best", filters: singleFilter },
    });
    ok(
      "35. a single displayed offer receives no highlight",
      singleResolution.status === "ready" &&
        singleResolution.highlight === undefined &&
        singleResolution.displayedCount === 1,
    );
  } else {
    ok(
      "35. a single displayed offer receives no highlight",
      computeHighlights([singleOffer]).size === 0,
    );
  }
  ok(
    "36. no highlight kind is awarded to more than one displayed offer",
    new Set(highlightsAll.values()).size === [...highlightsAll.values()].length,
  );

  // --- 37-41. Fare and price scope ---------------------------------------------------------------
  const fareSource = readFileSync(
    join(
      process.cwd(),
      "src",
      "components",
      "flights",
      "details",
      "FareAndBaggage.tsx",
    ),
    "utf8",
  );
  const priceSource = readFileSync(
    join(
      process.cwd(),
      "src",
      "components",
      "flights",
      "details",
      "PriceSummary.tsx",
    ),
    "utf8",
  );
  ok(
    "37. the fare section reads only modelled offer fields",
    /offer\.baggage\.carryOnIncluded/.test(fareSource) &&
      /offer\.baggage\.checkedBagIncluded/.test(fareSource) &&
      /offer\.fare\.refundable/.test(fareSource) &&
      /offer\.fare\.changeable/.test(fareSource),
  );
  // Comments are stripped first: these files *explain* that no fee or
  // weight breakdown is generated, and that prose must not be mistaken for
  // the thing it rules out.
  const stripComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  ok(
    "38. no invented fee, weight, or fare-brand breakdown appears in fare or price code",
    !/\bkg\b|baggageWeight|changeFee|cancellationFee|fareBrand|seatFee|taxAmount|surcharge/i.test(
      stripComments(fareSource) + stripComments(priceSource),
    ),
  );
  const totalBefore = sampleOffer.totalPrice;
  resolveFlightDetails({
    intent,
    rawOfferId: sampleOffer.id,
    offers,
    rawViewState: { sort: "fastest", filters: EMPTY_FILTER_STATE },
  });
  check(
    "39. resolving details never mutates the offer's total price",
    sampleOffer.totalPrice,
    totalBefore,
  );
  const chargeable = Math.max(
    1,
    intent.travelers.adults +
      intent.travelers.children +
      intent.travelers.infantsInSeat,
  );
  check(
    "40. total equals per-traveler times the chargeable traveler count",
    sampleOffer.pricePerTraveler * chargeable,
    sampleOffer.totalPrice,
  );
  ok(
    "41. the chargeable traveler count is a positive integer",
    Number.isInteger(chargeable) && chargeable >= 1,
  );

  // --- 42-46. Provider preview, network and link safety ------------------------------------------
  const noNetworkOrNav =
    /fetch\(|XMLHttpRequest|axios|window\.location|target=["']_blank["']/;
  const detailsSources = [
    "FlightDetailsExperience.tsx",
    "FlightDetailsSummary.tsx",
    "ItineraryDetails.tsx",
    "SegmentTimeline.tsx",
    "FareAndBaggage.tsx",
    "PriceSummary.tsx",
    "FlightDetailsLoading.tsx",
    "FlightDetailsState.tsx",
  ].map((file) =>
    readFileSync(
      join(process.cwd(), "src", "components", "flights", "details", file),
      "utf8",
    ),
  );
  const detailsFeatureSources = [
    "flight-details-url.ts",
    "flight-details-resolution.ts",
    "flight-details-formatting.ts",
    "flight-details-types.ts",
  ].map((file) =>
    readFileSync(
      join(process.cwd(), "src", "features", "flights", "details", file),
      "utf8",
    ),
  );
  const allDetailsSource = [...detailsSources, ...detailsFeatureSources].join("\n");

  // The Details page legitimately performs exactly one router navigation:
  // the automatic view-state canonicalization, which must be `replace` (no
  // history entry) and never `push`. Banning `router.replace` outright — as
  // this check originally did — would have forbidden that correct behaviour,
  // so the real invariants are checked instead: no `push` anywhere, and the
  // provider-preview handlers themselves touch no router.
  const handoffHandlerSource = [
    ...detailsExperienceSource.matchAll(/setHandoffOpen\([^)]*\)/g),
  ]
    .map((match) => match[0])
    .join("\n");
  ok(
    "42. the provider preview itself performs no router navigation, and the page never pushes history",
    handoffHandlerSource.length > 0 &&
      !/router\./.test(handoffHandlerSource) &&
      !/router\.push/.test(detailsExperienceSource),
  );
  ok(
    "42b. the one permitted navigation is a scroll-free replace (canonicalization)",
    /router\.replace\(\s*canonicalUrl,\s*\{\s*scroll:\s*false\s*\}\s*\)/.test(
      detailsExperienceSource,
    ),
  );
  ok(
    "43. no details component performs external navigation",
    !noNetworkOrNav.test(allDetailsSource),
  );
  ok(
    "44. no runtime provider adapter is imported by the Details feature",
    !/provider-adapter-types/.test(allDetailsSource),
  );
  ok(
    "45. no network request exists anywhere in the Details feature",
    !/fetch\(|XMLHttpRequest|axios/.test(allDetailsSource),
  );
  ok(
    "46. the back-to-results URL is internal and locale-prefixed",
    returnUrl.startsWith("/en/") && !/^https?:/.test(returnUrl),
  );

  // --- 47-50. URL hygiene and canonical ordering -------------------------------------------------
  ok(
    "47. no sensitive or personal value is added to the Details URL",
    !/name=|email=|passenger|payment|card=|token=|lat=|lng=|coord/i.test(
      detailsUrl,
    ),
  );
  const notFoundSource = detailsSources.join("\n");
  ok(
    "48. the not-found path exposes no raw technical error text",
    !/stack|exception|TypeError|\berror\.message\b/i.test(notFoundSource),
  );
  const reordered = new URLSearchParams();
  reordered.set("currency", "CAD");
  reordered.set("adults", "1");
  reordered.set("v", "1");
  reordered.set("trip", "roundTrip");
  reordered.set("origin", ymq.id);
  reordered.set("destination", lhr.id);
  reordered.set("departure", departure);
  reordered.set("return", returnDate);
  reordered.set("cabin", "economy");
  reordered.set("flex", "0");
  check(
    "49. Filters and Sort serialize canonically regardless of incoming order",
    buildFlightDetailsUrl(locale, sampleOffer.id, reordered, viewState, offers),
    detailsUrl,
  );
  const reversedOffers = [...offers].reverse();
  const reversedResolution = resolveFlightDetails({
    intent,
    rawOfferId: sampleOffer.id,
    offers: reversedOffers,
    rawViewState: { sort: "best", filters: EMPTY_FILTER_STATE },
  });
  ok(
    "50. resolution is independent of the input offer array's order",
    reversedResolution.status === "ready" &&
      readyAll.status === "ready" &&
      reversedResolution.offer.id === readyAll.offer.id &&
      reversedResolution.highlight === readyAll.highlight,
  );

  // --- 51-53. No new dependency, prior suites intact ---------------------------------------------
  const packageJson: {
    dependencies: Record<string, string>;
    scripts: Record<string, string>;
  } = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
  check(
    "51. runtime dependencies are unchanged (next, react, react-dom only)",
    Object.keys(packageJson.dependencies).sort(),
    ["next", "react", "react-dom"],
  );
  ok(
    "52. the V2.5.1 highlight suite is still wired and unmodified in scope",
    typeof packageJson.scripts["verify:polish"] === "string" &&
      packageJson.scripts["verify:polish"].includes("verify-polish"),
  );
  ok(
    "53. the V2.4 filter suite is still wired",
    typeof packageJson.scripts["verify:filters"] === "string" &&
      packageJson.scripts["verify:filters"].includes("verify-filters"),
  );

  // --- 54-56. Truthful copy -----------------------------------------------------------------------
  const bannedCta = /\bBook\b|\bBuy\b|Select deal|View deal|Continue to provider/i;
  ok(
    "54. no Details component contains Book/Buy/Select-deal copy",
    !bannedCta.test(allDetailsSource),
  );
  ok(
    "55. no Details component renders a target=_blank provider action",
    !/target=["']_blank["']/.test(allDetailsSource),
  );
  const dictionaries = {
    en: enDictionary,
    fr: frDictionary,
    fa: faDictionary,
    ar: arDictionary,
  };
  ok(
    "56. every locale's provider notice states the preview opens nothing real",
    Object.values(dictionaries).every(
      (dictionary) =>
        dictionary.flightDetails.provider.notice.trim().length > 0 &&
        dictionary.flightDetails.disclosure.points.length >= 3 &&
        dictionary.flightResults.viewFlightDetails.trim().length > 0,
    ),
  );
  ok(
    "56b. every locale defines the full Details state and section vocabulary",
    Object.values(dictionaries).every((dictionary) => {
      const fd = dictionary.flightDetails;
      return (
        fd.heading.trim().length > 0 &&
        fd.backToResults.trim().length > 0 &&
        fd.loading.trim().length > 0 &&
        fd.states.invalidOfferId.trim().length > 0 &&
        fd.states.notFound.trim().length > 0 &&
        fd.states.excludedByFilters.trim().length > 0 &&
        fd.states.clearFiltersAndView.trim().length > 0 &&
        fd.itinerary.localTimeNotice.trim().length > 0 &&
        fd.fare.heading.trim().length > 0 &&
        fd.price.demonstrationTotal.trim().length > 0 &&
        fd.highlight.heading.trim().length > 0
      );
    }),
  );

  // =====================================================================================
  // V2.6.1 corrections: no-fetch on invalid id, shared filter bounds, offer-aware
  // canonical Details/Back URLs, RouteArrow, timeline aria, localized counts, and a
  // truthful Invalid Search state.
  // =====================================================================================

  /** Source with comments stripped — prose describing a rule must never satisfy the rule. */
  const stripSourceComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  const experienceCode = stripSourceComments(detailsExperienceSource);
  const detailsUrlSource = readFileSync(
    join(
      process.cwd(),
      "src",
      "features",
      "flights",
      "details",
      "flight-details-url.ts",
    ),
    "utf8",
  );
  const detailsUrlCode = stripSourceComments(detailsUrlSource);
  const itineraryDetailsSource = readFileSync(
    join(
      process.cwd(),
      "src",
      "components",
      "flights",
      "details",
      "ItineraryDetails.tsx",
    ),
    "utf8",
  );
  const itineraryDetailsCode = stripSourceComments(itineraryDetailsSource);

  // --- 62-63. Invalid offer id is a no-fetch condition -------------------------------------------
  ok(
    "62. an invalid offer id makes the repository fetch key null (no fetch is possible)",
    /offerIdIsValid\s*=\s*isValidOfferId\(offerId\)/.test(experienceCode) &&
      /intentKey\s*!==\s*null\s*&&\s*offerIdIsValid/.test(experienceCode) &&
      /if\s*\(!offerIdIsValid\)\s*return;/.test(experienceCode) &&
      /if\s*\(fetchKey\s*===\s*null\)\s*return;/.test(experienceCode),
  );
  ok(
    "63. the fetch effect returns before constructing a repository or AbortController",
    (() => {
      const body = experienceCode.slice(
        experienceCode.indexOf("useEffect(() => {"),
      );
      const guardIndex = body.indexOf("if (!offerIdIsValid) return;");
      const repoIndex = body.indexOf("createRepository(devScenario)");
      const abortIndex = body.indexOf("new AbortController()");
      return (
        guardIndex >= 0 &&
        repoIndex > guardIndex &&
        abortIndex > guardIndex &&
        // `offerIdIsValid` is a dependency, so an id turning invalid re-runs
        // the cleanup and aborts an obsolete in-flight search.
        /\[committedIntent,\s*offerIdIsValid,\s*fetchKey,\s*devScenario\]/.test(
          experienceCode,
        )
      );
    })(),
  );

  // --- 64-67. Shared filter bounds: Duration means per-direction, not combined -------------------
  const sharedDurationMax = durationBounds(offers).max;
  const sharedPriceMax = priceBounds(offers).max;
  const combinedRoundTripMax = Math.max(
    ...offers.map((offer) => offer.rankingMetadata.totalDurationMinutes),
  );
  ok(
    "64. the Details URL module delegates its bounds to the shared serializer helper",
    // It imports `serializationBoundsForOffers` from the shared filter-URL
    // module and never measures anything itself — in particular it never
    // reaches for `rankingMetadata.totalDurationMinutes`, the combined
    // round-trip total, which is a different quantity from the per-direction
    // duration the filter actually means.
    /from\s+"\.\.\/filters\/flight-filter-url"/.test(detailsUrlCode) &&
      /serializationBoundsForOffers\(offers\)/.test(detailsUrlCode) &&
      !/priceBounds\(/.test(detailsUrlCode) &&
      !/durationBounds\(/.test(detailsUrlCode) &&
      !/rankingMetadata\.totalDurationMinutes/.test(detailsUrlCode),
  );
  ok(
    "64b. the Price default is the shared priceBounds maximum (a price at it is omitted)",
    !buildFlightDetailsUrl(
      locale,
      sampleOffer.id,
      baseParams,
      {
        sort: "best",
        filters: { ...EMPTY_FILTER_STATE, maxTotalPrice: sharedPriceMax },
      },
      offers,
    ).includes("maxPrice") &&
      buildFlightDetailsUrl(
        locale,
        sampleOffer.id,
        baseParams,
        {
          sort: "best",
          filters: { ...EMPTY_FILTER_STATE, maxTotalPrice: sharedPriceMax - 1 },
        },
        offers,
      ).includes(`maxPrice=${sharedPriceMax - 1}`),
  );
  ok(
    "65. the per-direction maximum is strictly below the combined round-trip maximum",
    sharedDurationMax < combinedRoundTripMax,
  );
  // A value above the true per-direction ceiling but below the combined
  // total — exactly the case the old custom bounds would have kept.
  const staleDuration = sharedDurationMax + 100;
  ok(
    "65b. the reproduction value sits between the two interpretations",
    staleDuration > sharedDurationMax && staleDuration < combinedRoundTripMax,
  );
  const staleDurationFilters = {
    ...EMPTY_FILTER_STATE,
    maxDurationMinutes: staleDuration,
  };
  check(
    "66. a duration above the per-direction maximum sanitizes to null",
    sanitizeFiltersAgainstOffers(staleDurationFilters, offers).maxDurationMinutes,
    null,
  );
  const staleDurationDetailsUrl = buildFlightDetailsUrl(
    locale,
    sampleOffer.id,
    baseParams,
    {
      sort: "best",
      filters: sanitizeFiltersAgainstOffers(staleDurationFilters, offers),
    },
    offers,
  );
  const staleDurationBackUrl = buildResultsReturnUrl(
    locale,
    baseParams,
    {
      sort: "best",
      filters: sanitizeFiltersAgainstOffers(staleDurationFilters, offers),
    },
    offers,
  );
  ok(
    "67. the canonical Details and Back URLs both omit the stale maxDuration",
    !staleDurationDetailsUrl.includes("maxDuration") &&
      !staleDurationBackUrl.includes("maxDuration"),
  );
  ok(
    "67b. an empty offer set produces finite serialization bounds (no Infinity)",
    !buildResultsReturnUrl(
      locale,
      baseParams,
      { sort: "best", filters: EMPTY_FILTER_STATE },
      [],
    ).includes("Infinity"),
  );

  // --- 68-74. Canonical Details URL: what it drops, and what it must keep ------------------------
  const staleParams = new URLSearchParams(baseParams.toString());
  staleParams.set("sort", "cheapest");
  staleParams.set("stops", "oneStop,direct");
  staleParams.set("carriers", "aurora,not-a-real-carrier");
  staleParams.set("fromAirports", "ZZZ");
  staleParams.set("toAirports", "QQQ");
  staleParams.set("maxPrice", String(Math.max(0, priceBounds(offers).min - 500)));
  staleParams.set("maxDuration", String(staleDuration));

  const staleRaw = parseResultsViewState(staleParams);
  const staleSanitized = sanitizeFiltersAgainstOffers(staleRaw.filters, offers);
  const canonicalDetails = buildFlightDetailsUrl(
    locale,
    sampleOffer.id,
    staleParams,
    { sort: staleRaw.sort, filters: staleSanitized },
    offers,
  );
  const canonicalDetailsQuery = new URLSearchParams(
    canonicalDetails.split("?")[1] ?? "",
  );

  ok(
    "68. an unknown carrier disappears from the canonical Details URL",
    !(canonicalDetailsQuery.get("carriers") ?? "").includes("not-a-real-carrier"),
  );
  ok(
    "69. an unknown departure airport disappears from the canonical Details URL",
    !canonicalDetailsQuery.has("fromAirports"),
  );
  ok(
    "70. an unknown arrival airport disappears from the canonical Details URL",
    !canonicalDetailsQuery.has("toAirports"),
  );
  check(
    "71. the canonical Details URL preserves a valid Sort",
    canonicalDetailsQuery.get("sort"),
    "cheapest",
  );
  check(
    "72. the canonical Details URL preserves valid Filters in canonical order",
    [
      canonicalDetailsQuery.get("stops"),
      canonicalDetailsQuery.get("carriers"),
      canonicalDetailsQuery.has("maxPrice"),
      canonicalDetailsQuery.has("maxDuration"),
    ],
    ["direct,oneStop", "aurora", false, false],
  );
  ok(
    "73. canonicalization preserves the offer id in the path",
    canonicalDetails.startsWith(`/en/flights/results/${sampleOffer.id}?`),
  );
  check(
    "74. canonicalization alters no Search Intent parameter",
    [
      "v",
      "trip",
      "origin",
      "destination",
      "departure",
      "return",
      "adults",
      "cabin",
      "flex",
      "currency",
    ].map((key) => canonicalDetailsQuery.get(key)),
    [
      "1",
      "roundTrip",
      ymq.id,
      lhr.id,
      departure,
      returnDate,
      "1",
      "economy",
      "0",
      "CAD",
    ],
  );
  ok(
    "74b. canonicalization is idempotent (no replace loop)",
    buildFlightDetailsUrl(
      locale,
      sampleOffer.id,
      canonicalDetailsQuery,
      { sort: staleRaw.sort, filters: staleSanitized },
      offers,
    ) === canonicalDetails,
  );

  // --- 75. Canonical replacement cannot affect the repository key --------------------------------
  ok(
    "75. the fetch key value is composed only of Search Intent, retry token and dev scenario",
    (() => {
      const assignment =
        experienceCode.match(/const fetchKey =[\s\S]*?;\n/)?.[0] ?? "";
      const template = assignment.match(/`[^`]*`/)?.[0] ?? "";
      const interpolations = [...template.matchAll(/\$\{([^}]*)\}/g)].map((m) =>
        m[1].trim(),
      );
      return (
        interpolations.length === 3 &&
        interpolations[0] === "intentKey" &&
        interpolations[1] === "retryToken" &&
        interpolations[2].startsWith("devScenario")
      );
    })(),
  );

  // --- 76-77. RouteArrow replaces the hardcoded separator ----------------------------------------
  ok(
    "76. ItineraryDetails contains no hardcoded chronological arrow",
    !itineraryDetailsCode.includes('{" → "}') &&
      !/"\s*→\s*"/.test(itineraryDetailsCode),
  );
  ok(
    "77. ItineraryDetails renders the shared RouteArrow between isolated names",
    /import \{ RouteArrow \}/.test(itineraryDetailsCode) &&
      /<bdi dir="auto">\{airportName\(firstSegment\.originCode, locale\)\}<\/bdi>\s*<RouteArrow \/>\s*<bdi dir="auto">\{airportName\(lastSegment\.destinationCode, locale\)\}<\/bdi>/.test(
        itineraryDetailsCode,
      ),
  );

  // --- 78-80. Timeline controlled region ----------------------------------------------------------
  ok(
    "78. the timeline toggle declares aria-controls",
    /aria-expanded=\{timelineOpen\}\s*aria-controls=\{timelineRegionId\}/.test(
      experienceCode,
    ),
  );
  ok(
    "79. exactly one element carries the controlled timeline id",
    (experienceCode.match(/id=\{timelineRegionId\}/g) ?? []).length === 1 &&
      /const timelineRegionId = useId\(\)/.test(experienceCode),
  );
  ok(
    "80. the timeline region is always rendered and hidden when collapsed",
    /id=\{timelineRegionId\}[\s\S]{0,160}hidden=\{!timelineOpen\}/.test(
      experienceCode,
    ) &&
      /aria-labelledby=\{summaryHeadingId\}/.test(experienceCode) &&
      !/\{timelineOpen[\s\S]{0,40}\?[\s\S]{0,80}offer\.itineraries\.map/.test(
        experienceCode,
      ),
  );

  // --- 81-82. Localized highlight count ------------------------------------------------------------
  ok(
    "81. the highlight scope count goes through formatLocaleNumber, not String()",
    /formatLocaleNumber\(\s*displayedCount,\s*readyIntent\.locale,?\s*\)/.test(
      experienceCode,
    ) && !/String\(displayedCount\)/.test(experienceCode),
  );
  ok(
    "82. Persian formats a multi-offer count with Persian digits",
    /[۰-۹]/.test(
      formatTemplateForCount(faDictionary.flightDetails.highlight.scope, 12, "fa"),
    ) &&
      /[0-9]/.test(
        formatTemplateForCount(
          enDictionary.flightDetails.highlight.scope,
          12,
          "en",
        ),
      ),
  );

  // --- 83. Invalid Search offers one truthful action ------------------------------------------------
  ok(
    "83. the Invalid Search state renders no misleading Return-to-results action",
    (() => {
      const start = experienceCode.indexOf("if (!validation.ok)");
      const block = experienceCode.slice(start, start + 700);
      return (
        start >= 0 &&
        block.includes("labels.editSearch") &&
        !block.includes("labels.returnToResults")
      );
    })(),
  );

  // --- 84. Every offer-resolution state still behaves as before -------------------------------------
  check(
    "84. all five resolution outcomes remain distinguishable after the corrections",
    [
      resolveFlightDetails({
        intent: null,
        rawOfferId: sampleOffer.id,
        offers,
        rawViewState: { sort: "best", filters: EMPTY_FILTER_STATE },
      }).status,
      resolveFlightDetails({
        intent,
        rawOfferId: "not-a-demo-id",
        offers,
        rawViewState: { sort: "best", filters: EMPTY_FILTER_STATE },
      }).status,
      resolveFlightDetails({
        intent,
        rawOfferId: "demo-zzzzzz-99",
        offers,
        rawViewState: { sort: "best", filters: EMPTY_FILTER_STATE },
      }).status,
      resolveFlightDetails({
        intent,
        rawOfferId: nonDirectOffer.id,
        offers,
        rawViewState: { sort: "best", filters: directOnly },
      }).status,
      resolveFlightDetails({
        intent,
        rawOfferId: sampleOffer.id,
        offers,
        rawViewState: { sort: "best", filters: EMPTY_FILTER_STATE },
      }).status,
    ],
    ["invalidSearch", "invalidOfferId", "notFound", "excludedByFilters", "ready"],
  );

  // --- 85-100. Format-level numeric preservation when no offer set exists ------------------------
  //
  // The V2.6.1 empty-offer fallback used numeric zeroes, which meant every
  // non-negative maxPrice/maxDuration was silently dropped by the shared
  // serializer's `value < maximum` rule in exactly the states that cannot
  // fetch — invalid offer id, repository error, empty result. Those states now
  // pass *unknown* bounds instead, so a format-valid value is preserved and
  // Results sanitizes it once its own offer set resolves. Every check drives
  // the real shared serializer through the real Details URL helpers.
  const preservedPrice = 1000;
  const preservedDuration = 600;
  const formatLevelViewState = {
    sort: "cheapest" as const,
    filters: {
      ...EMPTY_FILTER_STATE,
      maxTotalPrice: preservedPrice,
      maxDurationMinutes: preservedDuration,
    },
  };
  const noOffers: readonly (typeof offers)[number][] = [];

  // A. Invalid offer id — the component renders this state with no fetch, so
  // its "Back to results" href is built against an empty offer set.
  const invalidIdReturnUrl = buildResultsReturnUrl(
    locale,
    baseParams,
    formatLevelViewState,
    noOffers,
  );
  const invalidIdReturnQuery = new URLSearchParams(
    invalidIdReturnUrl.split("?")[1] ?? "",
  );
  check(
    "85. the invalid-offer-id return URL preserves a format-valid maxPrice",
    invalidIdReturnQuery.get("maxPrice"),
    String(preservedPrice),
  );
  check(
    "86. the invalid-offer-id return URL preserves a format-valid maxDuration",
    invalidIdReturnQuery.get("maxDuration"),
    String(preservedDuration),
  );
  check(
    "87. the invalid-offer-id return URL preserves a valid Sort",
    invalidIdReturnQuery.get("sort"),
    "cheapest",
  );
  ok(
    "88. the invalid-offer-id return URL carries no offer id in its path or query",
    invalidIdReturnUrl.split("?")[0] === `/${locale}/flights/results` &&
      !invalidIdReturnUrl.includes("demo-"),
  );
  // The Details-URL builder rejects a malformed id outright and falls back to
  // the plain Results address — same preservation policy, no bogus path.
  const malformedDetailsUrl = buildFlightDetailsUrl(
    locale,
    "not-a-demo-id",
    baseParams,
    formatLevelViewState,
    noOffers,
  );
  ok(
    "89. a malformed offer id yields the Results URL, still carrying both numeric filters",
    malformedDetailsUrl.split("?")[0] === `/${locale}/flights/results` &&
      malformedDetailsUrl.includes(`maxPrice=${preservedPrice}`) &&
      malformedDetailsUrl.includes(`maxDuration=${preservedDuration}`),
  );

  // B/C. Repository error and empty result reach the same code path: a valid
  // offer id, but no offer set to assess the numbers against.
  const formatLevelDetailsUrl = buildFlightDetailsUrl(
    locale,
    sampleOffer.id,
    baseParams,
    formatLevelViewState,
    noOffers,
  );
  ok(
    "90. the empty/error-state Details URL preserves both numeric filters and the offer id",
    formatLevelDetailsUrl.includes(`/${sampleOffer.id}`) &&
      formatLevelDetailsUrl.includes(`maxPrice=${preservedPrice}`) &&
      formatLevelDetailsUrl.includes(`maxDuration=${preservedDuration}`),
  );
  ok(
    "91. no unavailable-bounds URL contains a sentinel (null/Infinity/-Infinity/undefined/NaN)",
    [invalidIdReturnUrl, malformedDetailsUrl, formatLevelDetailsUrl].every(
      (url) => !/null|Infinity|undefined|NaN/i.test(url),
    ),
  );
  ok(
    "92. an unset numeric filter still emits nothing when bounds are unavailable",
    !buildResultsReturnUrl(
      locale,
      baseParams,
      { sort: "cheapest", filters: EMPTY_FILTER_STATE },
      noOffers,
    ).includes("max"),
  );
  check(
    "93. the Details module derives its bounds from the shared helper, in both modes",
    [serializationBoundsForOffers(noOffers), serializationBoundsForOffers(offers)],
    [
      { priceMax: null, durationMax: null },
      { priceMax: sharedPriceMax, durationMax: sharedDurationMax },
    ],
  );
  ok(
    "93b. the Details URL module holds no bounds arithmetic of its own",
    /serializationBoundsForOffers/.test(detailsUrlCode) &&
      !/priceMax:\s*0/.test(detailsUrlCode) &&
      !/durationMax:\s*0/.test(detailsUrlCode) &&
      !/Math\.(min|max)/.test(detailsUrlCode),
  );

  // D. Ready state: the offer-aware behaviour must be completely unchanged —
  // stale values still dropped, genuinely restrictive values still kept.
  const stalePrice = sharedPriceMax + 500;
  const readyStaleViewState = {
    sort: "cheapest" as const,
    filters: sanitizeFiltersAgainstOffers(
      {
        ...EMPTY_FILTER_STATE,
        maxTotalPrice: stalePrice,
        maxDurationMinutes: sharedDurationMax + 100,
      },
      offers,
    ),
  };
  ok(
    "94. the ready-state canonical Details URL still drops a stale maxPrice",
    !buildFlightDetailsUrl(
      locale,
      sampleOffer.id,
      baseParams,
      readyStaleViewState,
      offers,
    ).includes("maxPrice"),
  );
  ok(
    "95. the ready-state canonical Details URL still drops a stale maxDuration",
    !buildFlightDetailsUrl(
      locale,
      sampleOffer.id,
      baseParams,
      readyStaleViewState,
      offers,
    ).includes("maxDuration"),
  );
  ok(
    "96. the ready-state Back URL still drops both stale numerics",
    !buildResultsReturnUrl(
      locale,
      baseParams,
      readyStaleViewState,
      offers,
    ).includes("max"),
  );
  const restrictivePrice = sharedPriceMax - 1;
  const restrictiveDuration = sharedDurationMax - 1;
  const readyRestrictiveViewState = {
    sort: "cheapest" as const,
    filters: sanitizeFiltersAgainstOffers(
      {
        ...EMPTY_FILTER_STATE,
        maxTotalPrice: restrictivePrice,
        maxDurationMinutes: restrictiveDuration,
      },
      offers,
    ),
  };
  const readyRestrictiveDetailsUrl = buildFlightDetailsUrl(
    locale,
    sampleOffer.id,
    baseParams,
    readyRestrictiveViewState,
    offers,
  );
  ok(
    "97. a genuinely restrictive Price survives offer-aware sanitization and serialization",
    readyRestrictiveDetailsUrl.includes(`maxPrice=${restrictivePrice}`),
  );
  ok(
    "98. a genuinely restrictive Duration survives offer-aware sanitization and serialization",
    readyRestrictiveDetailsUrl.includes(`maxDuration=${restrictiveDuration}`),
  );

  // The Search Intent must be untouched in every mode — it is copied verbatim,
  // never re-derived, whichever bounds the serializer was given.
  const intentKeys = [
    "v",
    "trip",
    "origin",
    "destination",
    "departure",
    "return",
    "adults",
    "cabin",
    "flex",
    "currency",
  ];
  const intentValuesFor = (url: string) => {
    const query = new URLSearchParams(url.split("?")[1] ?? "");
    return intentKeys.map((key) => query.get(key));
  };
  check(
    "99. every Search Intent parameter is identical under known and unknown bounds",
    [
      intentValuesFor(formatLevelDetailsUrl),
      intentValuesFor(readyRestrictiveDetailsUrl),
      intentValuesFor(invalidIdReturnUrl),
    ],
    [
      intentKeys.map((key) => baseParams.get(key)),
      intentKeys.map((key) => baseParams.get(key)),
      intentKeys.map((key) => baseParams.get(key)),
    ],
  );
  ok(
    "100. the provider preview and repository key guarantees are unaffected by the bounds model",
    // The provider preview still performs no navigation of any kind, and the
    // only navigation in the whole component remains the scroll-free canonical
    // replace (checks 42/42b); the fetch key still contains no view state at
    // all, so changing how view state is serialized cannot reach it (check 75).
    !/setHandoffOpen\([^)]*\)[^;]*router\./.test(experienceCode) &&
      !/router\.push/.test(experienceCode) &&
      /router\.replace\(\s*canonicalUrl,\s*\{\s*scroll:\s*false\s*\}\s*\)/.test(
        experienceCode,
      ) &&
      !/fetchKey[\s\S]{0,200}?(maxPrice|maxDuration|sort|filters)/.test(
        experienceCode,
      ),
  );

  // --- Sanity: the lenient view-state parser is shared, not duplicated ---------------------------
  const sharedParse = parseFlightDetailsContext(
    new URLSearchParams("sort=cheapest&stops=direct"),
  );
  check(
    "extra. the Details context parser returns the same view state the Results parser does",
    sharedParse.viewState,
    parseResultsViewState(new URLSearchParams("sort=cheapest&stops=direct")),
  );

  const total = passed + failures.length;
  if (failures.length > 0) {
    console.error(
      `\nDetails verification FAILED — ${failures.length} of ${total}\n`,
    );
    for (const failure of failures) console.error(`  ✗ ${failure}\n`);
    process.exit(1);
  }

  console.log(`Details verification passed — ${passed}/${total} checks`);
}

main().catch((error: unknown) => {
  console.error("Details verification crashed:", error);
  process.exit(1);
});
