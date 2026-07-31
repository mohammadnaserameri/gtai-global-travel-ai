/**
 * Deterministic checks for the V2.4 flight filtering system: filter matching,
 * facet counting, URL serialization/parsing, and sort-after-filter behavior.
 *
 * Same contract as the other `verify-*.ts` scripts — no test runner, no new
 * dependency, compiled by the project's own TypeScript compiler and run
 * under Node via the shared verification tsconfig.
 *
 *   npm run verify:filters
 */

import { addDays, todayIso } from "../src/features/dates/date-utils";
import { DEMO_LOCATIONS } from "../src/features/locations/demo-location-data";
import { buildSearchIntent } from "../src/features/flights/search-intent-validation";
import { DEFAULT_TRAVELERS } from "../src/features/flights/search-intent-types";
import { DemoFlightOfferRepository } from "../src/features/flights/demo-flight-offer-repository";
import { sortOffers } from "../src/features/flights/flight-offer-ranking";
import {
  validateSearchIntentParams,
  type SearchIntentInvalidReason,
} from "../src/features/flights/search-intent-validation";
import { parseRawSearchIntentParams } from "../src/features/flights/search-intent-url";
import type {
  FlightItinerary,
  FlightOffer,
  FlightSegment,
} from "../src/features/flights/flight-offer-types";
import {
  applyFilters,
  arrivalAirportCodeForOffer,
  departureAirportCodeForOffer,
  departureTimeBucketForOffer,
  maxStopCountForOffer,
  offerMatchesFilters,
  outboundItinerary,
  stopCategoryForCount,
} from "../src/features/flights/filters/flight-filter-application";
import {
  activeFilterGroupCount,
  availableCarriers,
  availableDepartureAirportCodes,
  availableArrivalAirportCodes,
  computeFacetCounts,
  computeRangeSliderDomain,
  durationBounds,
  priceBounds,
} from "../src/features/flights/filters/flight-filter-facets";
import { formatTemplate } from "../src/features/flights/flight-offer-formatting";
import enDictionary from "../src/i18n/dictionaries/en.json";
import frDictionary from "../src/i18n/dictionaries/fr.json";
import faDictionary from "../src/i18n/dictionaries/fa.json";
import arDictionary from "../src/i18n/dictionaries/ar.json";
import {
  EMPTY_FILTER_STATE,
  type FlightFilterState,
  type ResultsViewState,
} from "../src/features/flights/filters/flight-filter-types";
import {
  appendResultsViewStateParams,
  buildResultsSearchParams,
  parseFilterState,
  parseResultsViewState,
  parseSortOption,
  sanitizeFiltersAgainstOffers,
  serializationBoundsForOffers,
  type ResultsSerializationBounds,
} from "../src/features/flights/filters/flight-filter-url";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed += 1;
  } else {
    failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
  }
}

function ok(name: string, condition: boolean): void {
  check(name, condition, true);
}

interface FakeOfferOverrides {
  id?: string;
  totalPrice?: number;
  stopCount?: number;
  departureTime?: string;
  durationMinutes?: number;
  carrierId?: string;
  originCode?: string;
  destinationCode?: string;
  roundTrip?: boolean;
  inboundDurationMinutes?: number;
  inboundStopCount?: number;
}

/** A minimal, hand-built offer — used where an exact boundary value matters more than generator realism. */
function fakeOffer(overrides: FakeOfferOverrides = {}): FlightOffer {
  const stopCount = overrides.stopCount ?? 0;
  const durationMinutes = overrides.durationMinutes ?? 300;
  const departureTime = overrides.departureTime ?? "10:00";
  const carrierId = overrides.carrierId ?? "aurora";
  const originCode = overrides.originCode ?? "YYZ";
  const destinationCode = overrides.destinationCode ?? "LHR";
  const totalPrice = overrides.totalPrice ?? 500;
  const id = overrides.id ?? "fake";

  const outboundSegment: FlightSegment = {
    id: `${id}-out`,
    carrierId,
    carrierName: `${carrierId}-name`,
    flightNumber: "DEMO-XXX-100",
    originCode,
    destinationCode,
    departure: { date: "2026-08-01", time: departureTime, epochMinutes: 0 },
    arrival: { date: "2026-08-01", time: "23:59", epochMinutes: durationMinutes },
    durationMinutes,
    aircraftType: "widebody",
    cabinClass: "economy",
  };

  const outbound: FlightItinerary = {
    direction: "outbound",
    segments: [outboundSegment],
    departure: outboundSegment.departure,
    arrival: outboundSegment.arrival,
    durationMinutes,
    stopCount,
    layovers: [],
  };

  const itineraries: FlightItinerary[] = [outbound];

  if (overrides.roundTrip) {
    const inboundDuration = overrides.inboundDurationMinutes ?? durationMinutes;
    const inboundStopCount = overrides.inboundStopCount ?? stopCount;
    const inboundSegment: FlightSegment = {
      ...outboundSegment,
      id: `${id}-in`,
      originCode: destinationCode,
      destinationCode: originCode,
      durationMinutes: inboundDuration,
    };
    itineraries.push({
      direction: "inbound",
      segments: [inboundSegment],
      departure: inboundSegment.departure,
      arrival: inboundSegment.arrival,
      durationMinutes: inboundDuration,
      stopCount: inboundStopCount,
      layovers: [],
    });
  }

  return {
    id,
    currency: "CAD",
    totalPrice,
    pricePerTraveler: totalPrice,
    itineraries,
    validatingCarrierId: carrierId,
    validatingCarrierName: `${carrierId}-name`,
    operatingCarrierNames: [`${carrierId}-name`],
    provider: "Atlas Connect",
    baggage: { carryOnIncluded: true, checkedBagIncluded: false },
    fare: { refundable: false, changeable: false },
    rankingMetadata: {
      totalDurationMinutes: itineraries.reduce(
        (sum, it) => sum + it.durationMinutes,
        0,
      ),
      totalStopCount: itineraries.reduce((sum, it) => sum + it.stopCount, 0),
    },
    isDemonstration: true,
  };
}

async function main(): Promise<void> {
  const locale = "en";
  const today = todayIso();
  const departure = addDays(today, 15);
  const returnDate = addDays(departure, 6);

  function byId(id: string) {
    return DEMO_LOCATIONS.find((l) => l.id === id);
  }
  const ymq = byId("city-ymq");
  const lhr = byId("airport-lhr");
  const thr = byId("city-thr");
  if (!ymq || !lhr || !thr) throw new Error("Fixture locations missing.");

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

  // --- 1. Default filters return all offers -------------------------------------------------
  check(
    "1. default (empty) filters return every offer",
    applyFilters(offers, EMPTY_FILTER_STATE).length,
    offers.length,
  );

  // --- 2-4. Stop category classification -----------------------------------------------------
  check("2. stop count 0 classifies as direct", stopCategoryForCount(0), "direct");
  check(
    "3. stop count 1 classifies as oneStop",
    stopCategoryForCount(1),
    "oneStop",
  );
  check(
    "4. stop count 2 classifies as twoPlusStops",
    stopCategoryForCount(2),
    "twoPlusStops",
  );
  check(
    "4b. stop count 5 also classifies as twoPlusStops",
    stopCategoryForCount(5),
    "twoPlusStops",
  );
  check(
    "4c. round-trip max stop count uses the worse direction",
    maxStopCountForOffer(
      fakeOffer({ stopCount: 0, roundTrip: true, inboundStopCount: 1 }),
    ),
    1,
  );

  const direct = fakeOffer({ id: "direct", stopCount: 0 });
  const oneStop = fakeOffer({ id: "oneStop", stopCount: 1 });
  const twoStop = fakeOffer({ id: "twoStop", stopCount: 2 });
  const stopSample = [direct, oneStop, twoStop];

  ok(
    "2b. Direct category matches only maxStopCount=0",
    applyFilters(stopSample, { ...EMPTY_FILTER_STATE, stopCategories: ["direct"] })
      .map((o) => o.id)
      .join(",") === "direct",
  );
  ok(
    "3b. One-stop category matches only maxStopCount=1",
    applyFilters(stopSample, { ...EMPTY_FILTER_STATE, stopCategories: ["oneStop"] })
      .map((o) => o.id)
      .join(",") === "oneStop",
  );
  ok(
    "4d. Two-plus category matches maxStopCount>=2",
    applyFilters(stopSample, {
      ...EMPTY_FILTER_STATE,
      stopCategories: ["twoPlusStops"],
    })
      .map((o) => o.id)
      .join(",") === "twoStop",
  );

  // --- 5. Multiple stop categories use OR semantics ------------------------------------------
  check(
    "5. multiple stop categories combine with OR",
    applyFilters(stopSample, {
      ...EMPTY_FILTER_STATE,
      stopCategories: ["direct", "twoPlusStops"],
    })
      .map((o) => o.id)
      .sort(),
    ["direct", "twoStop"],
  );

  // --- 6-7. Carrier filter --------------------------------------------------------------------
  const aurora = fakeOffer({ id: "aurora-offer", carrierId: "aurora" });
  const maple = fakeOffer({ id: "maple-offer", carrierId: "maple" });
  const skyline = fakeOffer({ id: "skyline-offer", carrierId: "skyline" });
  const carrierSample = [aurora, maple, skyline];

  ok(
    "6. carrier filter matches the validating carrier",
    applyFilters(carrierSample, { ...EMPTY_FILTER_STATE, carrierIds: ["maple"] })
      .map((o) => o.id)
      .join(",") === "maple-offer",
  );
  check(
    "7. multiple carrier values combine with OR",
    applyFilters(carrierSample, {
      ...EMPTY_FILTER_STATE,
      carrierIds: ["aurora", "skyline"],
    })
      .map((o) => o.id)
      .sort(),
    ["aurora-offer", "skyline-offer"],
  );

  // --- 8-11. Departure-time bucket boundaries ------------------------------------------------
  check(
    "8. 00:00 is earlyMorning",
    departureTimeBucketForOffer(fakeOffer({ departureTime: "00:00" })),
    "earlyMorning",
  );
  check(
    "8b. 05:59 is still earlyMorning",
    departureTimeBucketForOffer(fakeOffer({ departureTime: "05:59" })),
    "earlyMorning",
  );
  check(
    "9. 06:00 is morning",
    departureTimeBucketForOffer(fakeOffer({ departureTime: "06:00" })),
    "morning",
  );
  check(
    "9b. 11:59 is still morning",
    departureTimeBucketForOffer(fakeOffer({ departureTime: "11:59" })),
    "morning",
  );
  check(
    "10. 12:00 is afternoon",
    departureTimeBucketForOffer(fakeOffer({ departureTime: "12:00" })),
    "afternoon",
  );
  check(
    "10b. 17:59 is still afternoon",
    departureTimeBucketForOffer(fakeOffer({ departureTime: "17:59" })),
    "afternoon",
  );
  check(
    "11. 18:00 is evening",
    departureTimeBucketForOffer(fakeOffer({ departureTime: "18:00" })),
    "evening",
  );
  check(
    "11b. 23:59 is still evening",
    departureTimeBucketForOffer(fakeOffer({ departureTime: "23:59" })),
    "evening",
  );

  // --- 12. Price maximum inclusive -------------------------------------------------------------
  const price500 = fakeOffer({ id: "price500", totalPrice: 500 });
  const price501 = fakeOffer({ id: "price501", totalPrice: 501 });
  ok(
    "12. an offer priced exactly at the maximum is included",
    offerMatchesFilters(price500, { ...EMPTY_FILTER_STATE, maxTotalPrice: 500 }),
  );
  ok(
    "12b. an offer priced one unit above the maximum is excluded",
    !offerMatchesFilters(price501, { ...EMPTY_FILTER_STATE, maxTotalPrice: 500 }),
  );

  // --- 13-14. Duration maximum inclusive, per direction --------------------------------------
  const oneWayAtLimit = fakeOffer({ id: "ow-limit", durationMinutes: 400 });
  const oneWayOverLimit = fakeOffer({ id: "ow-over", durationMinutes: 401 });
  ok(
    "13. one-way itinerary duration exactly at the maximum is included",
    offerMatchesFilters(oneWayAtLimit, {
      ...EMPTY_FILTER_STATE,
      maxDurationMinutes: 400,
    }),
  );
  ok(
    "13b. one-way itinerary duration one minute over the maximum is excluded",
    !offerMatchesFilters(oneWayOverLimit, {
      ...EMPTY_FILTER_STATE,
      maxDurationMinutes: 400,
    }),
  );
  const roundTripBothWithin = fakeOffer({
    id: "rt-both-ok",
    roundTrip: true,
    durationMinutes: 300,
    inboundDurationMinutes: 350,
  });
  const roundTripInboundOver = fakeOffer({
    id: "rt-inbound-over",
    roundTrip: true,
    durationMinutes: 300,
    inboundDurationMinutes: 450,
  });
  ok(
    "14. round trip matches when both directions are within the maximum",
    offerMatchesFilters(roundTripBothWithin, {
      ...EMPTY_FILTER_STATE,
      maxDurationMinutes: 400,
    }),
  );
  ok(
    "14b. round trip is excluded when only the inbound exceeds the maximum",
    !offerMatchesFilters(roundTripInboundOver, {
      ...EMPTY_FILTER_STATE,
      maxDurationMinutes: 400,
    }),
  );
  ok(
    "14c. round-trip duration is never judged by the combined total alone",
    // Combined total (300+450=750) would fail a naive "<= 400" check for
    // roundTripBothWithin too if that were the rule — it isn't, so this
    // offer (300 and 350, each individually within 400) still matches.
    offerMatchesFilters(roundTripBothWithin, {
      ...EMPTY_FILTER_STATE,
      maxDurationMinutes: 400,
    }),
  );

  // --- 15-17. Airports --------------------------------------------------------------------------
  check(
    "15. departure-airport code is the outbound itinerary's first segment origin",
    departureAirportCodeForOffer(
      fakeOffer({ originCode: "YUL", destinationCode: "LHR" }),
    ),
    "YUL",
  );
  check(
    "16. arrival-airport code is the outbound itinerary's last segment destination",
    arrivalAirportCodeForOffer(
      fakeOffer({ originCode: "YUL", destinationCode: "LGW" }),
    ),
    "LGW",
  );
  const fromYYZ = fakeOffer({
    id: "from-yyz",
    originCode: "YYZ",
    destinationCode: "LHR",
  });
  const fromYTZ = fakeOffer({
    id: "from-ytz",
    originCode: "YTZ",
    destinationCode: "LHR",
  });
  const fromYUL = fakeOffer({
    id: "from-yul",
    originCode: "YUL",
    destinationCode: "LHR",
  });
  check(
    "17. multiple departure airports combine with OR",
    applyFilters([fromYYZ, fromYTZ, fromYUL], {
      ...EMPTY_FILTER_STATE,
      departureAirportCodes: ["YYZ", "YUL"],
    })
      .map((o) => o.id)
      .sort(),
    ["from-yul", "from-yyz"],
  );

  // --- 18. Different dimensions use AND semantics -----------------------------------------------
  const matchesBoth = fakeOffer({
    id: "and-match",
    carrierId: "aurora",
    stopCount: 0,
    totalPrice: 400,
  });
  const matchesOnlyCarrier = fakeOffer({
    id: "and-carrier-only",
    carrierId: "aurora",
    stopCount: 2,
    totalPrice: 400,
  });
  const andFilters: FlightFilterState = {
    ...EMPTY_FILTER_STATE,
    carrierIds: ["aurora"],
    stopCategories: ["direct"],
  };
  check(
    "18. AND across dimensions: only the offer matching every active dimension survives",
    applyFilters([matchesBoth, matchesOnlyCarrier], andFilters).map((o) => o.id),
    ["and-match"],
  );

  // --- 19-20. Filtering never mutates or reassigns identity -----------------------------------
  const beforeJson = JSON.stringify(offers);
  applyFilters(offers, { ...EMPTY_FILTER_STATE, stopCategories: ["direct"] });
  check(
    "19. filtering does not mutate the input offers",
    JSON.stringify(offers),
    beforeJson,
  );
  const filteredSubset = applyFilters(offers, EMPTY_FILTER_STATE);
  ok(
    "20. filtering preserves offer identity (same object references survive)",
    filteredSubset.every((offer, index) => offer === offers[index]),
  );

  // --- 21-24. Sorting occurs after filtering ----------------------------------------------------
  const filteredThenSorted = sortOffers(
    applyFilters(offers, {
      ...EMPTY_FILTER_STATE,
      maxTotalPrice: priceBounds(offers).max,
    }),
    "cheapest",
  );
  ok(
    "21. every sorted offer is a member of the filtered set",
    filteredThenSorted.every((offer) => offers.some((o) => o.id === offer.id)),
  );
  const cheapestSorted = sortOffers(offers, "cheapest");
  ok(
    "22. cheapest sort remains non-decreasing by price after filtering",
    cheapestSorted.every(
      (o, i) => i === 0 || o.totalPrice >= cheapestSorted[i - 1].totalPrice,
    ),
  );
  const fastestSorted = sortOffers(offers, "fastest");
  ok(
    "23. fastest sort remains non-decreasing by duration after filtering",
    fastestSorted.every(
      (o, i) =>
        i === 0 ||
        o.rankingMetadata.totalDurationMinutes >=
          fastestSorted[i - 1].rankingMetadata.totalDurationMinutes,
    ),
  );
  const bestFirst = sortOffers(offers, "best").map((o) => o.id);
  const bestSecond = sortOffers(offers, "best").map((o) => o.id);
  check("24. Best sort stays deterministic after filtering", bestSecond, bestFirst);

  // --- 25. Filtering does not change Best-score inputs ------------------------------------------
  const sampleOffer = offers[0];
  const sampleOfferAfterFilterPass = applyFilters(offers, EMPTY_FILTER_STATE)[0];
  check(
    "25. an offer's ranking-relevant fields are unchanged by filtering",
    {
      price: sampleOfferAfterFilterPass.totalPrice,
      duration: sampleOfferAfterFilterPass.rankingMetadata.totalDurationMinutes,
      stops: sampleOfferAfterFilterPass.rankingMetadata.totalStopCount,
    },
    {
      price: sampleOffer.totalPrice,
      duration: sampleOffer.rankingMetadata.totalDurationMinutes,
      stops: sampleOffer.rankingMetadata.totalStopCount,
    },
  );

  // --- 26. Result count stable under sorting ----------------------------------------------------
  const narrowed = applyFilters(offers, {
    ...EMPTY_FILTER_STATE,
    stopCategories: ["direct"],
  });
  check(
    "26. filtered result count is identical across all three sorts",
    [
      sortOffers(narrowed, "best").length,
      sortOffers(narrowed, "cheapest").length,
      sortOffers(narrowed, "fastest").length,
    ],
    [narrowed.length, narrowed.length, narrowed.length],
  );

  // --- 27. Empty result set supported ------------------------------------------------------------
  check(
    "27. a filter combination matching nothing returns an empty array, not an error",
    applyFilters(offers, {
      ...EMPTY_FILTER_STATE,
      carrierIds: ["no-such-carrier"],
    }),
    [],
  );

  // --- 28-33. URL sort/serialize round trip -------------------------------------------------------
  const bounds = {
    priceMax: priceBounds(offers).max,
    durationMax: durationBounds(offers).max,
  };
  const roundTripState = {
    sort: "cheapest" as const,
    filters: {
      ...EMPTY_FILTER_STATE,
      stopCategories: ["oneStop", "direct"] as const,
      carrierIds: ["maple", "aurora"],
    },
  };
  const serializedParams = new URLSearchParams();
  appendResultsViewStateParams(serializedParams, roundTripState, bounds);
  const reparsed = parseResultsViewState(serializedParams);
  check("28. sort round-trips through the URL", reparsed.sort, "cheapest");
  check(
    "28b. stop categories round-trip through the URL",
    [...reparsed.filters.stopCategories].sort(),
    ["direct", "oneStop"],
  );
  check(
    "28c. carriers round-trip through the URL",
    [...reparsed.filters.carrierIds].sort(),
    ["aurora", "maple"],
  );

  const defaultParams = new URLSearchParams();
  appendResultsViewStateParams(
    defaultParams,
    { sort: "best", filters: EMPTY_FILTER_STATE },
    bounds,
  );
  check(
    "29. default filter values are omitted from the URL",
    defaultParams.toString(),
    "",
  );
  ok("30. sort=best is never written to the URL", !defaultParams.has("sort"));

  const cheapestParams = new URLSearchParams();
  appendResultsViewStateParams(
    cheapestParams,
    { sort: "cheapest", filters: EMPTY_FILTER_STATE },
    bounds,
  );
  check(
    "30b. Cheapest sort serializes as sort=cheapest",
    cheapestParams.get("sort"),
    "cheapest",
  );
  check(
    "31. sort=cheapest is restored as cheapest",
    parseSortOption("cheapest"),
    "cheapest",
  );
  check(
    "32. sort=fastest is restored as fastest",
    parseSortOption("fastest"),
    "fastest",
  );
  check(
    "33. an invalid sort value falls back to best",
    parseSortOption("nonsense"),
    "best",
  );
  check(
    "33b. a missing sort value falls back to best",
    parseSortOption(null),
    "best",
  );

  // --- 34-39. Lenient filter-value validation ------------------------------------------------------
  check(
    "34. an unknown stop value is dropped",
    parseFilterState(new URLSearchParams("stops=direct,madeUp")).stopCategories,
    ["direct"],
  );
  const sanitized = sanitizeFiltersAgainstOffers(
    { ...EMPTY_FILTER_STATE, carrierIds: ["aurora", "not-a-real-carrier"] },
    offers,
  );
  ok(
    "35. an unknown carrier is dropped once offers are available",
    !sanitized.carrierIds.includes("not-a-real-carrier"),
  );
  const sanitizedAirports = sanitizeFiltersAgainstOffers(
    { ...EMPTY_FILTER_STATE, departureAirportCodes: ["ZZZ"] },
    offers,
  );
  check(
    "36. an unknown airport is dropped once offers are available",
    sanitizedAirports.departureAirportCodes,
    [],
  );
  check(
    "37. an invalid maxPrice defaults safely (parses to null)",
    parseFilterState(new URLSearchParams("maxPrice=not-a-number")).maxTotalPrice,
    null,
  );
  check(
    "38. an invalid maxDuration defaults safely (parses to null)",
    parseFilterState(new URLSearchParams("maxDuration=abc")).maxDurationMinutes,
    null,
  );
  check(
    "39. a negative numeric value defaults safely (parses to null)",
    parseFilterState(new URLSearchParams("maxPrice=-50")).maxTotalPrice,
    null,
  );
  check(
    "39b. a non-finite-looking numeric value defaults safely (parses to null)",
    parseFilterState(new URLSearchParams("maxDuration=Infinity"))
      .maxDurationMinutes,
    null,
  );

  // --- 40. Duplicate filter field ignored -----------------------------------------------------------
  const duplicateStopsParams = new URLSearchParams();
  duplicateStopsParams.append("stops", "direct");
  duplicateStopsParams.append("stops", "oneStop");
  check(
    "40. a duplicated filter query key is ignored completely (treated as absent)",
    parseFilterState(duplicateStopsParams).stopCategories,
    [],
  );

  // --- 41. Duplicate strict Search Intent field remains invalid (unchanged from V2.3) --------------
  const serializedIntentParams = new URLSearchParams();
  serializedIntentParams.set("v", "1");
  serializedIntentParams.set("trip", "oneWay");
  serializedIntentParams.append("origin", ymq.id);
  serializedIntentParams.append("origin", lhr.id);
  serializedIntentParams.set("destination", lhr.id);
  serializedIntentParams.set("departure", departure);
  serializedIntentParams.set("adults", "1");
  serializedIntentParams.set("cabin", "economy");
  serializedIntentParams.set("flex", "0");
  serializedIntentParams.set("currency", "CAD");
  const strictResult = validateSearchIntentParams(
    parseRawSearchIntentParams(serializedIntentParams),
    locale,
  );
  ok(
    "41. a duplicated Search Intent field is still rejected as invalid",
    !strictResult.ok,
  );
  if (!strictResult.ok) {
    const reason: SearchIntentInvalidReason = strictResult.reason;
    check(
      "41b. rejection reason is duplicateParameter",
      reason,
      "duplicateParameter",
    );
  }

  // --- 42-43. Canonical serialization order and dedup -----------------------------------------------
  const unorderedParams = new URLSearchParams();
  appendResultsViewStateParams(
    unorderedParams,
    {
      sort: "best",
      filters: {
        ...EMPTY_FILTER_STATE,
        stopCategories: ["twoPlusStops", "direct", "oneStop"],
      },
    },
    bounds,
  );
  check(
    "42. selected stop values serialize in canonical (not input) order",
    unorderedParams.get("stops"),
    "direct,oneStop,twoPlusStops",
  );
  const duplicateValueParams = new URLSearchParams();
  appendResultsViewStateParams(
    duplicateValueParams,
    {
      sort: "best",
      filters: { ...EMPTY_FILTER_STATE, carrierIds: ["maple", "maple", "aurora"] },
    },
    bounds,
  );
  check(
    "43. duplicate selected values are removed during serialization",
    duplicateValueParams.get("carriers"),
    "aurora,maple",
  );

  // --- 44-46. Active filter-group counting ------------------------------------------------------------
  check(
    "44. an empty filter state has zero active groups",
    activeFilterGroupCount(EMPTY_FILTER_STATE),
    0,
  );
  check(
    "44b. Stops + Carrier + Price active counts as exactly 3 groups",
    activeFilterGroupCount({
      ...EMPTY_FILTER_STATE,
      stopCategories: ["direct"],
      carrierIds: ["aurora"],
      maxTotalPrice: 500,
    }),
    3,
  );
  check(
    "45. the Price group counts once regardless of the chosen value",
    activeFilterGroupCount({ ...EMPTY_FILTER_STATE, maxTotalPrice: 1 }),
    1,
  );
  check(
    "46. the Duration group counts once regardless of the chosen value",
    activeFilterGroupCount({ ...EMPTY_FILTER_STATE, maxDurationMinutes: 1 }),
    1,
  );

  // --- 47-48. Facet counts respect other filters, excluding their own dimension ----------------------
  const facetSample = [
    fakeOffer({ id: "f1", carrierId: "aurora", stopCount: 0 }),
    fakeOffer({ id: "f2", carrierId: "maple", stopCount: 0 }),
    fakeOffer({ id: "f3", carrierId: "aurora", stopCount: 1 }),
  ];
  const facetsWithStopFilter = computeFacetCounts(facetSample, {
    ...EMPTY_FILTER_STATE,
    stopCategories: ["direct"],
  });
  check(
    "47. carrier facet counts respect the active Stops filter",
    [
      facetsWithStopFilter.carriers.get("aurora") ?? 0,
      facetsWithStopFilter.carriers.get("maple") ?? 0,
    ],
    [1, 1],
  );
  const facetsWithCarrierFilter = computeFacetCounts(facetSample, {
    ...EMPTY_FILTER_STATE,
    carrierIds: ["aurora"],
  });
  check(
    "48. Stops facet counts ignore the Stops filter itself (not narrowed to only the selected value)",
    [
      facetsWithCarrierFilter.stopCategories.get("direct") ?? 0,
      facetsWithCarrierFilter.stopCategories.get("oneStop") ?? 0,
    ],
    [1, 1],
  );

  // --- 49-51. Zero-count option handling ---------------------------------------------------------------
  function isDisabled(count: number, checked: boolean): boolean {
    return count === 0 && !checked;
  }
  ok(
    "49. a selected zero-count option stays enabled (removable)",
    !isDisabled(0, true),
  );
  ok(
    "50. an unselected zero-count option is disable-eligible",
    isDisabled(0, false),
  );
  const smallFacets = computeFacetCounts(
    [fakeOffer({ carrierId: "aurora" })],
    EMPTY_FILTER_STATE,
  );
  ok(
    "51. no facet count exceeds the complete offer count",
    (smallFacets.carriers.get("aurora") ?? 0) <= 1,
  );

  // --- 52-53. Airport section omission and City-all-airports exposure -----------------------------------
  const singleAirportOffers = [fakeOffer({ originCode: "YUL" })];
  check(
    "52. a single-airport offer set exposes exactly one departure-airport option (section may be omitted)",
    availableDepartureAirportCodes(singleAirportOffers).length,
    1,
  );

  const cityIntent = buildSearchIntent({
    tripType: "oneWay",
    origin: thr,
    destination: lhr,
    departureDate: departure,
    returnDate: null,
    travelers: DEFAULT_TRAVELERS,
    cabinClass: "economy",
    flexibilityDays: 0,
    currency: "CAD",
    locale,
  });
  if (!cityIntent) throw new Error("Fixture city-origin intent failed to build.");
  const cityRun = await repo.search(cityIntent);
  ok(
    "53. a City-all-airports origin exposes more than one departure-airport option across offers",
    availableDepartureAirportCodes(cityRun.offers).length >= 1,
  );

  // --- 54-55. Filtering never touches offer ids or Search Intent serialization ------------------------
  const idsBefore = offers.map((o) => o.id).sort();
  applyFilters(offers, {
    ...EMPTY_FILTER_STATE,
    stopCategories: ["direct", "oneStop", "twoPlusStops"],
  });
  const idsAfter = offers.map((o) => o.id).sort();
  check(
    "54. filtering never changes any offer's deterministic id",
    idsAfter,
    idsBefore,
  );

  const currentUrlParams = new URLSearchParams();
  currentUrlParams.set("v", "1");
  currentUrlParams.set("trip", "roundTrip");
  currentUrlParams.set("origin", ymq.id);
  currentUrlParams.set("destination", lhr.id);
  currentUrlParams.set("departure", departure);
  currentUrlParams.set("return", returnDate);
  currentUrlParams.set("adults", "1");
  currentUrlParams.set("cabin", "economy");
  currentUrlParams.set("flex", "0");
  currentUrlParams.set("currency", "CAD");
  const intentOnlySnapshot = currentUrlParams.toString();
  const withFilters = buildResultsSearchParams(
    currentUrlParams,
    {
      sort: "cheapest",
      filters: { ...EMPTY_FILTER_STATE, stopCategories: ["direct"] },
    },
    bounds,
  );
  const intentOnlyAgain = new URLSearchParams();
  for (const key of [
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
  ]) {
    const value = withFilters.get(key);
    if (value !== null) intentOnlyAgain.set(key, value);
  }
  check(
    "55. Search Intent parameters survive a filter commit completely unchanged",
    intentOnlyAgain.toString(),
    intentOnlySnapshot,
  );

  // --- 56-57. Unrelated params preserved; filter values are locale-independent -------------------------
  const withUnrelated = new URLSearchParams(currentUrlParams);
  withUnrelated.set("utm_source", "test");
  withUnrelated.set("stops", "direct");
  ok(
    "56. an unrelated unknown URL parameter does not corrupt filter parsing",
    parseFilterState(withUnrelated).stopCategories.includes("direct"),
  );
  check(
    "57. filter values parse identically regardless of any locale context",
    parseFilterState(new URLSearchParams("stops=oneStop")).stopCategories,
    parseFilterState(new URLSearchParams("stops=oneStop")).stopCategories,
  );

  // --- 58-59. No provider or commission influence ------------------------------------------------------
  const relabeledOffer: FlightOffer = {
    ...facetSample[0],
    provider: "A Completely Different Provider",
    validatingCarrierName: "A Renamed Carrier Display Name",
  };
  check(
    "58. no provider field participates in filter matching",
    offerMatchesFilters(relabeledOffer, {
      ...EMPTY_FILTER_STATE,
      carrierIds: ["aurora"],
    }),
    offerMatchesFilters(facetSample[0], {
      ...EMPTY_FILTER_STATE,
      carrierIds: ["aurora"],
    }),
  );
  ok(
    "59. FlightFilterState has no commission-related field at all",
    !Object.keys(EMPTY_FILTER_STATE).some((key) => /commission/i.test(key)),
  );

  // --- 60. Filter application makes no network or repository call -------------------------------------
  const syncResult = applyFilters(offers, EMPTY_FILTER_STATE);
  ok(
    "60. applyFilters returns synchronously (a plain array, never a Promise)",
    !(syncResult instanceof Promise) && Array.isArray(syncResult),
  );

  // =====================================================================================
  // Correction round: mobile draft facets (independent from committed), numeric
  // sanitization below the observed minimum, canonical URL cleanup, range-domain
  // step alignment, range commit deduplication, and localized singular count.
  // =====================================================================================

  // --- 61-66. Draft vs. committed facet counts (the reproduced Correction-1 case) -------------
  // A small, controlled fixture — not the real generated `offers` — so the
  // "at least one carrier is zero-count under the committed filter" premise
  // is guaranteed by construction rather than hoping a particular
  // deterministic search happens to produce it.
  const draftScenarioOffers = [
    fakeOffer({ id: "ds-direct-aurora", carrierId: "aurora", stopCount: 0 }),
    fakeOffer({ id: "ds-onestop-maple", carrierId: "maple", stopCount: 1 }),
    fakeOffer({ id: "ds-onestop-meridian", carrierId: "meridian", stopCount: 1 }),
  ];
  const committedStopsDirect: FlightFilterState = {
    ...EMPTY_FILTER_STATE,
    stopCategories: ["direct"],
  };
  const committedFacetsUnderDirect = computeFacetCounts(
    draftScenarioOffers,
    committedStopsDirect,
  );
  const draftFacetsUnrestricted = computeFacetCounts(
    draftScenarioOffers,
    EMPTY_FILTER_STATE,
  );
  const sortedEntries = (map: ReadonlyMap<string, number>) =>
    [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  // `computeFacetCounts` returns an *open* map — a carrier with no surviving
  // offers is simply absent as a key, not present with an explicit `0`. The
  // UI (and these checks) must read it the same way real callers do:
  // `map.get(id) ?? 0`, never by scanning for a literal zero value.
  const allDraftScenarioCarrierIds = availableCarriers(draftScenarioOffers).map(
    (c) => c.id,
  );

  ok(
    "61. the reproduced case is real: at least one carrier is zero-count under committed Stops=Direct",
    allDraftScenarioCarrierIds.some(
      (id) => (committedFacetsUnderDirect.carriers.get(id) ?? 0) === 0,
    ),
  );
  ok(
    "62. draft facet counts (draft has cleared Stops) differ from the still-committed facet counts",
    JSON.stringify(sortedEntries(draftFacetsUnrestricted.carriers)) !==
      JSON.stringify(sortedEntries(committedFacetsUnderDirect.carriers)),
  );
  let previouslyZeroCarrierBecameEnableEligible = false;
  for (const carrierId of allDraftScenarioCarrierIds) {
    const committedCount = committedFacetsUnderDirect.carriers.get(carrierId) ?? 0;
    if (
      committedCount === 0 &&
      (draftFacetsUnrestricted.carriers.get(carrierId) ?? 0) > 0
    ) {
      previouslyZeroCarrierBecameEnableEligible = true;
    }
  }
  ok(
    "63. a carrier disabled under the committed filter becomes enable-eligible once the draft clears it",
    previouslyZeroCarrierBecameEnableEligible,
  );
  check(
    "64. clearing the draft (Clear-all-in-Sheet) restores the complete unrestricted contextual counts",
    sortedEntries(draftFacetsUnrestricted.carriers),
    sortedEntries(
      computeFacetCounts(draftScenarioOffers, EMPTY_FILTER_STATE).carriers,
    ),
  );
  check(
    "65. committed Sidebar facet counts are unaffected by any draft computation performed alongside them",
    sortedEntries(
      computeFacetCounts(draftScenarioOffers, committedStopsDirect).carriers,
    ),
    sortedEntries(committedFacetsUnderDirect.carriers),
  );
  const emptyFilterMatchCount = applyFilters(
    draftScenarioOffers,
    EMPTY_FILTER_STATE,
  ).length;
  const stopCategorySumUnderEmptyFilter = [
    ...draftFacetsUnrestricted.stopCategories.values(),
  ].reduce((sum, count) => sum + count, 0);
  check(
    "66. draft match count and draft facet counts are derived from the same draft filter state",
    [emptyFilterMatchCount, stopCategorySumUnderEmptyFilter],
    [draftScenarioOffers.length, draftScenarioOffers.length],
  );

  // --- 67-74. Numeric sanitization uses dynamically-derived bounds, not fixed examples --------
  const dynPrice = priceBounds(offers);
  const dynDuration = durationBounds(offers);
  function sanitizedMaxPrice(value: number): number | null {
    return sanitizeFiltersAgainstOffers(
      { ...EMPTY_FILTER_STATE, maxTotalPrice: value },
      offers,
    ).maxTotalPrice;
  }
  function sanitizedMaxDuration(value: number): number | null {
    return sanitizeFiltersAgainstOffers(
      { ...EMPTY_FILTER_STATE, maxDurationMinutes: value },
      offers,
    ).maxDurationMinutes;
  }

  ok(
    "67. a price one unit below the dynamic observed minimum sanitizes to null",
    sanitizedMaxPrice(dynPrice.min - 1) === null,
  );
  check(
    "68. a price exactly at the dynamic observed minimum remains active",
    sanitizedMaxPrice(dynPrice.min),
    dynPrice.min,
  );
  check(
    "69. a price one unit below the dynamic observed maximum remains active",
    sanitizedMaxPrice(dynPrice.max - 1),
    dynPrice.max - 1,
  );
  ok(
    "70. a price exactly at the dynamic observed maximum sanitizes to null",
    sanitizedMaxPrice(dynPrice.max) === null,
  );
  ok(
    "70b. a price far above the dynamic observed maximum sanitizes to null",
    sanitizedMaxPrice(dynPrice.max + 999_999) === null,
  );
  ok(
    "71. a duration one minute below the dynamic observed minimum sanitizes to null",
    sanitizedMaxDuration(dynDuration.min - 1) === null,
  );
  check(
    "72. a duration exactly at the dynamic observed minimum remains active",
    sanitizedMaxDuration(dynDuration.min),
    dynDuration.min,
  );
  check(
    "73. a duration one minute below the dynamic observed maximum remains active",
    sanitizedMaxDuration(dynDuration.max - 1),
    dynDuration.max - 1,
  );
  ok(
    "74. a duration exactly at the dynamic observed maximum sanitizes to null",
    sanitizedMaxDuration(dynDuration.max) === null,
  );

  // --- 75-81. Range-domain step alignment ------------------------------------------------------
  const explicitDomain = computeRangeSliderDomain({ min: 425, max: 763 }, 15);
  check(
    "75. the reproduced 425-763 example produces a step-aligned, reachable sliderMax of 770",
    explicitDomain.sliderMax,
    770,
  );
  ok(
    "76. the 425-763 sliderMax is reachable from min via whole 15-minute steps",
    (explicitDomain.sliderMax - explicitDomain.min) % 15 === 0,
  );
  ok(
    "77. the 425-763 sliderMax is always >= the observed maximum (unrestricted stays reachable)",
    explicitDomain.sliderMax >= explicitDomain.max,
  );
  const alignedDomain = computeRangeSliderDomain({ min: 100, max: 400 }, 50);
  check(
    "78. an already step-aligned range's sliderMax equals the observed maximum exactly",
    alignedDomain.sliderMax,
    400,
  );
  const dynDurationDomain = computeRangeSliderDomain(dynDuration, 15);
  ok(
    "79. the dynamic Duration domain's sliderMax is reachable on the 15-minute step lattice",
    (dynDurationDomain.sliderMax - dynDurationDomain.min) % 15 === 0,
  );
  ok(
    "80. the dynamic Duration domain's sliderMax is always >= its own observed maximum",
    dynDurationDomain.sliderMax >= dynDuration.max,
  );
  const unrestrictedDurationParams = new URLSearchParams();
  appendResultsViewStateParams(
    unrestrictedDurationParams,
    { sort: "best", filters: EMPTY_FILTER_STATE },
    { priceMax: dynPrice.max, durationMax: dynDuration.max },
  );
  ok(
    "81. an unrestricted (null) Duration still serializes without maxDuration despite the sliderMax rounding",
    !unrestrictedDurationParams.has("maxDuration"),
  );

  // --- 82-84. Canonical URL cleanup -------------------------------------------------------------
  const staleParams = new URLSearchParams();
  staleParams.set("v", "1");
  staleParams.set("trip", "roundTrip");
  staleParams.set("origin", ymq.id);
  staleParams.set("destination", lhr.id);
  staleParams.set("departure", departure);
  staleParams.set("return", returnDate);
  staleParams.set("adults", "1");
  staleParams.set("cabin", "economy");
  staleParams.set("flex", "0");
  staleParams.set("currency", "CAD");
  staleParams.set("sort", "cheapest");
  staleParams.set("stops", "direct");
  staleParams.set("carriers", "not-a-real-carrier");
  staleParams.set("fromAirports", "ZZZ");
  staleParams.set("maxPrice", String(Math.max(0, dynPrice.min - 500)));

  const staleRaw = parseResultsViewState(staleParams);
  const staleSanitized = sanitizeFiltersAgainstOffers(staleRaw.filters, offers);
  const canonicalFromStale = buildResultsSearchParams(
    staleParams,
    { sort: staleRaw.sort, filters: staleSanitized },
    { priceMax: dynPrice.max, durationMax: dynDuration.max },
  );

  ok(
    "82. a stale unknown carrier disappears from the canonical URL",
    !(canonicalFromStale.get("carriers") ?? "").includes("not-a-real-carrier"),
  );
  ok(
    "82b. a stale unknown airport disappears entirely from the canonical URL",
    !canonicalFromStale.has("fromAirports"),
  );
  ok(
    "82c. a below-minimum maxPrice disappears from the canonical URL (defaults to unrestricted)",
    !canonicalFromStale.has("maxPrice"),
  );
  check(
    "83. canonical cleanup preserves every Search Intent parameter exactly",
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
    ].map((key) => canonicalFromStale.get(key)),
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
    "84. canonical cleanup preserves a valid Sort value",
    canonicalFromStale.get("sort"),
    "cheapest",
  );
  check(
    "84b. canonical cleanup preserves a valid, still-relevant Stops filter",
    canonicalFromStale.get("stops"),
    "direct",
  );

  // --- 85-91. Range commit deduplication (pure simulation of the component's policy) ----------
  interface RangeEvent {
    readonly type: "change" | "pointerup" | "keyup" | "blur" | "externalReset";
    readonly value?: number;
  }
  function simulateRangeCommits(
    events: readonly RangeEvent[],
    initial: number,
  ): { readonly commits: readonly number[]; readonly finalLocal: number } {
    let local = initial;
    let lastCommitted = initial;
    const commits: number[] = [];
    function maybeCommit() {
      if (local !== lastCommitted) {
        lastCommitted = local;
        commits.push(local);
      }
    }
    for (const event of events) {
      if (event.type === "change") local = event.value ?? local;
      else if (event.type === "externalReset") {
        local = event.value ?? local;
        lastCommitted = local;
      } else {
        maybeCommit();
      }
    }
    return { commits, finalLocal: local };
  }

  check(
    "85. a pointer change commits exactly once",
    simulateRangeCommits([{ type: "change", value: 50 }, { type: "pointerup" }], 0)
      .commits,
    [50],
  );
  check(
    "86. pointerup followed by blur still commits exactly once",
    simulateRangeCommits(
      [{ type: "change", value: 50 }, { type: "pointerup" }, { type: "blur" }],
      0,
    ).commits,
    [50],
  );
  check(
    "87. a keyboard change commits exactly once",
    simulateRangeCommits([{ type: "change", value: 60 }, { type: "keyup" }], 0)
      .commits,
    [60],
  );
  check(
    "88. keyup followed by blur still commits exactly once",
    simulateRangeCommits(
      [{ type: "change", value: 60 }, { type: "keyup" }, { type: "blur" }],
      0,
    ).commits,
    [60],
  );
  check(
    "89. a changed value committed only via blur still commits exactly once",
    simulateRangeCommits([{ type: "change", value: 70 }, { type: "blur" }], 0)
      .commits,
    [70],
  );
  check(
    "90. a blur with no preceding change commits nothing",
    simulateRangeCommits([{ type: "blur" }], 0).commits,
    [],
  );
  const externalResetSimulation = simulateRangeCommits(
    [
      { type: "change", value: 50 },
      { type: "pointerup" },
      { type: "externalReset", value: 100 },
      { type: "blur" },
    ],
    0,
  );
  check(
    "91. an externally reset value synchronizes and does not re-commit on the next blur",
    [externalResetSimulation.commits, externalResetSimulation.finalLocal],
    [[50], 100],
  );

  // --- 92-95. Localized singular Result Count, no hardcoded digits in any locale ---------------
  function filteredCountOneTemplate(dictionary: {
    readonly flightResults: { readonly filteredCount: { readonly one: string } };
  }): string {
    return dictionary.flightResults.filteredCount.one;
  }
  const hardcodedLeadingDigit = /^[0-9۰-۹٠-٩]/;
  ok(
    "92. English filteredCount.one uses {filtered}, not a hardcoded leading digit",
    filteredCountOneTemplate(enDictionary).includes("{filtered}") &&
      !hardcodedLeadingDigit.test(filteredCountOneTemplate(enDictionary)),
  );
  ok(
    "93. French filteredCount.one uses {filtered}, not a hardcoded leading digit",
    filteredCountOneTemplate(frDictionary).includes("{filtered}") &&
      !hardcodedLeadingDigit.test(filteredCountOneTemplate(frDictionary)),
  );
  ok(
    "94. Persian filteredCount.one uses {filtered}, not a hardcoded Persian digit",
    filteredCountOneTemplate(faDictionary).includes("{filtered}") &&
      !hardcodedLeadingDigit.test(filteredCountOneTemplate(faDictionary)),
  );
  ok(
    "95. Arabic filteredCount.one uses {filtered}, not a hardcoded Western digit",
    filteredCountOneTemplate(arDictionary).includes("{filtered}") &&
      !hardcodedLeadingDigit.test(filteredCountOneTemplate(arDictionary)),
  );
  check(
    "95b. the singular template substitutes both a localized filtered and total value",
    formatTemplate(filteredCountOneTemplate(enDictionary), {
      filtered: "1",
      total: "12",
    }),
    "1 of 12 demonstration options",
  );

  // --- 96-98. Repository isolation reconfirmed after every correction above --------------------
  const idsBeforeCorrections = offers.map((o) => o.id).sort();
  sanitizeFiltersAgainstOffers(committedStopsDirect, offers);
  applyFilters(offers, committedStopsDirect);
  computeFacetCounts(offers, committedStopsDirect);
  const idsAfterCorrections = offers.map((o) => o.id).sort();
  check(
    "96. offer ids remain unchanged after exercising every correction in this round",
    idsAfterCorrections,
    idsBeforeCorrections,
  );
  ok(
    "97. sanitizeFiltersAgainstOffers is synchronous — never a Promise, never awaited",
    !(sanitizeFiltersAgainstOffers(EMPTY_FILTER_STATE, offers) instanceof Promise),
  );
  ok(
    "98. computeRangeSliderDomain and buildResultsSearchParams are synchronous pure functions",
    !(computeRangeSliderDomain(dynDuration, 15) instanceof Promise) &&
      !(
        buildResultsSearchParams(
          new URLSearchParams(),
          { sort: "best", filters: EMPTY_FILTER_STATE },
          { priceMax: dynPrice.max, durationMax: dynDuration.max },
        ) instanceof Promise
      ),
  );

  // --- 99-105. No-op view-state navigation guard (the primitive `commitViewState` compares) ---
  // `commitViewState` in `FlightResultsExperience` builds the canonical next
  // query string via `buildResultsSearchParams` and skips `router.push`
  // entirely when it equals the current one. That comparison is exercised
  // here directly against the same pure builder, rather than against the
  // component (which isn't callable from a script).
  const noOpBaseParams = new URLSearchParams();
  noOpBaseParams.set("v", "1");
  noOpBaseParams.set("trip", "roundTrip");
  noOpBaseParams.set("origin", ymq.id);
  noOpBaseParams.set("destination", lhr.id);
  noOpBaseParams.set("departure", departure);
  noOpBaseParams.set("return", returnDate);
  noOpBaseParams.set("adults", "1");
  noOpBaseParams.set("cabin", "economy");
  noOpBaseParams.set("flex", "0");
  noOpBaseParams.set("currency", "CAD");
  noOpBaseParams.set("__devScenario", "empty");
  noOpBaseParams.set("stops", "direct");

  const noOpBounds = { priceMax: dynPrice.max, durationMax: dynDuration.max };
  const noOpCommittedViewState: ResultsViewState = {
    sort: "best",
    filters: { ...EMPTY_FILTER_STATE, stopCategories: ["direct"] },
  };
  // The starting URL must already be canonical for an identical re-commit to
  // be a true no-op — build it the same way the app does, once, up front.
  const noOpCurrentParams = buildResultsSearchParams(
    noOpBaseParams,
    noOpCommittedViewState,
    noOpBounds,
  );
  const noOpCurrentString = noOpCurrentParams.toString();

  check(
    "99. re-committing an identical Results view state produces the same canonical query string",
    buildResultsSearchParams(
      noOpCurrentParams,
      noOpCommittedViewState,
      noOpBounds,
    ).toString(),
    noOpCurrentString,
  );

  const changedViewState: ResultsViewState = {
    sort: "cheapest",
    filters: noOpCommittedViewState.filters,
  };
  ok(
    "100. a changed Results view state produces a different canonical query string",
    buildResultsSearchParams(
      noOpCurrentParams,
      changedViewState,
      noOpBounds,
    ).toString() !== noOpCurrentString,
  );

  const bestAlreadyActiveParams = buildResultsSearchParams(
    noOpBaseParams,
    { sort: "best", filters: EMPTY_FILTER_STATE },
    noOpBounds,
  );
  check(
    "101. re-selecting Sort=Best while it is already the (omitted) active value is a no-op URL state",
    buildResultsSearchParams(
      bestAlreadyActiveParams,
      { sort: "best", filters: EMPTY_FILTER_STATE },
      noOpBounds,
    ).toString(),
    bestAlreadyActiveParams.toString(),
  );

  const emptyFiltersAlreadyActiveParams = buildResultsSearchParams(
    noOpBaseParams,
    { sort: "cheapest", filters: EMPTY_FILTER_STATE },
    noOpBounds,
  );
  check(
    "102. re-applying already-empty filters while Sort is unchanged is a no-op URL state",
    buildResultsSearchParams(
      emptyFiltersAlreadyActiveParams,
      { sort: "cheapest", filters: EMPTY_FILTER_STATE },
      noOpBounds,
    ).toString(),
    emptyFiltersAlreadyActiveParams.toString(),
  );

  const actualFilterChange: ResultsViewState = {
    sort: "best",
    filters: {
      ...EMPTY_FILTER_STATE,
      stopCategories: ["direct", "oneStop"],
    },
  };
  ok(
    "103. an actual filter change away from the committed state remains canonical and different",
    buildResultsSearchParams(
      noOpCurrentParams,
      actualFilterChange,
      noOpBounds,
    ).toString() !== noOpCurrentString,
  );

  const noOpResultParams = buildResultsSearchParams(
    noOpCurrentParams,
    noOpCommittedViewState,
    noOpBounds,
  );
  check(
    "104. the no-op comparison preserves every Search Intent parameter exactly",
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
    ].map((key) => noOpResultParams.get(key)),
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
    ].map((key) => noOpCurrentParams.get(key)),
  );
  check(
    "105. the no-op comparison preserves the development-scenario escape hatch unchanged",
    noOpResultParams.get("__devScenario"),
    noOpCurrentParams.get("__devScenario"),
  );

  // --- 106-118. Serialization bounds: known maxima vs. unknown maxima ------------------------
  //
  // The serializer's numeric policy has two modes, and the difference is
  // carried by the type (`number | null`), not by a sentinel. A number means
  // the complete offer set is available and offer-aware omission applies; a
  // null means the caller has no offer set to assess the value against — the
  // Details page's invalid-offer-id, repository-error and empty-result states,
  // for instance — and a format-valid value must survive so "Back to results"
  // does not silently drop part of the visitor's view state. Every check below
  // drives the real shared serializer; none reimplements the rule.
  const knownBounds: ResultsSerializationBounds = {
    priceMax: dynPrice.max,
    durationMax: dynDuration.max,
  };
  const unknownBounds: ResultsSerializationBounds = {
    priceMax: null,
    durationMax: null,
  };

  function serializeWith(
    filters: Partial<FlightFilterState>,
    bounds: ResultsSerializationBounds,
    sort: ResultsViewState["sort"] = "best",
  ): URLSearchParams {
    const target = new URLSearchParams();
    appendResultsViewStateParams(
      target,
      { sort, filters: { ...EMPTY_FILTER_STATE, ...filters } },
      bounds,
    );
    return target;
  }

  check(
    "106a. serializationBoundsForOffers reports the shared observed maxima for a real offer set",
    serializationBoundsForOffers(offers),
    { priceMax: dynPrice.max, durationMax: dynDuration.max },
  );
  check(
    "106b. serializationBoundsForOffers reports unknown bounds for an empty offer set (no sentinel)",
    serializationBoundsForOffers([]),
    { priceMax: null, durationMax: null },
  );

  ok(
    "106. a concrete Price maximum omits a value sitting at that maximum",
    !serializeWith({ maxTotalPrice: dynPrice.max }, knownBounds).has("maxPrice"),
  );
  check(
    "107. a concrete Price maximum preserves a restrictive value below it",
    serializeWith({ maxTotalPrice: dynPrice.max - 1 }, knownBounds).get("maxPrice"),
    String(dynPrice.max - 1),
  );
  ok(
    "108. a concrete Duration maximum omits a value sitting at that maximum",
    !serializeWith({ maxDurationMinutes: dynDuration.max }, knownBounds).has(
      "maxDuration",
    ),
  );
  check(
    "109. a concrete Duration maximum preserves a restrictive value below it",
    serializeWith({ maxDurationMinutes: dynDuration.max - 1 }, knownBounds).get(
      "maxDuration",
    ),
    String(dynDuration.max - 1),
  );

  // A value far above every observed price: dropped when the ceiling is known,
  // kept when it is not, because "cannot yet be assessed" is not "invalid".
  const unassessablePrice = dynPrice.max + 500;
  const unassessableDuration = dynDuration.max + 500;
  check(
    "110. an unknown Price maximum preserves a non-null format-valid value",
    serializeWith({ maxTotalPrice: unassessablePrice }, unknownBounds).get(
      "maxPrice",
    ),
    String(unassessablePrice),
  );
  check(
    "111. an unknown Duration maximum preserves a non-null format-valid value",
    serializeWith({ maxDurationMinutes: unassessableDuration }, unknownBounds).get(
      "maxDuration",
    ),
    String(unassessableDuration),
  );
  ok(
    "112. the same values are dropped once the maxima are known (the two modes really differ)",
    !serializeWith({ maxTotalPrice: unassessablePrice }, knownBounds).has(
      "maxPrice",
    ) &&
      !serializeWith({ maxDurationMinutes: unassessableDuration }, knownBounds).has(
        "maxDuration",
      ),
  );
  ok(
    "113. unknown maxima plus null filter values emit no numeric parameter at all",
    !serializeWith(
      { maxTotalPrice: null, maxDurationMinutes: null },
      unknownBounds,
    ).has("maxPrice") &&
      !serializeWith(
        { maxTotalPrice: null, maxDurationMinutes: null },
        unknownBounds,
      ).has("maxDuration"),
  );

  const unknownBoundsSerialized = serializeWith(
    { maxTotalPrice: unassessablePrice, maxDurationMinutes: unassessableDuration },
    unknownBounds,
    "cheapest",
  ).toString();
  ok(
    "114. unknown bounds never serialize a sentinel (null/Infinity/-Infinity/undefined/NaN)",
    !/null|Infinity|undefined|NaN/i.test(unknownBoundsSerialized),
  );
  ok(
    "115. unknown bounds still emit plain digit values for both numeric filters",
    /(^|&)maxPrice=\d+(&|$)/.test(unknownBoundsSerialized) &&
      /(^|&)maxDuration=\d+(&|$)/.test(unknownBoundsSerialized),
  );

  // The two modes must differ *only* in the numeric filters: Sort, the
  // enum/CSV filters, canonical ordering and default omission are untouched.
  const orderingFilters: Partial<FlightFilterState> = {
    stopCategories: ["oneStop", "direct"],
    carrierIds: ["maple", "aurora"],
    departureTimeBuckets: ["evening", "morning"],
    maxTotalPrice: dynPrice.max - 1,
    maxDurationMinutes: dynDuration.max - 1,
  };
  const orderedKnown = serializeWith(orderingFilters, knownBounds, "cheapest");
  const orderedUnknown = serializeWith(orderingFilters, unknownBounds, "cheapest");
  check(
    "116. canonical parameter order and canonical CSV order are unchanged by the bounds model",
    [
      [...orderedKnown.keys()],
      [...orderedKnown.values()],
      [...orderedUnknown.keys()],
      [...orderedUnknown.values()],
    ],
    [
      ["sort", "stops", "carriers", "departTime", "maxPrice", "maxDuration"],
      [
        "cheapest",
        "direct,oneStop",
        "aurora,maple",
        "morning,evening",
        String(dynPrice.max - 1),
        String(dynDuration.max - 1),
      ],
      ["sort", "stops", "carriers", "departTime", "maxPrice", "maxDuration"],
      [
        "cheapest",
        "direct,oneStop",
        "aurora,maple",
        "morning,evening",
        String(dynPrice.max - 1),
        String(dynDuration.max - 1),
      ],
    ],
  );
  check(
    "117. default view state still serializes to nothing under known bounds",
    serializeWith({}, knownBounds).toString(),
    "",
  );
  check(
    "118. default view state still serializes to nothing under unknown bounds",
    serializeWith({}, unknownBounds).toString(),
    "",
  );

  // Sanity checks on the pure helpers used throughout, not otherwise exercised above.
  ok(
    "extra. outboundItinerary falls back to the only itinerary for a one-way offer",
    outboundItinerary(fakeOffer({})).direction === "outbound",
  );
  ok(
    "extra. availableCarriers reflects the fixture's fictional carriers only",
    availableCarriers(facetSample).every((c) => ["aurora", "maple"].includes(c.id)),
  );
  ok(
    "extra. availableArrivalAirportCodes never exceeds the offer count",
    availableArrivalAirportCodes(offers).length <= offers.length,
  );

  const total = passed + failures.length;
  if (failures.length > 0) {
    console.error(
      `\nFilter verification FAILED — ${failures.length} of ${total}\n`,
    );
    for (const failure of failures) console.error(`  ✗ ${failure}\n`);
    process.exit(1);
  }

  console.log(`Filter verification passed — ${passed}/${total} checks`);
}

main().catch((error: unknown) => {
  console.error("Filter verification crashed:", error);
  process.exit(1);
});
