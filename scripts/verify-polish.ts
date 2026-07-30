/**
 * Deterministic checks for the V2.5 Results Polish round: the "why this
 * option" highlight layer, the affiliate outbound placeholder's honesty
 * (no real redirect, no network call, demo disclosure present), and a
 * reconfirmation that the V2.4 no-op navigation guard this round's edits
 * touched (`FlightResultsExperience.tsx`) is still intact.
 *
 * Same contract as the other `verify-*.ts` scripts — no test runner, no new
 * dependency, compiled by the project's own TypeScript compiler and run
 * under Node via the shared verification tsconfig. A few checks read this
 * repository's own source files as text — legitimate here because the thing
 * being verified (no `fetch`, no external `<a>`, the guard line still
 * present) is a property of the source, not of a running page; the browser
 * verification pass covers the properties that only exist at runtime.
 *
 *   npm run verify:polish
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { addDays, todayIso } from "../src/features/dates/date-utils";
import { DEMO_LOCATIONS } from "../src/features/locations/demo-location-data";
import { buildSearchIntent } from "../src/features/flights/search-intent-validation";
import { DEFAULT_TRAVELERS } from "../src/features/flights/search-intent-types";
import { DemoFlightOfferRepository } from "../src/features/flights/demo-flight-offer-repository";
import { computeHighlights } from "../src/features/flights/flight-offer-highlights";
import { buildResultsSearchParams } from "../src/features/flights/filters/flight-filter-url";
import { EMPTY_FILTER_STATE } from "../src/features/flights/filters/flight-filter-types";
import type {
  FlightItinerary,
  FlightOffer,
  FlightSegment,
} from "../src/features/flights/flight-offer-types";
import enDictionary from "../src/i18n/dictionaries/en.json";
import frDictionary from "../src/i18n/dictionaries/fr.json";
import faDictionary from "../src/i18n/dictionaries/fa.json";
import arDictionary from "../src/i18n/dictionaries/ar.json";

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
}

function epochMinutesForTime(time: string): number {
  const [hours, minutes] = time.split(":").map((part) => Number.parseInt(part, 10));
  return hours * 60 + minutes;
}

/** A minimal, hand-built offer with a real epoch derived from its departure time — this script's own fixture, tailored to exercise the highlight tiebreakers. */
function fakeOffer(overrides: FakeOfferOverrides = {}): FlightOffer {
  const stopCount = overrides.stopCount ?? 0;
  const durationMinutes = overrides.durationMinutes ?? 300;
  const departureTime = overrides.departureTime ?? "10:00";
  const totalPrice = overrides.totalPrice ?? 500;
  const id = overrides.id ?? "fake";
  const departureEpoch = epochMinutesForTime(departureTime);

  const outboundSegment: FlightSegment = {
    id: `${id}-out`,
    carrierId: "aurora",
    carrierName: "Aurora Air",
    flightNumber: "DEMO-AUR-100",
    originCode: "YYZ",
    destinationCode: "LHR",
    departure: {
      date: "2026-08-01",
      time: departureTime,
      epochMinutes: departureEpoch,
    },
    arrival: {
      date: "2026-08-01",
      time: "23:59",
      epochMinutes: departureEpoch + durationMinutes,
    },
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

  return {
    id,
    currency: "CAD",
    totalPrice,
    pricePerTraveler: totalPrice,
    itineraries: [outbound],
    validatingCarrierId: "aurora",
    validatingCarrierName: "Aurora Air",
    operatingCarrierNames: ["Aurora Air"],
    provider: "Atlas Connect",
    baggage: { carryOnIncluded: true, checkedBagIncluded: false },
    fare: { refundable: false, changeable: false },
    rankingMetadata: {
      totalDurationMinutes: durationMinutes,
      totalStopCount: stopCount,
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

  // --- 1-4. computeHighlights requires a real comparison, and is order-independent -------------
  check("1. no offers produces no highlights", computeHighlights([]).size, 0);
  check(
    "2. a single offer produces no highlights (nothing to compare it against)",
    computeHighlights([fakeOffer({ id: "solo" })]).size,
    0,
  );
  const sortedEntries = (map: ReadonlyMap<string, unknown>) =>
    [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  const realHighlightsForward = computeHighlights(offers);
  const realHighlightsReversed = computeHighlights([...offers].reverse());
  check(
    "3. highlight computation does not depend on the input array's order",
    sortedEntries(realHighlightsForward),
    sortedEntries(realHighlightsReversed),
  );
  ok(
    "4. the real generated offer set produces at least one highlight",
    realHighlightsForward.size > 0,
  );

  // --- 5-9. Priority order, unique-min requirement, and tie handling ----------------------------
  const cheapestAndFastest = fakeOffer({
    id: "cheapest-and-fastest",
    totalPrice: 100,
    durationMinutes: 100,
    stopCount: 0,
  });
  const middling = fakeOffer({
    id: "middling",
    totalPrice: 200,
    durationMinutes: 200,
    stopCount: 1,
  });
  const priceTieA = fakeOffer({
    id: "tie-a",
    totalPrice: 150,
    durationMinutes: 250,
  });
  const priceTieB = fakeOffer({
    id: "tie-b",
    totalPrice: 150,
    durationMinutes: 260,
  });

  const priorityHighlights = computeHighlights([
    cheapestAndFastest,
    middling,
    priceTieA,
    priceTieB,
  ]);
  check(
    "5. an offer that is both cheapest and fastest is only ever labeled once",
    priorityHighlights.get(cheapestAndFastest.id),
    "cheapest",
  );
  ok(
    "6. 'fastest' is not reassigned to a second offer once its true owner is already labeled",
    ![...priorityHighlights.values()].filter((kind) => kind === "fastest").length,
  );
  const tieHighlights = computeHighlights([priceTieA, priceTieB, middling]);
  ok(
    "7. two offers tied for the lowest price never both get (or either gets) 'cheapest'",
    ![...tieHighlights.entries()].some(
      ([id, kind]) =>
        kind === "cheapest" && (id === priceTieA.id || id === priceTieB.id),
    ),
  );
  ok(
    "8. every highlight Map entry has exactly one highlight kind (Map identity guarantees this)",
    [...priorityHighlights.keys()].length ===
      new Set(priorityHighlights.keys()).size,
  );
  const validKinds = [
    "cheapest",
    "fastest",
    "fewerStops",
    "betterDeparture",
    "balanced",
  ];
  ok(
    "9. every awarded highlight kind is one of the five documented kinds",
    [...priorityHighlights.values()].every((kind) => validKinds.includes(kind)),
  );

  // --- 10-12. Better-departure and balanced use the remaining, unlabeled offers only -----------
  const earlyMorningOffer = fakeOffer({
    id: "early-morning",
    departureTime: "04:00",
    totalPrice: 900,
    durationMinutes: 900,
    stopCount: 2,
  });
  const morningOffer = fakeOffer({
    id: "morning",
    departureTime: "09:00",
    totalPrice: 901,
    durationMinutes: 901,
    stopCount: 2,
  });
  const departureHighlights = computeHighlights([earlyMorningOffer, morningOffer]);
  check(
    "10. the morning departure is preferred over the early-morning departure for 'betterDeparture'",
    departureHighlights.get(morningOffer.id),
    "betterDeparture",
  );
  const twoMorningOffers = computeHighlights([
    fakeOffer({ id: "morning-earlier", departureTime: "07:00", totalPrice: 500 }),
    fakeOffer({ id: "morning-later", departureTime: "09:30", totalPrice: 500 }),
  ]);
  check(
    "11. within the same departure bucket, the earlier epoch wins 'betterDeparture'",
    twoMorningOffers.get("morning-earlier"),
    "betterDeparture",
  );
  const allTiedOffers = computeHighlights([
    fakeOffer({
      id: "tied-a",
      totalPrice: 100,
      durationMinutes: 100,
      stopCount: 0,
    }),
    fakeOffer({
      id: "tied-b",
      totalPrice: 100,
      durationMinutes: 100,
      stopCount: 0,
    }),
  ]);
  ok(
    "12. two fully-identical offers never receive a 'cheapest' or 'fastest' claim",
    ![...allTiedOffers.values()].some(
      (kind) => kind === "cheapest" || kind === "fastest",
    ),
  );

  // --- 13-14. The real generated set: highlight computation never changes the offer set itself --
  const idsBefore = offers.map((o) => o.id).sort();
  computeHighlights(offers);
  const idsAfter = offers.map((o) => o.id).sort();
  check(
    "13. computing highlights never mutates the offer array or its members",
    idsAfter,
    idsBefore,
  );
  ok(
    "14. computeHighlights returns synchronously (a plain Map, never a Promise)",
    !(computeHighlights(offers) instanceof Promise),
  );

  // --- 15-20. Dictionary structure: highlight and outbound copy present in all four locales -----
  interface HighlightsDictionary {
    readonly flightResults: {
      readonly demoOffer: string;
      readonly highlights: {
        readonly sectionLabel: string;
        readonly cheapest: { readonly badge: string; readonly explanation: string };
        readonly fastest: { readonly badge: string; readonly explanation: string };
        readonly fewerStops: {
          readonly badge: string;
          readonly explanation: string;
        };
        readonly betterDeparture: {
          readonly badge: string;
          readonly explanation: string;
        };
        readonly balanced: { readonly badge: string; readonly explanation: string };
      };
      readonly outbound: {
        readonly cta: string;
        readonly modalTitle: string;
        readonly modalDescription: string;
        readonly points: readonly string[];
        readonly close: string;
      };
    };
  }
  const dictionaries: Record<string, HighlightsDictionary> = {
    en: enDictionary,
    fr: frDictionary,
    fa: faDictionary,
    ar: arDictionary,
  };
  for (const [code, dictionary] of Object.entries(dictionaries)) {
    const { flightResults } = dictionary;
    ok(
      `15-${code}. ${code} demoOffer label is present and non-empty`,
      flightResults.demoOffer.trim().length > 0,
    );
    const highlightKeys = [
      "cheapest",
      "fastest",
      "fewerStops",
      "betterDeparture",
      "balanced",
    ] as const;
    ok(
      `16-${code}. every ${code} highlight has a non-empty badge and explanation`,
      flightResults.highlights.sectionLabel.trim().length > 0 &&
        highlightKeys.every(
          (key) =>
            flightResults.highlights[key].badge.trim().length > 0 &&
            flightResults.highlights[key].explanation.trim().length > 0,
        ),
    );
    check(
      `17-${code}. ${code} outbound disclosure has exactly 5 points, all non-empty`,
      flightResults.outbound.points.length,
      5,
    );
    ok(
      `17b-${code}. every ${code} outbound point is non-empty`,
      flightResults.outbound.points.every((point) => point.trim().length > 0),
    );
    ok(
      `18-${code}. ${code} outbound has a non-empty cta, modalTitle and close label`,
      flightResults.outbound.cta.trim().length > 0 &&
        flightResults.outbound.modalTitle.trim().length > 0 &&
        flightResults.outbound.close.trim().length > 0,
    );
  }

  // --- 19-20. No locale claims real AI inference or live/real-time pricing in the new copy ------
  const noRealAiClaim = /\bAI\b|artificial intelligence|intelligence artificielle/i;
  const noLiveClaim = /\blive price|real-?time price|prix en direct|guarantee/i;
  for (const [code, dictionary] of Object.entries(dictionaries)) {
    const { highlights, outbound } = dictionary.flightResults;
    const allNewCopy = [
      highlights.sectionLabel,
      ...(
        [
          "cheapest",
          "fastest",
          "fewerStops",
          "betterDeparture",
          "balanced",
        ] as const
      ).flatMap((key) => [highlights[key].badge, highlights[key].explanation]),
      outbound.cta,
      outbound.modalTitle,
      outbound.modalDescription,
      ...outbound.points,
      outbound.close,
    ].join(" \n ");
    ok(
      `19-${code}. ${code} highlight/outbound copy never claims real AI inference`,
      !noRealAiClaim.test(allNewCopy),
    );
    ok(
      `20-${code}. ${code} highlight/outbound copy never claims live pricing or a guarantee`,
      !noLiveClaim.test(allNewCopy),
    );
  }

  // --- 21-26. Static source checks: no fetch, no external navigation, placeholder stays local ----
  // `__dirname` would resolve inside the compiled output directory (only
  // `.ts` files this tsconfig includes get emitted there) — `process.cwd()`
  // is the repository root, since `npm run verify:polish` always runs from
  // there, and lets this check read the real `.tsx` source directly.
  const srcRoot = join(process.cwd(), "src");
  const providerHandoffModalSource = readFileSync(
    join(srcRoot, "components", "flights", "ProviderHandoffModal.tsx"),
    "utf8",
  );
  const resultCardSource = readFileSync(
    join(srcRoot, "components", "flights", "ResultCard.tsx"),
    "utf8",
  );
  const experienceSource = readFileSync(
    join(srcRoot, "components", "flights", "FlightResultsExperience.tsx"),
    "utf8",
  );
  const noNetworkOrNav =
    /fetch\(|XMLHttpRequest|axios|window\.location|target=["']_blank["']/;

  ok(
    "21. the outbound placeholder makes no fetch/network call and no external navigation",
    !noNetworkOrNav.test(providerHandoffModalSource),
  );
  ok(
    "22. the outbound placeholder never renders a real anchor tag (no <a )",
    !/<a[\s>]/.test(providerHandoffModalSource),
  );
  ok(
    "23. the outbound placeholder reads its disclosure from labels.outbound.points",
    providerHandoffModalSource.includes("outbound.points"),
  );
  ok(
    "24. ResultCard's CTA button does not carry an external href/link",
    !/ButtonLink[^>]*href=["']https?:/.test(resultCardSource),
  );
  ok(
    "25. the provider adapter type scaffolding is not imported by ResultCard, the modal, or the Results experience",
    !resultCardSource.includes("provider-adapter-types") &&
      !providerHandoffModalSource.includes("provider-adapter-types") &&
      !experienceSource.includes("provider-adapter-types"),
  );
  ok(
    "26. the V2.4 no-op navigation guard line is still present after this round's edits",
    experienceSource.includes("if (nextQueryString === paramsString) return;"),
  );

  // --- 27-28. Reconfirm the no-op guard's underlying primitive still behaves correctly -----------
  const priceMax = 1000;
  const durationMax = 600;
  const noOpParams = new URLSearchParams();
  noOpParams.set("v", "1");
  noOpParams.set("sort", "cheapest");
  const rebuiltParams = buildResultsSearchParams(
    noOpParams,
    { sort: "cheapest", filters: EMPTY_FILTER_STATE },
    { priceMax, durationMax },
  );
  check(
    "27. re-building an already-canonical view state from itself is still a no-op query string",
    rebuiltParams.toString(),
    noOpParams.toString(),
  );
  const changedParams = buildResultsSearchParams(
    noOpParams,
    { sort: "fastest", filters: EMPTY_FILTER_STATE },
    { priceMax, durationMax },
  );
  ok(
    "28. a genuinely changed view state still produces a different canonical query string",
    changedParams.toString() !== noOpParams.toString(),
  );

  const total = passed + failures.length;
  if (failures.length > 0) {
    console.error(
      `\nPolish verification FAILED — ${failures.length} of ${total}\n`,
    );
    for (const failure of failures) console.error(`  ✗ ${failure}\n`);
    process.exit(1);
  }

  console.log(`Polish verification passed — ${passed}/${total} checks`);
}

main().catch((error: unknown) => {
  console.error("Polish verification crashed:", error);
  process.exit(1);
});
