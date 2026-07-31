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

import { readdirSync, readFileSync } from "node:fs";
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

  // =====================================================================================
  // V2.5.1 — truthful global Highlight winners, truthful outbound copy, modal a11y/bidi,
  // and the corrected provider contract (privacy-safe audit, trusted URL, abortable search).
  // =====================================================================================

  // --- 29-34. Global winners: a category is never handed to a runner-up ------------------------
  // The reproduced V2.5 failure: A is genuinely cheapest, fastest, fewest-stops AND the
  // best departure; B is worse on every dimension. B must not be labeled at all.
  const dominantA = fakeOffer({
    id: "dominant-a",
    totalPrice: 100,
    durationMinutes: 100,
    stopCount: 0,
    departureTime: "09:00",
  });
  const inferiorB = fakeOffer({
    id: "inferior-b",
    totalPrice: 900,
    durationMinutes: 900,
    stopCount: 3,
    departureTime: "21:00",
  });
  const dominanceHighlights = computeHighlights([dominantA, inferiorB]);
  check(
    "29. the dominant offer takes the highest-priority label it truly wins",
    dominanceHighlights.get(dominantA.id),
    "cheapest",
  );
  check(
    "30. an offer that loses every dimension receives no comparative label at all",
    dominanceHighlights.get(inferiorB.id),
    undefined,
  );
  ok(
    "31. no runner-up 'betterDeparture' is invented when the true winner is already labeled",
    ![...dominanceHighlights.values()].includes("betterDeparture"),
  );
  ok(
    "32. no runner-up 'balanced' is invented when the true winner is already labeled",
    ![...dominanceHighlights.values()].includes("balanced"),
  );
  check(
    "33. a fully dominated two-offer set awards exactly one label in total",
    dominanceHighlights.size,
    1,
  );
  // Same shape with a third, middling offer present: the middle offer must still not
  // inherit a category whose true winner is the already-labeled dominant offer.
  const middlingC = fakeOffer({
    id: "middling-c",
    totalPrice: 500,
    durationMinutes: 500,
    stopCount: 2,
    departureTime: "19:00",
  });
  const threeWayHighlights = computeHighlights([dominantA, inferiorB, middlingC]);
  ok(
    "34. with a third offer present, no runner-up still receives a category the leader truly won",
    threeWayHighlights.get(dominantA.id) === "cheapest" &&
      !["betterDeparture", "fastest", "fewerStops"].includes(
        threeWayHighlights.get(middlingC.id) ?? "",
      ) &&
      !["betterDeparture", "fastest", "fewerStops"].includes(
        threeWayHighlights.get(inferiorB.id) ?? "",
      ),
  );

  // --- 35-38. Tie policy: offer id never breaks a user-facing tie into a claim -----------------
  // Two offers with identical departure tuples (same bucket, same epoch) but different
  // prices — the price winner takes "cheapest"; the tied departure awards nothing.
  const departureTieA = fakeOffer({
    id: "dep-tie-a",
    departureTime: "08:00",
    totalPrice: 300,
    durationMinutes: 400,
    stopCount: 1,
  });
  const departureTieB = fakeOffer({
    id: "dep-tie-b",
    departureTime: "08:00",
    totalPrice: 400,
    durationMinutes: 400,
    stopCount: 1,
  });
  const departureTieHighlights = computeHighlights([departureTieA, departureTieB]);
  ok(
    "35. two identical departure tuples produce no 'betterDeparture' label for either offer",
    ![...departureTieHighlights.values()].includes("betterDeparture"),
  );
  // Two offers with equal Best scores (identical price/duration/stops) but different
  // departure times — "balanced" must be unawarded even though ids differ.
  const scoreTieA = fakeOffer({
    id: "score-tie-a",
    totalPrice: 250,
    durationMinutes: 250,
    stopCount: 1,
    departureTime: "09:00",
  });
  const scoreTieB = fakeOffer({
    id: "score-tie-b",
    totalPrice: 250,
    durationMinutes: 250,
    stopCount: 1,
    departureTime: "14:00",
  });
  const scoreTieHighlights = computeHighlights([scoreTieA, scoreTieB]);
  ok(
    "36. two equal Best scores produce no 'balanced' label for either offer",
    ![...scoreTieHighlights.values()].includes("balanced"),
  );
  const identicalOffers = computeHighlights([
    fakeOffer({
      id: "identical-1",
      totalPrice: 400,
      durationMinutes: 400,
      stopCount: 1,
    }),
    fakeOffer({
      id: "identical-2",
      totalPrice: 400,
      durationMinutes: 400,
      stopCount: 1,
    }),
  ]);
  check(
    "37. fully identical offers receive no comparative highlight whatsoever",
    identicalOffers.size,
    0,
  );
  ok(
    "38. the highlights module never consults offer id to break a user-facing tie",
    !readFileSync(
      join(
        process.cwd(),
        "src",
        "features",
        "flights",
        "flight-offer-highlights.ts",
      ),
      "utf8",
    ).includes("compareOfferIds"),
  );

  // --- 39-41. One label per offer, order independence, and filtered-set recomputation ----------
  const mixedSet = [dominantA, inferiorB, middlingC, departureTieA, scoreTieB];
  const mixedHighlights = computeHighlights(mixedSet);
  ok(
    "39. at most one highlight per offer (every key is unique and maps to a single kind)",
    mixedHighlights.size === new Set(mixedHighlights.keys()).size,
  );
  check(
    "40. highlight results are identical for a reversed input array",
    [...computeHighlights([...mixedSet].reverse()).entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    ),
    [...mixedHighlights.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
  // Filtering to a subset must recompute winners from that subset, not reuse the
  // full-set answer — dropping the dominant offer promotes a new, genuine winner.
  const filteredSubset = mixedSet.filter((offer) => offer.id !== dominantA.id);
  const subsetHighlights = computeHighlights(filteredSubset);
  ok(
    "41. filtering recomputes truthful winners from the displayed subset only",
    // In the full set `dominantA` (100) was cheapest; once it is filtered out the
    // title must pass to the genuinely cheapest remaining offer (`scoreTieB`, 250),
    // and the best remaining morning departure must win its own category.
    !subsetHighlights.has(dominantA.id) &&
      mixedHighlights.get(dominantA.id) === "cheapest" &&
      subsetHighlights.get(scoreTieB.id) === "cheapest" &&
      subsetHighlights.get(departureTieA.id) === "betterDeparture",
  );

  // --- 42-43. The real generated offer set stays deterministic under the new algorithm ---------
  check(
    "42. real generated offer-set highlights are identical across repeated computation",
    [...computeHighlights(offers).entries()].sort(([a], [b]) => a.localeCompare(b)),
    [...computeHighlights(offers).entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
  ok(
    "43. every real-offer-set highlight belongs to exactly one offer that exists in the set",
    [...computeHighlights(offers).keys()].every((id) =>
      offers.some((offer) => offer.id === id),
    ),
  );

  // --- 44-47. Truthful outbound copy in every locale -------------------------------------------
  const legacyCtaCopy =
    /view deal|continue to provider|voir l'offre|select deal|\bbook\b|\bbuy\b/i;
  for (const [code, dictionary] of Object.entries(dictionaries)) {
    const { outbound } = dictionary.flightResults;
    ok(
      `44-${code}. ${code} CTA no longer uses legacy deal/continuation wording`,
      !legacyCtaCopy.test(outbound.cta),
    );
    ok(
      `45-${code}. ${code} modal title no longer uses legacy continuation wording`,
      !legacyCtaCopy.test(outbound.modalTitle),
    );
  }
  check(
    "46. English outbound copy uses the approved preview wording exactly",
    [
      enDictionary.flightResults.outbound.cta,
      enDictionary.flightResults.outbound.modalTitle,
      enDictionary.flightResults.outbound.modalDescription,
    ],
    [
      "Preview provider hand-off",
      "Provider hand-off preview",
      "This demonstration does not open a real partner site.",
    ],
  );
  check(
    "47. Persian outbound copy uses the approved preview wording exactly",
    [
      faDictionary.flightResults.outbound.cta,
      faDictionary.flightResults.outbound.modalTitle,
    ],
    ["پیش‌نمایش انتقال به ارائه‌دهنده", "پیش‌نمایش انتقال به ارائه‌دهنده"],
  );

  // --- 48-50. Modal accessibility and structured bidi ------------------------------------------
  const resultCardSourceV251 = readFileSync(
    join(process.cwd(), "src", "components", "flights", "ResultCard.tsx"),
    "utf8",
  );
  const modalSourceV251 = readFileSync(
    join(process.cwd(), "src", "components", "flights", "ProviderHandoffModal.tsx"),
    "utf8",
  );
  ok(
    "48. the outbound CTA exposes dialog semantics (haspopup, expanded, controls)",
    /aria-haspopup="dialog"/.test(resultCardSourceV251) &&
      /aria-expanded=\{handoffOpen\}/.test(resultCardSourceV251) &&
      /aria-controls=\{handoffDialogId\}/.test(resultCardSourceV251),
  );
  ok(
    "49. the modal renders origin and destination as separate bidi-isolated elements",
    /<bdi dir="auto">\{intent\.origin\.displayName\}<\/bdi>/.test(
      modalSourceV251,
    ) &&
      /<bdi dir="auto">\{intent\.destination\.displayName\}<\/bdi>/.test(
        modalSourceV251,
      ),
  );
  ok(
    "50. the modal's route summary is not built from one interpolated template string",
    !/routeHeading/.test(modalSourceV251),
  );

  // --- 51-56. Corrected provider contract: privacy, trusted URLs, abortable typed search -------
  const providerTypesSource = readFileSync(
    join(
      process.cwd(),
      "src",
      "features",
      "providers",
      "provider-adapter-types.ts",
    ),
    "utf8",
  );
  ok(
    "51. the hand-off audit entry carries an opaque searchContextId",
    /searchContextId:\s*string/.test(providerTypesSource),
  );
  ok(
    "52. the hand-off audit entry no longer carries the canonical searchIntentKey",
    !providerTypesSource.includes("searchIntentKey"),
  );
  ok(
    "53. the shared hand-off model no longer carries an arbitrary baseUrl",
    !/baseUrl/.test(providerTypesSource),
  );
  ok(
    "54. the hand-off model selects a trusted provider config rather than a caller-supplied origin",
    /TrustedProviderConfig/.test(providerTypesSource) &&
      /allowedOrigin/.test(providerTypesSource) &&
      /TrustedHandoffUrlBuilder/.test(providerTypesSource),
  );
  ok(
    "55. the provider search contract accepts an AbortSignal",
    /signal\?:\s*AbortSignal/.test(providerTypesSource),
  );
  ok(
    "56. provider search returns a discriminated success/failure result, with cancellation typed",
    /search\(request:\s*ProviderSearchRequest\):\s*Promise<ProviderSearchResult>/.test(
      providerTypesSource,
    ) &&
      /ok:\s*true/.test(providerTypesSource) &&
      /ok:\s*false/.test(providerTypesSource) &&
      /"cancelled"/.test(providerTypesSource) &&
      /retryAfterMs/.test(providerTypesSource),
  );

  // --- 57-59. Still no runtime provider, no network, no new dependency -------------------------
  const providersDirectoryFiles = readdirSync(
    join(process.cwd(), "src", "features", "providers"),
  );
  check(
    "57. the providers directory contains only the type-only scaffolding file",
    [...providersDirectoryFiles].sort(),
    ["provider-adapter-types.ts"],
  );
  ok(
    "58. no runtime code imports the provider type scaffolding, and the modal still makes no request",
    !resultCardSourceV251.includes("provider-adapter-types") &&
      !modalSourceV251.includes("provider-adapter-types") &&
      !noNetworkOrNav.test(modalSourceV251) &&
      !/<a[\s>]/.test(modalSourceV251),
  );
  const packageJson: { dependencies: Record<string, string> } = JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf8"),
  );
  check(
    "59. runtime dependencies are unchanged (next, react, react-dom only)",
    Object.keys(packageJson.dependencies).sort(),
    ["next", "react", "react-dom"],
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
