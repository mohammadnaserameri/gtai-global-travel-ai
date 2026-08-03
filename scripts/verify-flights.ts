/**
 * Deterministic checks for the flights feature: Search Intent URL round trip,
 * validation, offer generation, ranking and truthfulness invariants.
 *
 * Same contract as `verify-dates.ts` and `verify-locations.ts` — no test
 * runner, no new dependency, compiled by the project's own TypeScript
 * compiler and run under Node via the shared verification tsconfig.
 *
 *   npm run verify:flights
 */

import { addDays, todayIso } from "../src/features/dates/date-utils";
import { formatFieldDate } from "../src/features/dates/date-formatting";
import { DEMO_LOCATIONS } from "../src/features/locations/demo-location-data";
import {
  buildSearchIntent,
  isValidTravelerCounts,
  parseInitialFlightSearch,
  validateFlightDatePair,
  validateSearchIntentParams,
} from "../src/features/flights/search-intent-validation";
import {
  parseRawSearchIntentParams,
  sanitizeDuplicateFields,
  serializeSearchIntent,
  type RawSearchIntentParams,
} from "../src/features/flights/search-intent-url";
import { DEFAULT_TRAVELERS } from "../src/features/flights/search-intent-types";
import type { FlightSearchIntent } from "../src/features/flights/search-intent-types";
import { locationsOverlapForFlightSearch } from "../src/features/flights/location-overlap";
import { resolveAirportTimeZone } from "../src/features/flights/airport-timezone";
import {
  fromLocalDateTime,
  toLocalDateTime,
} from "../src/features/flights/utc-timeline";
import {
  DemoFlightOfferRepository,
  MIN_ROUND_TRIP_TURNAROUND_MINUTES,
} from "../src/features/flights/demo-flight-offer-repository";
import { FlightOfferRepositoryError } from "../src/features/flights/flight-offer-repository";
import {
  bestScore,
  computeRankingBounds,
  sortOffers,
} from "../src/features/flights/flight-offer-ranking";
import {
  formatDayOffset,
  formatLocaleNumber,
} from "../src/features/flights/flight-offer-formatting";
import type {
  FlightOffer,
  LocalDateTime,
} from "../src/features/flights/flight-offer-types";

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

async function main(): Promise<void> {
  const locale = "en";
  const today = todayIso();
  const departure = addDays(today, 10);
  const returnDate = addDays(departure, 5);

  function byId(id: string) {
    return DEMO_LOCATIONS.find((l) => l.id === id);
  }
  const ymq = byId("city-ymq");
  const yul = byId("airport-yul");
  const lhr = byId("airport-lhr");
  const thr = byId("city-thr");
  const yto = byId("city-yto");
  const yyz = byId("airport-yyz");
  const yvr = byId("airport-yvr");
  const nrt = byId("airport-nrt");
  if (!ymq || !yul || !lhr || !thr || !yto || !yyz || !yvr || !nrt) {
    throw new Error("Fixture locations missing from the demo directory.");
  }

  const baseline: RawSearchIntentParams = {
    version: "1",
    trip: "roundTrip",
    origin: ymq.id,
    destination: lhr.id,
    departure,
    returnDate,
    adults: "1",
    children: null,
    infantsInSeat: null,
    infantsOnLap: null,
    cabin: "economy",
    flex: "0",
    currency: "CAD",
    duplicateKeys: [],
  };
  function raw(overrides: Partial<RawSearchIntentParams>): RawSearchIntentParams {
    return { ...baseline, ...overrides };
  }

  const roundTripIntent = buildSearchIntent({
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
  if (!roundTripIntent)
    throw new Error("Fixture round-trip intent failed to build.");

  const oneWayIntent = buildSearchIntent({
    tripType: "oneWay",
    origin: ymq,
    destination: lhr,
    departureDate: departure,
    returnDate: null,
    travelers: DEFAULT_TRAVELERS,
    cabinClass: "business",
    flexibilityDays: 0,
    currency: "CAD",
    locale,
  });
  if (!oneWayIntent) throw new Error("Fixture one-way intent failed to build.");

  // --- 1. URL serialize/parse round trip -------------------------------------
  const serialized = serializeSearchIntent(roundTripIntent);
  const reparsed = validateSearchIntentParams(
    parseRawSearchIntentParams(serialized),
    locale,
  );
  ok("1. URL round trip parses back to a valid intent", reparsed.ok);
  if (reparsed.ok) {
    check(
      "1. round trip preserves origin",
      reparsed.intent.origin.entityId,
      roundTripIntent.origin.entityId,
    );
    check(
      "1. round trip preserves destination",
      reparsed.intent.destination.entityId,
      roundTripIntent.destination.entityId,
    );
    check(
      "1. round trip preserves departure",
      reparsed.intent.departureDate,
      roundTripIntent.departureDate,
    );
    check(
      "1. round trip preserves return",
      reparsed.intent.returnDate,
      roundTripIntent.returnDate,
    );
    check(
      "1. round trip preserves cabin",
      reparsed.intent.cabinClass,
      roundTripIntent.cabinClass,
    );
  }

  // --- 2. Round trip requires Return ------------------------------------------
  const missingReturn = validateSearchIntentParams(
    raw({ returnDate: null }),
    locale,
  );
  ok("2. round trip without return is rejected", !missingReturn.ok);
  if (!missingReturn.ok)
    check("2. reason is missingReturn", missingReturn.reason, "missingReturn");

  // --- 3. One way omits Return -------------------------------------------------
  check(
    "3. a one-way intent always has a null return date",
    oneWayIntent.returnDate,
    null,
  );
  const oneWaySerialized = serializeSearchIntent(oneWayIntent);
  check(
    "3. serializing a one-way intent omits the return parameter",
    oneWaySerialized.has("return"),
    false,
  );

  // --- 4. Multi-city rejected --------------------------------------------------
  const multiCity = validateSearchIntentParams(raw({ trip: "multiCity" }), locale);
  ok("4. multi-city trip type is rejected", !multiCity.ok);
  if (!multiCity.ok)
    check(
      "4. reason is unsupportedTripType",
      multiCity.reason,
      "unsupportedTripType",
    );

  // --- 5. Everywhere rejected for normal results ------------------------------
  const everywhere = validateSearchIntentParams(
    raw({ destination: "flexible-everywhere" }),
    locale,
  );
  ok("5. Everywhere destination is rejected", !everywhere.ok);
  if (!everywhere.ok)
    check(
      "5. reason is destinationIsEverywhere",
      everywhere.reason,
      "destinationIsEverywhere",
    );

  // --- 6. Unknown location rejected -------------------------------------------
  const unknownOrigin = validateSearchIntentParams(
    raw({ origin: "airport-does-not-exist" }),
    locale,
  );
  ok("6. an unknown origin id is rejected", !unknownOrigin.ok);
  if (!unknownOrigin.ok)
    check("6. reason is unknownOrigin", unknownOrigin.reason, "unknownOrigin");

  // --- 7. Same origin and destination rejected --------------------------------
  const sameLocation = validateSearchIntentParams(
    raw({ origin: ymq.id, destination: ymq.id }),
    locale,
  );
  ok("7. identical origin and destination is rejected", !sameLocation.ok);
  if (!sameLocation.ok)
    check("7. reason is sameLocation", sameLocation.reason, "sameLocation");

  // --- 8. Invalid ISO date rejected --------------------------------------------
  const badDeparture = validateSearchIntentParams(
    raw({ departure: "2026-13-40" }),
    locale,
  );
  ok("8. an impossible departure date is rejected", !badDeparture.ok);
  if (!badDeparture.ok)
    check("8. reason is invalidDeparture", badDeparture.reason, "invalidDeparture");

  // --- 9. Return before Departure rejected -------------------------------------
  const returnBeforeDeparture = validateSearchIntentParams(
    raw({ departure: "2026-09-20", returnDate: "2026-09-10" }),
    locale,
  );
  ok("9. a return before the departure is rejected", !returnBeforeDeparture.ok);
  if (!returnBeforeDeparture.ok) {
    check(
      "9. reason is returnNotAfterDeparture",
      returnBeforeDeparture.reason,
      "returnNotAfterDeparture",
    );
  }

  // --- 10. Invalid traveler count rejected -------------------------------------
  const zeroAdults = validateSearchIntentParams(raw({ adults: "0" }), locale);
  ok("10. zero adults is rejected", !zeroAdults.ok);
  const tooManyTravelers = validateSearchIntentParams(
    raw({ adults: "9", children: "1" }),
    locale,
  );
  ok("10. more than nine travelers is rejected", !tooManyTravelers.ok);
  const tooManyLapInfants = validateSearchIntentParams(
    raw({ adults: "1", infantsOnLap: "2" }),
    locale,
  );
  ok("10. more lap infants than adults is rejected", !tooManyLapInfants.ok);

  // --- 11. Invalid cabin class rejected -----------------------------------------
  const badCabin = validateSearchIntentParams(raw({ cabin: "luxury" }), locale);
  ok("11. an unsupported cabin class is rejected", !badCabin.ok);
  if (!badCabin.ok)
    check("11. reason is invalidCabin", badCabin.reason, "invalidCabin");

  // --- 12. Invalid flexibility rejected ------------------------------------------
  const badFlex = validateSearchIntentParams(raw({ flex: "9" }), locale);
  ok("12. an out-of-range flexibility value is rejected", !badFlex.ok);
  if (!badFlex.ok)
    check("12. reason is invalidFlexibility", badFlex.reason, "invalidFlexibility");

  // --- Offer generation --------------------------------------------------------
  const repo = new DemoFlightOfferRepository({ delayMs: 0 });
  const [firstRun, secondRun] = await Promise.all([
    repo.search(roundTripIntent),
    repo.search(roundTripIntent),
  ]);

  // --- 13. Same intent creates identical offers ---------------------------------
  check(
    "13. the same intent produces byte-identical offers",
    firstRun.offers,
    secondRun.offers,
  );

  // --- 14. Different date changes the deterministic result set -----------------
  const laterIntent: FlightSearchIntent = {
    ...roundTripIntent,
    departureDate: addDays(departure, 30),
  };
  const laterRun = await repo.search(laterIntent);
  ok(
    "14. a different departure date changes the generated offers",
    JSON.stringify(laterRun.offers) !== JSON.stringify(firstRun.offers),
  );

  const offers = firstRun.offers;
  ok("has offers to check", offers.length >= 10 && offers.length <= 16);

  // --- 15. Offer IDs unique ------------------------------------------------------
  check(
    "15. every offer id is unique",
    new Set(offers.map((o) => o.id)).size,
    offers.length,
  );

  // --- 16. Prices positive --------------------------------------------------------
  ok(
    "16. every total price is positive",
    offers.every((o) => o.totalPrice > 0),
  );
  ok(
    "16. every per-traveler price is positive",
    offers.every((o) => o.pricePerTraveler > 0),
  );

  // --- 17. Currency consistent -----------------------------------------------------
  ok(
    "17. every offer uses the search currency",
    offers.every((o) => o.currency === roundTripIntent.currency),
  );

  // --- 18. One-way offers have one itinerary ---------------------------------------
  const oneWayRun = await repo.search(oneWayIntent);
  ok(
    "18. one-way offers carry exactly one itinerary",
    oneWayRun.offers.every((o) => o.itineraries.length === 1),
  );

  // --- 19. Round-trip offers have two itineraries -----------------------------------
  ok(
    "19. round-trip offers carry exactly two itineraries",
    offers.every((o) => o.itineraries.length === 2),
  );

  // --- 20. Segment chronology valid (compared as UTC instants, never wall-clock strings) --
  let chronologyValid = true;
  let layoverConsistent = true;
  let noSelfSegment = true;
  let noRepeatedLayover = true;
  let continuityHolds = true;
  for (const offer of offers) {
    for (const itinerary of offer.itineraries) {
      const layoverCodes = itinerary.layovers.map((l) => l.airportCode);
      if (new Set(layoverCodes).size !== layoverCodes.length)
        noRepeatedLayover = false;

      for (let i = 0; i < itinerary.segments.length; i += 1) {
        const segment = itinerary.segments[i];
        if (segment.originCode === segment.destinationCode) noSelfSegment = false;
        if (segment.arrival.epochMinutes <= segment.departure.epochMinutes) {
          chronologyValid = false;
        }
        if (i > 0) {
          const previous = itinerary.segments[i - 1];
          if (segment.originCode !== previous.destinationCode)
            continuityHolds = false;
          const layover = itinerary.layovers[i - 1];
          if (
            segment.departure.epochMinutes !==
            previous.arrival.epochMinutes + layover.durationMinutes
          ) {
            layoverConsistent = false;
          }
        }
      }
    }
  }
  ok(
    "20. every segment arrives strictly after it departs (UTC epoch)",
    chronologyValid,
  );
  ok(
    "20. a connecting segment departs exactly one layover after the previous arrival (UTC epoch)",
    layoverConsistent,
  );
  ok("5. no generated segment has equal origin and destination", noSelfSegment);
  ok("6. no itinerary repeats a layover airport", noRepeatedLayover);
  ok(
    "7. every segment's origin equals the previous segment's destination",
    continuityHolds,
  );

  // --- 21. Stop count matches segment count --------------------------------------------
  ok(
    "21. stop count equals segment count minus one",
    offers.every((o) =>
      o.itineraries.every((it) => it.stopCount === it.segments.length - 1),
    ),
  );

  // --- 22. Duration includes segment and layover duration -------------------------------
  ok(
    "22. itinerary duration equals segment time plus layover time",
    offers.every((o) =>
      o.itineraries.every((it) => {
        const segmentTotal = it.segments.reduce(
          (sum, s) => sum + s.durationMinutes,
          0,
        );
        const layoverTotal = it.layovers.reduce(
          (sum, l) => sum + l.durationMinutes,
          0,
        );
        return it.durationMinutes === segmentTotal + layoverTotal;
      }),
    ),
  );

  // --- 23. Cheapest sort ascending ----------------------------------------------------
  const cheapest = sortOffers(offers, "cheapest");
  ok(
    "23. cheapest sort is non-decreasing by price",
    cheapest.every((o, i) => i === 0 || o.totalPrice >= cheapest[i - 1].totalPrice),
  );

  // --- 24. Fastest sort ascending -------------------------------------------------------
  const fastest = sortOffers(offers, "fastest");
  ok(
    "24. fastest sort is non-decreasing by duration",
    fastest.every(
      (o, i) =>
        i === 0 ||
        o.rankingMetadata.totalDurationMinutes >=
          fastest[i - 1].rankingMetadata.totalDurationMinutes,
    ),
  );

  // --- 25. Best sort deterministic -------------------------------------------------------
  const bestFirst = sortOffers(offers, "best").map((o) => o.id);
  const bestSecond = sortOffers(offers, "best").map((o) => o.id);
  check("25. sorting Best twice yields the same order", bestSecond, bestFirst);

  // --- 26. Best score excludes provider or commission -------------------------------------
  const bounds = computeRankingBounds(offers);
  const sample = offers[0];
  const relabeled: FlightOffer = {
    ...sample,
    provider: "A Completely Different Provider",
    validatingCarrierName: "A Completely Different Carrier",
    operatingCarrierNames: ["Yet Another Carrier"],
  };
  check(
    "26. changing provider or carrier never changes the Best score",
    bestScore(relabeled, bounds),
    bestScore(sample, bounds),
  );

  // --- 27. Sorting does not remove offers -------------------------------------------------
  for (const option of ["best", "cheapest", "fastest"] as const) {
    const sorted = sortOffers(offers, option);
    check(
      `27. sorting by ${option} keeps every offer`,
      sorted.length,
      offers.length,
    );
    check(
      `27. sorting by ${option} keeps the same id set`,
      [...sorted.map((o) => o.id)].sort(),
      [...offers.map((o) => o.id)].sort(),
    );
  }

  // --- 28. Result count stable -------------------------------------------------------------
  check(
    "28. result count is unchanged across all three sorts",
    [cheapest.length, fastest.length],
    [offers.length, offers.length],
  );

  // --- 29. Empty repository path works ------------------------------------------------------
  const emptyRepo = new DemoFlightOfferRepository({
    scenario: "empty",
    delayMs: 0,
  });
  const emptyResult = await emptyRepo.search(roundTripIntent);
  check("29. the empty scenario returns zero offers", emptyResult.offers.length, 0);

  // --- 30. Error repository path works -------------------------------------------------------
  const errorRepo = new DemoFlightOfferRepository({
    scenario: "error",
    delayMs: 0,
  });
  let threwRepositoryError = false;
  try {
    await errorRepo.search(roundTripIntent);
  } catch (error) {
    threwRepositoryError = error instanceof FlightOfferRepositoryError;
  }
  ok(
    "30. the error scenario rejects with FlightOfferRepositoryError",
    threwRepositoryError,
  );

  // --- 31. CITY_ALL_AIRPORTS resolves to member airports ---------------------------------------
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
  const originAirportCodes = new Set(
    cityRun.offers.map((o) => o.itineraries[0].segments[0].originCode),
  );
  ok(
    "31. a City-all-airports origin always resolves to one of its member airports",
    [...originAirportCodes].every((code) => thr.airportCodes.includes(code)),
  );
  ok(
    "31. more than one member airport is actually used across offers",
    originAirportCodes.size >= 1,
  );

  // --- 32. IATA codes remain valid GTAI locations -----------------------------------------------
  const knownIataCodes = new Set(
    DEMO_LOCATIONS.filter((l) => l.entityType === "AIRPORT").map((l) => l.iataCode),
  );
  let allCodesKnown = true;
  for (const offer of [...offers, ...cityRun.offers]) {
    for (const itinerary of offer.itineraries) {
      for (const segment of itinerary.segments) {
        if (!knownIataCodes.has(segment.originCode)) allCodesKnown = false;
        if (!knownIataCodes.has(segment.destinationCode)) allCodesKnown = false;
      }
      for (const layover of itinerary.layovers) {
        if (!knownIataCodes.has(layover.airportCode)) allCodesKnown = false;
      }
    }
  }
  ok("32. every airport code used is a real GTAI location", allCodesKnown);

  // --- 33. Demo flag is true for every offer -----------------------------------------------------
  ok(
    "33. every offer is flagged as a demonstration",
    offers.every((o) => o.isDemonstration === true),
  );

  // --- 34. No offer contains a deep link -----------------------------------------------------------
  const offersText = JSON.stringify(offers);
  ok("34. no offer serializes a URL of any kind", !/https?:\/\//.test(offersText));

  // --- 35. No offer claims live availability ---------------------------------------------------------
  ok(
    "35. no offer exposes a seat-availability field",
    offers.every((o) => !Object.prototype.hasOwnProperty.call(o, "remainingSeats")),
  );

  // =====================================================================================
  // Correction round: location overlap, unique layovers, real UTC local time, dates,
  // duplicate parameters, version requirement, Gregorian formatting, fictional
  // identifiers, aircraft enum, locale numbers.
  // =====================================================================================

  // --- 1-4. Location overlap policy --------------------------------------------------------
  ok(
    "1. City YMQ conflicts with its member airport YUL",
    locationsOverlapForFlightSearch(ymq, yul),
  );
  ok(
    "2. Airport YUL conflicts with City YMQ",
    locationsOverlapForFlightSearch(yul, ymq),
  );
  ok(
    "3. City YTO conflicts with its member airport YYZ",
    locationsOverlapForFlightSearch(yto, yyz),
  );
  ok(
    "4. non-overlapping locations remain valid",
    !locationsOverlapForFlightSearch(ymq, lhr) &&
      !locationsOverlapForFlightSearch(yul, lhr),
  );
  const overlapRejected = validateSearchIntentParams(
    raw({ origin: yul.id, destination: ymq.id }),
    locale,
  );
  ok("1b. YUL -> YMQ is rejected by strict URL validation", !overlapRejected.ok);
  if (!overlapRejected.ok) {
    check("1b. reason is sameLocation", overlapRejected.reason, "sameLocation");
  }
  ok(
    "1c. buildSearchIntent rejects an overlapping YMQ -> YUL pair",
    buildSearchIntent({
      tripType: "oneWay",
      origin: ymq,
      destination: yul,
      departureDate: departure,
      returnDate: null,
      travelers: DEFAULT_TRAVELERS,
      cabinClass: "economy",
      flexibilityDays: 0,
      currency: "CAD",
      locale,
    }) === null,
  );

  // --- 6 (explicit). Dates known to trigger the old repeated-layover defect -----------------
  // Anchored to `today` rather than written as literals. The original literal
  // pairs were the dates the repeated-layover defect was first reproduced on,
  // and they silently became unusable the moment the calendar passed them:
  // GTAI refuses a past departure date by design, so the fixture stopped
  // building rather than stopped passing. Relative offsets keep the same shape
  // — consecutive 5-day-gap round trips — and cannot expire. The sweep is also
  // widened below to compensate for no longer pinning those exact seeds.
  const knownDefectDatePairs: readonly [string, string][] = [
    1, 6, 11, 16, 21, 26,
  ].map((offset): [string, string] => [
    addDays(today, offset),
    addDays(today, offset + 5),
  ]);
  let noRepeatedLayoverAcrossKnownDates = true;
  let noSelfSegmentAcrossKnownDates = true;
  for (const [dep, ret] of knownDefectDatePairs) {
    const knownDateIntent = buildSearchIntent({
      tripType: "roundTrip",
      origin: ymq,
      destination: lhr,
      departureDate: dep,
      returnDate: ret,
      travelers: DEFAULT_TRAVELERS,
      cabinClass: "economy",
      flexibilityDays: 0,
      currency: "CAD",
      locale,
    });
    if (!knownDateIntent)
      throw new Error(`Fixture intent failed to build for ${dep}/${ret}.`);
    const knownDateRun = await repo.search(knownDateIntent);
    for (const offer of knownDateRun.offers) {
      for (const itinerary of offer.itineraries) {
        const codes = itinerary.layovers.map((l) => l.airportCode);
        if (new Set(codes).size !== codes.length)
          noRepeatedLayoverAcrossKnownDates = false;
        for (const segment of itinerary.segments) {
          if (segment.originCode === segment.destinationCode)
            noSelfSegmentAcrossKnownDates = false;
        }
      }
    }
  }
  ok(
    "6b. no repeated layover across the dates known to trigger the old defect",
    noRepeatedLayoverAcrossKnownDates,
  );
  ok(
    "6c. no self-segment across the dates known to trigger the old defect",
    noSelfSegmentAcrossKnownDates,
  );

  // --- 9. Airport-local conversion, Toronto/London ------------------------------------------
  const torontoTz = resolveAirportTimeZone("YYZ");
  const londonTz = resolveAirportTimeZone("LHR");
  if (!torontoTz || !londonTz) throw new Error("Expected time zones for YYZ/LHR.");
  // Toronto is EDT (UTC-4) in August 2026 — 09:00 local is 13:00 UTC.
  const torontoAugustEpoch = fromLocalDateTime("2026-08-08", 9, 0, torontoTz);
  check(
    "9. Toronto 09:00 local in August converts to the correct UTC instant (EDT, UTC-4)",
    torontoAugustEpoch,
    Date.UTC(2026, 7, 8, 13, 0) / 60_000,
  );
  const backToToronto = toLocalDateTime(torontoAugustEpoch, torontoTz);
  check(
    "9b. converting back to Toronto local time round-trips exactly",
    backToToronto.time,
    "09:00",
  );
  const londonFromTorontoEpoch = toLocalDateTime(torontoAugustEpoch, londonTz);
  // London is BST (UTC+1) in August 2026, 5 hours ahead of Toronto's EDT.
  check(
    "9c. the same instant reads as 14:00 local in London (5h ahead of Toronto in August)",
    londonFromTorontoEpoch.time,
    "14:00",
  );

  // --- 10. Airport-local conversion, Tehran/Toronto -----------------------------------------
  const tehranTz = resolveAirportTimeZone("THR");
  if (!tehranTz) throw new Error("Expected a time zone for THR.");
  // Iran Standard Time is a fixed UTC+3:30 with no DST — 09:00 local is 05:30 UTC.
  const tehranEpoch = fromLocalDateTime("2026-08-08", 9, 0, tehranTz);
  check(
    "10. Tehran 09:00 local converts to the correct UTC instant (IRST, UTC+3:30)",
    tehranEpoch,
    Date.UTC(2026, 7, 8, 5, 30) / 60_000,
  );
  const torontoFromTehranEpoch = toLocalDateTime(tehranEpoch, torontoTz);
  check(
    "10b. the same instant reads as the same local day in Toronto (small enough gap)",
    torontoFromTehranEpoch.date,
    "2026-08-08",
  );
  // An earlier Tehran wall clock (02:00) is far enough from midnight that the
  // 7.5-hour gap to Toronto's zone pushes it onto the *previous* local day —
  // the genuine date-line-style case Correction 3 asks for.
  const tehranEarlyEpoch = fromLocalDateTime("2026-08-08", 2, 0, tehranTz);
  const torontoFromTehranEarly = toLocalDateTime(tehranEarlyEpoch, torontoTz);
  check(
    "10c. an early Tehran wall clock reads as the previous local day in Toronto",
    torontoFromTehranEarly.date,
    "2026-08-07",
  );

  // --- 11. DST-sensitive date ----------------------------------------------------------------
  // 2026-03-08 is the second Sunday of March — US/Canada DST begins that day,
  // so the two wall clocks below are two calendar days apart but only 47
  // clock-hours apart in real elapsed (UTC) time — the "spring forward" hour
  // is skipped, which is exactly the DST-awareness this correction requires.
  const beforeDst = fromLocalDateTime("2026-03-07", 9, 0, torontoTz); // EST, UTC-5
  const afterDst = fromLocalDateTime("2026-03-09", 9, 0, torontoTz); // EDT, UTC-4
  check(
    "11. two wall-clock days apart loses exactly the DST hour in real UTC elapsed time",
    afterDst - beforeDst,
    2 * 24 * 60 - 60,
  );

  // --- 12-13. Date bounds -----------------------------------------------------------------------
  const farFuture = addDays(today, 400); // well past +12 months
  const departureAfterMax = validateFlightDatePair("oneWay", farFuture, null);
  ok("13. a departure far past the maximum is rejected", !departureAfterMax.ok);
  if (!departureAfterMax.ok) {
    check(
      "13. reason is departureOutOfRange",
      departureAfterMax.reason,
      "departureOutOfRange",
    );
  }
  const maxDeparture = addDays(today, 365);
  const returnAfterMax = validateFlightDatePair(
    "roundTrip",
    maxDeparture,
    addDays(maxDeparture, 40),
  );
  ok(
    "12. a return past the maximum is rejected even with a valid departure",
    !returnAfterMax.ok,
  );
  if (!returnAfterMax.ok) {
    check(
      "12. reason is returnOutOfRange",
      returnAfterMax.reason,
      "returnOutOfRange",
    );
  }

  // --- 14. Past restoration ignored -----------------------------------------------------------
  const pastRestoration = parseInitialFlightSearch(
    raw({ departure: addDays(today, -1), returnDate: null, trip: "oneWay" }),
  );
  ok(
    "14. a past departure is not restored",
    pastRestoration !== undefined && pastRestoration.departureDate === null,
  );

  // --- 15. Invalid builder dates rejected --------------------------------------------------------
  ok(
    "15. buildSearchIntent rejects an invalid departure date",
    buildSearchIntent({
      tripType: "oneWay",
      origin: ymq,
      destination: lhr,
      departureDate: "not-a-date",
      returnDate: null,
      travelers: DEFAULT_TRAVELERS,
      cabinClass: "economy",
      flexibilityDays: 0,
      currency: "CAD",
      locale,
    }) === null,
  );
  ok(
    "15b. buildSearchIntent rejects a departure past the maximum",
    buildSearchIntent({
      tripType: "oneWay",
      origin: ymq,
      destination: lhr,
      departureDate: farFuture,
      returnDate: null,
      travelers: DEFAULT_TRAVELERS,
      cabinClass: "economy",
      flexibilityDays: 0,
      currency: "CAD",
      locale,
    }) === null,
  );

  // --- 16-19. Duplicate parameters and version requirement ---------------------------------------
  const duplicateOrigin = validateSearchIntentParams(
    raw({ duplicateKeys: ["origin"] }),
    locale,
  );
  ok("16. a duplicated origin parameter is rejected", !duplicateOrigin.ok);
  if (!duplicateOrigin.ok) {
    check(
      "16. reason is duplicateParameter",
      duplicateOrigin.reason,
      "duplicateParameter",
    );
  }
  const duplicateDeparture = validateSearchIntentParams(
    raw({ duplicateKeys: ["departure"] }),
    locale,
  );
  ok("17. a duplicated departure parameter is rejected", !duplicateDeparture.ok);
  if (!duplicateDeparture.ok) {
    check(
      "17. reason is duplicateParameter",
      duplicateDeparture.reason,
      "duplicateParameter",
    );
  }
  const duplicateAdults = validateSearchIntentParams(
    raw({ duplicateKeys: ["adults"] }),
    locale,
  );
  ok("18. a duplicated adults parameter is rejected", !duplicateAdults.ok);
  if (!duplicateAdults.ok) {
    check(
      "18. reason is duplicateParameter",
      duplicateAdults.reason,
      "duplicateParameter",
    );
  }
  const missingVersion = validateSearchIntentParams(raw({ version: null }), locale);
  ok("19. a missing version parameter is rejected", !missingVersion.ok);
  if (!missingVersion.ok) {
    check(
      "19. reason is unsupportedVersion",
      missingVersion.reason,
      "unsupportedVersion",
    );
  }
  const wrongVersion = validateSearchIntentParams(raw({ version: "2" }), locale);
  ok("19b. an unsupported version parameter is rejected", !wrongVersion.ok);

  // Lenient restoration ignores a duplicated field instead of trusting one value.
  const duplicatedOriginRaw = raw({ origin: yul.id, duplicateKeys: ["origin"] });
  const sanitized = sanitizeDuplicateFields(duplicatedOriginRaw);
  check(
    "16b. sanitizing drops a duplicated field rather than keeping its value",
    sanitized.origin,
    null,
  );
  const restoredWithDuplicate = parseInitialFlightSearch(duplicatedOriginRaw);
  ok(
    "16c. lenient restoration does not restore a duplicated origin",
    restoredWithDuplicate !== undefined && restoredWithDuplicate.origin === null,
  );

  // --- 20 (Gregorian). Persian Results formatting stays Gregorian -------------------------------
  // Matches `formatFieldDate`'s own options exactly (weekday + month + day) so
  // this is a genuine comparison, not an accidental mismatch on unrelated options.
  const fieldDateOptions: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  };
  const gregorianFa = formatFieldDate("2026-08-08", "fa");
  const bareCalendarFa = new Intl.DateTimeFormat("fa", fieldDateOptions).format(
    new Date(Date.UTC(2026, 7, 8)),
  );
  const explicitGregorianFa = new Intl.DateTimeFormat(
    "fa-IR-u-ca-gregory",
    fieldDateOptions,
  ).format(new Date(Date.UTC(2026, 7, 8)));
  check(
    "20. Persian Results formatting matches the explicit Gregorian calendar formatter",
    gregorianFa,
    explicitGregorianFa,
  );
  ok(
    "20b. Persian Results formatting differs from the bare (Persian-calendar) formatter",
    gregorianFa !== bareCalendarFa,
  );

  // --- 21. No real-looking two-letter flight number ------------------------------------------
  const realLookingPattern = /^[A-Z]{2}\d{2,4}$/;
  let noRealLookingNumber = true;
  for (const offer of offers) {
    for (const itinerary of offer.itineraries) {
      for (const segment of itinerary.segments) {
        if (realLookingPattern.test(segment.flightNumber))
          noRealLookingNumber = false;
      }
    }
  }
  ok(
    "21. no generated flight identifier looks like a real airline designator",
    noRealLookingNumber,
  );
  ok(
    "21b. every flight identifier uses the unmistakably fictional DEMO- prefix",
    offers.every((o) =>
      o.itineraries.every((it) =>
        it.segments.every((s) => s.flightNumber.startsWith("DEMO-")),
      ),
    ),
  );

  // --- 22. Aircraft values are typed enums, not English presentation strings --------------------
  const validAircraftTypes = new Set(["widebody", "narrowbody", "regionalJet"]);
  ok(
    "22. every segment's aircraft type is one of the three fictional enum values",
    offers.every((o) =>
      o.itineraries.every((it) =>
        it.segments.every((s) => validAircraftTypes.has(s.aircraftType)),
      ),
    ),
  );

  // --- 23. Every airport code resolves to an IANA time zone --------------------------------------
  const usedCodes = new Set<string>();
  for (const offer of [...offers, ...oneWayRun.offers]) {
    for (const itinerary of offer.itineraries) {
      for (const segment of itinerary.segments) {
        usedCodes.add(segment.originCode);
        usedCodes.add(segment.destinationCode);
      }
      for (const layover of itinerary.layovers) usedCodes.add(layover.airportCode);
    }
  }
  ok(
    "23. every airport code used by a generated offer resolves to an IANA time zone",
    [...usedCodes].every((code) => resolveAirportTimeZone(code) !== null),
  );

  // --- 24. Day-offset formatting supports positive and negative offsets -------------------------
  const dayOffsetLabels = {
    plusOne: "+1 day",
    plusN: "+{count} days",
    minusOne: "-1 day",
    minusN: "-{count} days",
  };
  function ldt(date: string): LocalDateTime {
    return { date, time: "00:00", epochMinutes: 0 };
  }
  check(
    "24. zero day offset renders no indicator",
    formatDayOffset(ldt("2026-08-08"), ldt("2026-08-08"), "en", dayOffsetLabels),
    null,
  );
  check(
    "24b. +1 day offset",
    formatDayOffset(ldt("2026-08-08"), ldt("2026-08-09"), "en", dayOffsetLabels),
    "+1 day",
  );
  check(
    "24c. +2 day offset",
    formatDayOffset(ldt("2026-08-08"), ldt("2026-08-10"), "en", dayOffsetLabels),
    "+2 days",
  );
  check(
    "24d. -1 day offset (date-line travel)",
    formatDayOffset(ldt("2026-08-08"), ldt("2026-08-07"), "en", dayOffsetLabels),
    "-1 day",
  );
  check(
    "24e. -2 day offset",
    formatDayOffset(ldt("2026-08-08"), ldt("2026-08-06"), "en", dayOffsetLabels),
    "-2 days",
  );

  // --- 25. Locale-number formatting for fa/ar -----------------------------------------------------
  const asciiTwelve = String(12);
  ok(
    "25. Persian number formatting differs from plain ASCII digits",
    formatLocaleNumber(12, "fa") !== asciiTwelve,
  );
  // Modern Arabic locale data does not guarantee Eastern Arabic-Indic digits —
  // many Arabic-speaking regions use Western digits by default. The correct
  // guarantee is that GTAI defers entirely to `Intl` for the resolved locale
  // tag rather than hardcoding a digit shape, so this compares against an
  // explicit `Intl.NumberFormat` call instead of assuming specific glyphs.
  check(
    "25b. Arabic number formatting matches Intl for the resolved locale tag",
    formatLocaleNumber(12, "ar"),
    new Intl.NumberFormat("ar-u-ca-gregory").format(12),
  );
  check(
    "25c. English number formatting stays plain ASCII",
    formatLocaleNumber(12, "en"),
    asciiTwelve,
  );

  // --- 26. Best score still excludes provider/commission (re-verified after the correction round) --
  ok(
    "26b. Best score is identical for two offers differing only in provider/carrier identity",
    bestScore(relabeled, bounds) === bestScore(sample, bounds),
  );

  // --- 27. Sorting membership and count remain stable (re-verified after the correction round) -----
  ok(
    "27b. every sort option preserves the exact offer count after the correction round",
    (["best", "cheapest", "fastest"] as const).every(
      (option) => sortOffers(offers, option).length === offers.length,
    ),
  );

  // =====================================================================================
  // Correction round 2: round-trip cross-itinerary chronology, integer traveler counts,
  // localized traveler numbers, Result Card bidi structure.
  // =====================================================================================

  // --- R1. The reproduced YTO -> LHR case: a one-day round-trip gap -------------------------
  // Relative for the same reason as the pairs above — the literal dates this
  // was reproduced on are now in the past, and a past departure is refused.
  // What made the case load-bearing is the one-day gap, which is preserved.
  const ytoLhrDeparture = addDays(today, 1);
  const ytoLhrReturn = addDays(today, 2);
  const ytoLhrIntent = buildSearchIntent({
    tripType: "roundTrip",
    origin: yto,
    destination: lhr,
    departureDate: ytoLhrDeparture,
    returnDate: ytoLhrReturn,
    travelers: DEFAULT_TRAVELERS,
    cabinClass: "economy",
    flexibilityDays: 0,
    currency: "CAD",
    locale,
  });
  if (!ytoLhrIntent) throw new Error("Fixture YTO -> LHR intent failed to build.");
  const ytoLhrRun = await repo.search(ytoLhrIntent);
  ok(
    "R1. the reproduced YTO -> LHR case still generates offers",
    ytoLhrRun.offers.length >= 10 && ytoLhrRun.offers.length <= 16,
  );
  ok(
    "R1b. every offer for the reproduced case has the inbound departing after outbound arrival plus the minimum turnaround",
    ytoLhrRun.offers.every((o) => {
      const [outbound, inbound] = o.itineraries;
      return (
        inbound.departure.epochMinutes >=
        outbound.arrival.epochMinutes + MIN_ROUND_TRIP_TURNAROUND_MINUTES
      );
    }),
  );
  ok(
    "R1c. every offer's outbound still departs on the selected date locally at the origin",
    ytoLhrRun.offers.every(
      (o) => o.itineraries[0].departure.date === ytoLhrDeparture,
    ),
  );
  ok(
    "R1d. every offer's inbound still departs on the selected return date locally at the return origin",
    ytoLhrRun.offers.every((o) => o.itineraries[1].departure.date === ytoLhrReturn),
  );

  // --- R2. Targeted route sweep: 1/2/5-day gaps, eastbound/westbound, a date-line-scale ------
  //         offset (YVR <-> NRT, ~16-17h apart), and stop-count diversity (direct/1-stop/2-stop).
  const targetedRoutePairs: readonly [typeof ymq, typeof ymq][] = [
    [ymq, lhr],
    [lhr, ymq],
    [yto, thr],
    [thr, yto],
    [yvr, nrt],
    [nrt, yvr],
  ];
  let r2ChronologyValid = true;
  let r2TurnaroundValid = true;
  let r2DatesPreserved = true;
  let r2OrderCorrect = true;
  const r2StopCountsSeen = new Set<number>();
  for (const [origin, destination] of targetedRoutePairs) {
    for (const gapDays of [1, 2, 5]) {
      const dep = addDays(departure, 90);
      const ret = addDays(dep, gapDays);
      const intent = buildSearchIntent({
        tripType: "roundTrip",
        origin,
        destination,
        departureDate: dep,
        returnDate: ret,
        travelers: DEFAULT_TRAVELERS,
        cabinClass: "economy",
        flexibilityDays: 0,
        currency: "CAD",
        locale,
      });
      if (!intent) continue;
      const run = await repo.search(intent);
      for (const offer of run.offers) {
        const [outbound, inbound] = offer.itineraries;
        r2StopCountsSeen.add(outbound.stopCount);
        r2StopCountsSeen.add(inbound.stopCount);
        if (outbound.direction !== "outbound" || inbound.direction !== "inbound") {
          r2OrderCorrect = false;
        }
        if (inbound.departure.epochMinutes <= outbound.arrival.epochMinutes) {
          r2ChronologyValid = false;
        }
        if (
          inbound.departure.epochMinutes <
          outbound.arrival.epochMinutes + MIN_ROUND_TRIP_TURNAROUND_MINUTES
        ) {
          r2TurnaroundValid = false;
        }
        if (outbound.departure.date !== dep || inbound.departure.date !== ret) {
          r2DatesPreserved = false;
        }
      }
    }
  }
  ok(
    "R2. round-trip chronology holds across eastbound/westbound/date-line-scale routes at 1/2/5-day gaps",
    r2ChronologyValid,
  );
  ok(
    "R2b. the minimum turnaround is respected across the same sweep",
    r2TurnaroundValid,
  );
  ok(
    "R2c. outbound/inbound local departure dates match the selected departure/return dates across the same sweep",
    r2DatesPreserved,
  );
  ok(
    "R2d. outbound is always the first itinerary and inbound the second, across the same sweep",
    r2OrderCorrect,
  );
  ok(
    "R2e. the sweep actually exercised direct, one-stop and two-stop itineraries",
    r2StopCountsSeen.has(0) && r2StopCountsSeen.has(1) && r2StopCountsSeen.has(2),
  );

  // --- R3. Exhaustive sweep: every valid non-overlapping demo origin/destination pair, -------
  //         returnDate = departureDate + 1 day (the tightest gap the date policy allows).
  const searchableLocations = DEMO_LOCATIONS.filter(
    (l) => l.entityType !== "FLEXIBLE_DESTINATION",
  );
  const nonOverlappingPairs: readonly (readonly [
    (typeof searchableLocations)[number],
    (typeof searchableLocations)[number],
  ])[] = searchableLocations.flatMap((origin) =>
    searchableLocations
      .filter(
        (destination) =>
          destination.id !== origin.id &&
          !locationsOverlapForFlightSearch(origin, destination),
      )
      .map((destination) => [origin, destination] as const),
  );
  const exhaustiveDeparture = addDays(departure, 120);
  const exhaustiveReturn = addDays(exhaustiveDeparture, 1);
  let r3ChronologyValid = true;
  let r3TurnaroundValid = true;
  let r3OfferCount = 0;
  for (const [origin, destination] of nonOverlappingPairs) {
    const intent = buildSearchIntent({
      tripType: "roundTrip",
      origin,
      destination,
      departureDate: exhaustiveDeparture,
      returnDate: exhaustiveReturn,
      travelers: DEFAULT_TRAVELERS,
      cabinClass: "economy",
      flexibilityDays: 0,
      currency: "CAD",
      locale,
    });
    if (!intent) continue;
    const run = await repo.search(intent);
    r3OfferCount += run.offers.length;
    for (const offer of run.offers) {
      const [outbound, inbound] = offer.itineraries;
      if (inbound.departure.epochMinutes <= outbound.arrival.epochMinutes) {
        r3ChronologyValid = false;
      }
      if (
        inbound.departure.epochMinutes <
        outbound.arrival.epochMinutes + MIN_ROUND_TRIP_TURNAROUND_MINUTES
      ) {
        r3TurnaroundValid = false;
      }
    }
  }
  ok(
    `R3. every non-overlapping demo origin/destination pair (${nonOverlappingPairs.length} pairs, ${r3OfferCount} offers) with a 1-day return gap respects chronology`,
    r3ChronologyValid,
  );
  ok(
    "R3b. every offer in the same exhaustive sweep respects the minimum turnaround",
    r3TurnaroundValid,
  );

  // --- R4. Round-trip invariants: itinerary order, count, and date preservation --------------
  ok(
    "R4. every round-trip offer still carries exactly two itineraries after the correction",
    offers.every((o) => o.itineraries.length === 2),
  );
  ok(
    "R4b. every round-trip offer's first itinerary is outbound and second is inbound",
    offers.every(
      (o) =>
        o.itineraries[0].direction === "outbound" &&
        o.itineraries[1].direction === "inbound",
    ),
  );

  // --- Correction 2: integer traveler counts --------------------------------------------------
  ok(
    "T1. fractional children is rejected",
    !isValidTravelerCounts({ ...DEFAULT_TRAVELERS, children: 1.5 }),
  );
  ok(
    "T2. fractional infantsInSeat is rejected",
    !isValidTravelerCounts({ ...DEFAULT_TRAVELERS, infantsInSeat: 0.5 }),
  );
  ok(
    "T3. fractional infantsOnLap is rejected",
    !isValidTravelerCounts({ ...DEFAULT_TRAVELERS, adults: 2, infantsOnLap: 0.5 }),
  );
  ok(
    "T4. NaN adults is rejected",
    !isValidTravelerCounts({ ...DEFAULT_TRAVELERS, adults: NaN }),
  );
  ok(
    "T5. NaN children is rejected",
    !isValidTravelerCounts({ ...DEFAULT_TRAVELERS, children: NaN }),
  );
  ok(
    "T6. Infinity adults is rejected",
    !isValidTravelerCounts({ ...DEFAULT_TRAVELERS, adults: Infinity }),
  );
  ok(
    "T7. Infinity infantsInSeat is rejected",
    !isValidTravelerCounts({ ...DEFAULT_TRAVELERS, infantsInSeat: Infinity }),
  );
  ok(
    "T8. a fully valid traveler count is still accepted",
    isValidTravelerCounts({
      adults: 2,
      children: 1,
      infantsInSeat: 1,
      infantsOnLap: 1,
    }),
  );
  ok(
    "T9. buildSearchIntent rejects fractional children end-to-end",
    buildSearchIntent({
      tripType: "oneWay",
      origin: ymq,
      destination: lhr,
      departureDate: departure,
      returnDate: null,
      travelers: { ...DEFAULT_TRAVELERS, children: 1.5 },
      cabinClass: "economy",
      flexibilityDays: 0,
      currency: "CAD",
      locale,
    }) === null,
  );
  ok(
    "T10. buildSearchIntent rejects Infinity infantsOnLap end-to-end",
    buildSearchIntent({
      tripType: "oneWay",
      origin: ymq,
      destination: lhr,
      departureDate: departure,
      returnDate: null,
      travelers: { ...DEFAULT_TRAVELERS, adults: 2, infantsOnLap: Infinity },
      cabinClass: "economy",
      flexibilityDays: 0,
      currency: "CAD",
      locale,
    }) === null,
  );

  // --- Correction 3: locale-number formatting for TravelersControl-shaped values --------------
  // The exact kind of value TravelersControl and its summary format: a small
  // traveler count, in each of the four shipped locales.
  // Compared against the exact resolved tags `formatLocaleNumber` delegates
  // to internally (`formattingLocale`) — matching the same pattern as check 25b.
  const travelerCountSample = 4;
  check(
    "T11. locale-number formatting for a traveler count matches Intl for en",
    formatLocaleNumber(travelerCountSample, "en"),
    new Intl.NumberFormat("en-CA").format(travelerCountSample),
  );
  check(
    "T12. locale-number formatting for a traveler count matches Intl for fr",
    formatLocaleNumber(travelerCountSample, "fr"),
    new Intl.NumberFormat("fr-CA").format(travelerCountSample),
  );
  check(
    "T13. locale-number formatting for a traveler count matches Intl for fa",
    formatLocaleNumber(travelerCountSample, "fa"),
    new Intl.NumberFormat("fa-IR-u-ca-gregory").format(travelerCountSample),
  );
  check(
    "T14. locale-number formatting for a traveler count matches Intl for ar",
    formatLocaleNumber(travelerCountSample, "ar"),
    new Intl.NumberFormat("ar-u-ca-gregory").format(travelerCountSample),
  );
  ok(
    "T15. Persian traveler-count digits differ from plain ASCII",
    formatLocaleNumber(travelerCountSample, "fa") !== String(travelerCountSample),
  );

  const total = passed + failures.length;
  if (failures.length > 0) {
    console.error(
      `\nFlight verification FAILED — ${failures.length} of ${total}\n`,
    );
    for (const failure of failures) console.error(`  ✗ ${failure}\n`);
    process.exit(1);
  }

  console.log(`Flight verification passed — ${passed}/${total} checks`);
}

main().catch((error: unknown) => {
  console.error("Flight verification crashed:", error);
  process.exit(1);
});
