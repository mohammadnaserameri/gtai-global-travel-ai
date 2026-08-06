import type {
  LocationGroup,
  LocationGroupId,
  LocationMatch,
  LocationMatchTier,
  LocationSearchRequest,
  LocationSearchResponse,
  TravelLocation,
} from "./location-types";
import {
  DEMO_LOCATIONS,
  DEMO_POPULAR_IDS,
  EVERYWHERE_LOCATION,
} from "./demo-location-data";

/** Default number of selectable rows returned for a typed query. */
export const DEFAULT_RESULT_LIMIT = 10;

const DIACRITICS = /[̀-ͯ]/g;
/** Zero-width non-joiner and friends, common in Persian input. */
const ZERO_WIDTH = /[​-‏⁠﻿]/g;

/**
 * Folds a string into a comparable form: lower-cased, diacritic-free,
 * whitespace-collapsed, with Arabic/Persian letter variants unified so that
 * "تهران" typed with either kaf or ya variant still matches.
 */
export function foldQuery(value: string): string {
  return value
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replace(ZERO_WIDTH, "")
    .replace(/[يی]/g, "ي")
    .replace(/[كک]/g, "ك")
    .replace(/[أإآا]/g, "ا")
    .replace(/[ة]/g, "ه")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Every string a location can be matched against, already folded. */
interface SearchableFields {
  readonly displayName: string;
  readonly cityName: string;
  readonly cityCode: string;
  readonly iataCode: string;
  readonly countryName: string;
  readonly airportCodes: readonly string[];
  readonly extras: readonly string[];
}

const fieldCache = new Map<string, SearchableFields>();

function fieldsFor(location: TravelLocation): SearchableFields {
  const cached = fieldCache.get(location.id);
  if (cached) return cached;

  const fields: SearchableFields = {
    displayName: foldQuery(location.displayName),
    cityName: foldQuery(location.cityName),
    cityCode: foldQuery(location.cityCode ?? ""),
    iataCode: foldQuery(location.iataCode ?? ""),
    countryName: foldQuery(location.countryName),
    airportCodes: location.airportCodes.map(foldQuery),
    extras: [
      ...location.aliases.map(foldQuery),
      ...Object.values(location.localizedNames).map(foldQuery),
      ...Object.values(location.localizedCityNames).map(foldQuery),
      ...Object.values(location.localizedCountryNames).map(foldQuery),
    ].filter(Boolean),
  };

  fieldCache.set(location.id, fields);
  return fields;
}

/** Bounded Levenshtein distance with an early length rejection. */
function editDistanceWithin(
  query: string,
  candidate: string,
  maximum: number,
): boolean {
  if (Math.abs(query.length - candidate.length) > maximum) return false;

  let previous = Array.from({ length: candidate.length + 1 }, (_, i) => i);
  for (let row = 1; row <= query.length; row += 1) {
    const current = [row];
    let rowMinimum = row;
    for (let column = 1; column <= candidate.length; column += 1) {
      const cost = query[row - 1] === candidate[column - 1] ? 0 : 1;
      const value = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + cost,
      );
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > maximum) return false;
    previous = current;
  }

  return previous[candidate.length] <= maximum;
}

function isConservativeFuzzyMatch(
  query: string,
  fields: SearchableFields,
): boolean {
  if (query.length < 3) return false;
  const maximum = query.length <= 4 ? 1 : query.length <= 8 ? 2 : 3;
  const candidates = [
    fields.displayName,
    fields.cityName,
    fields.cityCode,
    fields.iataCode,
    fields.countryName,
    ...fields.airportCodes,
    ...fields.extras,
  ].filter((value) => value.length >= 3);

  return candidates.some((candidate) =>
    editDistanceWithin(query, candidate, maximum),
  );
}

/**
 * Scores one location against a folded query.
 *
 * The tier deliberately depends on *which* field matched, not just whether
 * something did. That is what makes "montreal" surface the city's all-airports
 * entity above its member airports, while "yul" surfaces the airport first —
 * the behaviour required by blueprint §16 and §18.
 */
function matchTier(
  location: TravelLocation,
  query: string,
): LocationMatchTier | null {
  const f = fieldsFor(location);
  const isAirport = location.entityType === "AIRPORT";
  const isCity = location.entityType === "CITY_ALL_AIRPORTS";

  if (isAirport && f.iataCode && f.iataCode === query) return 1;
  if (isCity && f.cityCode && f.cityCode === query) return 2;
  if (isCity && f.cityName === query) return 3;
  if (isAirport && f.displayName === query) return 4;

  if (f.displayName.startsWith(query)) return 5;
  if (isCity && f.cityName.startsWith(query)) return 5;

  // A member code or the parent city name identifies the entity only
  // indirectly, so it always ranks below a direct identity match.
  if (isCity && f.airportCodes.some((code) => code === query)) return 6;
  if (isAirport && f.cityName === query) return 6;
  if (f.extras.some((extra) => extra.startsWith(query))) return 6;

  if (f.displayName.includes(query)) return 7;
  if (f.cityName.includes(query)) return 7;
  if (f.countryName.includes(query)) return 7;
  if (f.extras.some((extra) => extra.includes(query))) return 7;

  if (isConservativeFuzzyMatch(query, f)) return 8;

  return null;
}

function compareMatches(a: LocationMatch, b: LocationMatch): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.tier === 8 && a.location.entityType !== b.location.entityType) {
    if (a.location.entityType === "CITY_ALL_AIRPORTS") return -1;
    if (b.location.entityType === "CITY_ALL_AIRPORTS") return 1;
  }
  if (a.location.popularity !== b.location.popularity) {
    return a.location.popularity - b.location.popularity;
  }
  return a.location.displayName.localeCompare(b.location.displayName);
}

/** Ranked matches for a folded query, before grouping or limiting. */
export function rankLocations(
  query: string,
  candidates: readonly TravelLocation[] = DEMO_LOCATIONS,
): readonly LocationMatch[] {
  const folded = foldQuery(query);
  if (!folded) return [];

  const matches: LocationMatch[] = [];
  for (const location of candidates) {
    const tier = matchTier(location, folded);
    if (tier !== null) matches.push({ location, tier });
  }

  return matches.sort(compareMatches);
}

function group(
  id: LocationGroupId,
  locations: readonly TravelLocation[],
): LocationGroup | null {
  return locations.length > 0 ? { id, locations } : null;
}

function popularLocations(): readonly TravelLocation[] {
  const byId = new Map(DEMO_LOCATIONS.map((l) => [l.id, l]));
  return DEMO_POPULAR_IDS.map((id) => byId.get(id)).filter(
    (l): l is TravelLocation => l !== undefined,
  );
}

/** Resolves stored recent ids into entities, dropping anything unknown. */
export function resolveLocationIds(
  ids: readonly string[],
): readonly TravelLocation[] {
  const byId = new Map(DEMO_LOCATIONS.map((l) => [l.id, l]));
  if (ids.includes(EVERYWHERE_LOCATION.id)) {
    byId.set(EVERYWHERE_LOCATION.id, EVERYWHERE_LOCATION);
  }
  return ids
    .map((id) => byId.get(id))
    .filter((l): l is TravelLocation => l !== undefined);
}

/**
 * Builds the grouped suggestion list for the empty-query state.
 *
 * Everywhere is offered to the destination context only, per blueprint §23.
 */
function buildEmptyState(request: LocationSearchRequest): readonly LocationGroup[] {
  const recent = resolveLocationIds(request.recentIds ?? []);
  const recentIds = new Set(recent.map((l) => l.id));
  const popular = popularLocations().filter((l) => !recentIds.has(l.id));

  const groups = [
    request.context === "destination" && request.allowFlexibleDestination !== false
      ? group("flexible", [EVERYWHERE_LOCATION])
      : null,
    group("recent", recent),
    group("popular", popular),
  ];

  return groups.filter((g): g is LocationGroup => g !== null);
}

/**
 * Builds grouped results for a typed query.
 *
 * An exact code match is promoted into its own "Best match" group; everything
 * else is split by entity kind, with weak substring-only hits collected under
 * "Other matches". A location appears in exactly one group.
 */
function buildQueryState(
  request: LocationSearchRequest,
  limit: number,
): readonly LocationGroup[] {
  const folded = foldQuery(request.query);
  const candidates =
    request.context === "destination" && request.allowFlexibleDestination !== false
      ? [EVERYWHERE_LOCATION, ...DEMO_LOCATIONS]
      : DEMO_LOCATIONS;

  const ranked = rankLocations(request.query, candidates).slice(0, limit);
  if (ranked.length === 0) return [];

  const rest = [...ranked];
  const best: TravelLocation[] = [];

  // Exact codes and the highest-ranked conservative typo correction earn the
  // "Best match" slot. Prefix/substring matches remain grouped by entity.
  if (folded.length >= 3 && (rest[0].tier <= 2 || rest[0].tier === 8)) {
    best.push(rest.shift()!.location);
  }

  const cities: TravelLocation[] = [];
  const airports: TravelLocation[] = [];
  const other: TravelLocation[] = [];
  const flexible: TravelLocation[] = [];

  for (const match of rest) {
    if (match.location.entityType === "FLEXIBLE_DESTINATION") {
      flexible.push(match.location);
    } else if (match.tier >= 7) {
      other.push(match.location);
    } else if (match.location.entityType === "CITY_ALL_AIRPORTS") {
      cities.push(match.location);
    } else {
      airports.push(match.location);
    }
  }

  const groups = [
    group("best", best),
    group("flexible", flexible),
    group("cities", cities),
    group("airports", airports),
    group("other", other),
  ];

  return groups.filter((g): g is LocationGroup => g !== null);
}

/** Pure search entry point. The repository wraps this with async semantics. */
export function searchLocationsSync(
  request: LocationSearchRequest,
): LocationSearchResponse {
  const limit = request.limit ?? DEFAULT_RESULT_LIMIT;
  const groups = foldQuery(request.query)
    ? buildQueryState(request, limit)
    : buildEmptyState(request);

  const total = groups.reduce((sum, g) => sum + g.locations.length, 0);
  return { groups, total };
}
