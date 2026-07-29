/**
 * Deterministic checks for the pure location directory and ranking rules.
 *
 * Same contract as `verify-dates.ts`: no test runner, no new dependency. The
 * project's own TypeScript compiler builds it into `node_modules/.cache` and
 * Node runs it, so nothing generated lands in a tracked directory and none of
 * this ships as production code.
 *
 *   npm run verify:locations
 */

import {
  DEFAULT_RESULT_LIMIT,
  foldQuery,
  rankLocations,
  resolveLocationIds,
  searchLocationsSync,
} from "../src/features/locations/location-search";
import {
  DEMO_LOCATIONS,
  EVERYWHERE_LOCATION,
} from "../src/features/locations/demo-location-data";
import type {
  LocationGroup,
  TravelLocation,
} from "../src/features/locations/location-types";

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

/** Ids of the ranked matches for a query, best first. */
function rankedIds(query: string): readonly string[] {
  return rankLocations(query).map((match) => match.location.id);
}

function flatten(groups: readonly LocationGroup[]): readonly TravelLocation[] {
  return groups.flatMap((group) => group.locations);
}

function groupOf(groups: readonly LocationGroup[], id: string): string | undefined {
  return groups.find((group) => group.locations.some((l) => l.id === id))?.id;
}

// --- 1. Entity identity -----------------------------------------------------
check(
  "all entity ids are unique",
  new Set(DEMO_LOCATIONS.map((l) => l.id)).size,
  DEMO_LOCATIONS.length,
);
check(
  "Everywhere is not part of the directory",
  DEMO_LOCATIONS.some((l) => l.id === EVERYWHERE_LOCATION.id),
  false,
);

// --- 2. Airport IATA codes are not duplicated -------------------------------
const iataCodes = DEMO_LOCATIONS.filter((l) => l.entityType === "AIRPORT").map(
  (l) => l.iataCode,
);
check(
  "no airport IATA code is duplicated",
  new Set(iataCodes).size,
  iataCodes.length,
);
check("every airport carries an IATA code", iataCodes.includes(null), false);

// --- 3-5. Exact code queries resolve to the right entity --------------------
check("exact YUL ranks Montreal-Trudeau first", rankedIds("YUL")[0], "airport-yul");
check("exact IKA ranks Imam Khomeini first", rankedIds("IKA")[0], "airport-ika");
// THR is both Tehran's city code and Mehrabad's airport code. The airport wins:
// an exact IATA match is tier 1, an exact city code is tier 2.
check("exact THR ranks Mehrabad first", rankedIds("THR")[0], "airport-thr");

// --- 6. Tehran keeps a distinct all-airports entity -------------------------
const tehranCity = DEMO_LOCATIONS.find((l) => l.id === "city-thr");
check("Tehran all-airports entity exists", tehranCity !== undefined, true);
check(
  "Tehran all-airports is a CITY_ALL_AIRPORTS entity",
  tehranCity?.entityType,
  "CITY_ALL_AIRPORTS",
);
check(
  "Tehran all-airports is separate from Mehrabad",
  tehranCity?.id === "airport-thr",
  false,
);
check(
  "Tehran all-airports resolves to both airports",
  [...(tehranCity?.airportCodes ?? [])].sort(),
  ["IKA", "THR"],
);

// --- 7-8. General city queries put the metropolitan entity first ------------
const montreal = rankedIds("montreal");
check("general Montreal ranks YMQ first", montreal[0], "city-ymq");
check(
  "general Montreal ranks YMQ before YUL",
  montreal.indexOf("city-ymq") < montreal.indexOf("airport-yul"),
  true,
);

const london = rankedIds("london");
check("general London ranks LON first", london[0], "city-lon");
check(
  "general London ranks LON before LHR",
  london.indexOf("city-lon") < london.indexOf("airport-lhr"),
  true,
);
check(
  "general London ranks LON before LGW",
  london.indexOf("city-lon") < london.indexOf("airport-lgw"),
  true,
);

// --- 9-11. Localized queries ------------------------------------------------
check(
  "Persian تهران matches Tehran entities",
  rankedIds("تهران").includes("city-thr"),
  true,
);
check("Persian مهرآباد matches Mehrabad", rankedIds("مهرآباد")[0], "airport-thr");
check("Arabic دبي matches Dubai", rankedIds("دبي").includes("city-dxb"), true);

// --- 12. Accent-insensitive matching ---------------------------------------
check("Montréal folds to montreal", foldQuery("Montréal"), "montreal");
check(
  "accented and unaccented queries rank identically",
  rankedIds("Montréal"),
  rankedIds("Montreal"),
);

// --- 13. Unknown recent ids are dropped ------------------------------------
check(
  "unknown recent ids are dropped",
  resolveLocationIds(["city-ymq", "airport-does-not-exist", "city-lon"]).map(
    (l) => l.id,
  ),
  ["city-ymq", "city-lon"],
);
check(
  "an entirely unknown recent list resolves empty",
  resolveLocationIds(["nope"]).length,
  0,
);

// --- 14-15. Everywhere is destination-only ---------------------------------
const destinationEmpty = searchLocationsSync({
  query: "",
  context: "destination",
  locale: "en",
});
check(
  "Everywhere is offered in the destination empty state",
  groupOf(destinationEmpty.groups, EVERYWHERE_LOCATION.id),
  "flexible",
);

const originEmpty = searchLocationsSync({
  query: "",
  context: "origin",
  locale: "en",
});
check(
  "Everywhere is absent from the origin empty state",
  flatten(originEmpty.groups).some((l) => l.id === EVERYWHERE_LOCATION.id),
  false,
);

const originQuery = searchLocationsSync({
  query: "everywhere",
  context: "origin",
  locale: "en",
});
check(
  "Everywhere never appears as an origin option for a typed query",
  flatten(originQuery.groups).some((l) => l.id === EVERYWHERE_LOCATION.id),
  false,
);

// --- 16. Result limit -------------------------------------------------------
const broad = searchLocationsSync({
  query: "a",
  context: "destination",
  locale: "en",
});
check(
  "default result limit is respected",
  flatten(broad.groups).length <= DEFAULT_RESULT_LIMIT,
  true,
);
const limited = searchLocationsSync({
  query: "a",
  context: "destination",
  locale: "en",
  limit: 3,
});
check("explicit result limit is respected", flatten(limited.groups).length, 3);
check("reported total matches the rendered rows", limited.total, 3);

// --- 17. Each location appears in exactly one group ------------------------
function assertNoDuplicateGroups(
  name: string,
  groups: readonly LocationGroup[],
): void {
  const ids = flatten(groups).map((l) => l.id);
  check(name, new Set(ids).size, ids.length);
}
assertNoDuplicateGroups(
  "no duplicate rows for a city query",
  searchLocationsSync({ query: "montreal", context: "destination", locale: "en" })
    .groups,
);
assertNoDuplicateGroups(
  "no duplicate rows for a code query",
  searchLocationsSync({ query: "YUL", context: "destination", locale: "en" })
    .groups,
);
assertNoDuplicateGroups(
  "no duplicate rows in the empty state",
  destinationEmpty.groups,
);

// --- 18. Exact IATA is promoted to Best match ------------------------------
const yulGroups = searchLocationsSync({
  query: "YUL",
  context: "destination",
  locale: "en",
}).groups;
check(
  "exact IATA is grouped as Best match",
  groupOf(yulGroups, "airport-yul"),
  "best",
);
check("Best match holds exactly one row", yulGroups[0].locations.length, 1);
// A two-letter query is too short to promote, even if it matches a code prefix.
const shortGroups = searchLocationsSync({
  query: "yu",
  context: "destination",
  locale: "en",
}).groups;
check(
  "a short query does not earn a Best match slot",
  shortGroups.some((g) => g.id === "best"),
  false,
);

// --- 19. Commercial data never participates in ranking ---------------------
// `popularity` is the only ordering hint on the entity, and it is editorial.
// If an affiliate or provider field ever appears on TravelLocation, this check
// is where the ranking contract should be revisited.
const entityKeys = Object.keys(DEMO_LOCATIONS[0]).sort();
check(
  "no affiliate or provider field exists on a location entity",
  entityKeys.filter((key) =>
    /affiliate|provider|commission|deal|price|sponsor/i.test(key),
  ),
  [],
);
check(
  "ranking is stable regardless of directory order",
  rankLocations("london", [...DEMO_LOCATIONS].reverse()).map((m) => m.location.id),
  rankedIds("london"),
);

// --- 20. Query folding handles Persian/Arabic letter variants --------------
check("Persian and Arabic ya fold together", foldQuery("دبی"), foldQuery("دبي"));
check("Persian and Arabic kaf fold together", foldQuery("کاف"), foldQuery("كاف"));
check(
  "either ya variant finds Dubai",
  rankedIds("دبی").includes("city-dxb"),
  rankedIds("دبي").includes("city-dxb"),
);
check(
  "zero-width joiners are folded away",
  foldQuery("یک‌طرفه"),
  foldQuery("یکطرفه"),
);
check("case and surrounding whitespace fold away", foldQuery("  YuL  "), "yul");

// --- Report -----------------------------------------------------------------
const total = passed + failures.length;
if (failures.length > 0) {
  console.error(
    `\nLocation verification FAILED — ${failures.length} of ${total}\n`,
  );
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  process.exit(1);
}

console.log(`Location verification passed — ${passed}/${total} checks`);
