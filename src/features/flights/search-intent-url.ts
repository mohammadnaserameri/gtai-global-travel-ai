import {
  SEARCH_INTENT_VERSION,
  type FlightSearchIntent,
} from "./search-intent-types";

/**
 * The complete, documented query-parameter contract for a Flight Results URL.
 *
 * Every value is a short, non-sensitive, locale-independent code — an
 * internal GTAI entity id, an ISO date, a small integer, or an enum member.
 * Nothing here is a typed query, a name, a date of birth, a coordinate or an
 * account identifier, and nothing needs the visitor's locale to be readable —
 * the same link means the same search when opened under `/fr` or `/ar`.
 *
 * `__devScenario` is deliberately **not** listed here — it is a
 * development-only escape hatch (see `FlightResultsExperience`), gated out of
 * production builds, and outside this public contract entirely: it is never
 * read, duplicate-checked or serialized by anything in this module.
 */
export const SEARCH_PARAM = {
  version: "v",
  trip: "trip",
  origin: "origin",
  destination: "destination",
  departure: "departure",
  returnDate: "return",
  adults: "adults",
  children: "children",
  infantsInSeat: "infantSeat",
  infantsOnLap: "infantLap",
  cabin: "cabin",
  flex: "flex",
  currency: "currency",
} as const;

/** Every known field name in the contract, for sanitizing a duplicated parameter. */
type KnownField = keyof typeof SEARCH_PARAM;

/**
 * Every value read as a bare string, or `null` if absent. Reading exactly one
 * value per key is not, by itself, enough to trust a repeated query key —
 * `duplicateKeys` records which known keys arrived more than once, so a
 * strict parse can reject the whole URL instead of silently picking a
 * "first" value that could differ from what a human skimming the link sees.
 * No validation happens here — that is `search-intent-validation.ts`'s job —
 * so this type is intentionally all-optional-strings rather than the shape
 * of a valid intent.
 */
export interface RawSearchIntentParams {
  readonly version: string | null;
  readonly trip: string | null;
  readonly origin: string | null;
  readonly destination: string | null;
  readonly departure: string | null;
  readonly returnDate: string | null;
  readonly adults: string | null;
  readonly children: string | null;
  readonly infantsInSeat: string | null;
  readonly infantsOnLap: string | null;
  readonly cabin: string | null;
  readonly flex: string | null;
  readonly currency: string | null;
  /** Query-string key names (e.g. `"origin"`, `"departure"`) seen more than once. */
  readonly duplicateKeys: readonly string[];
}

/** Reads a `URLSearchParams`, detecting a repeated known key via `getAll`. */
export function parseRawSearchIntentParams(
  params: URLSearchParams,
): RawSearchIntentParams {
  const duplicateKeys: string[] = [];
  const read = (key: string): string | null => {
    const all = params.getAll(key);
    if (all.length > 1) duplicateKeys.push(key);
    return all.length > 0 ? all[0] : null;
  };

  return {
    version: read(SEARCH_PARAM.version),
    trip: read(SEARCH_PARAM.trip),
    origin: read(SEARCH_PARAM.origin),
    destination: read(SEARCH_PARAM.destination),
    departure: read(SEARCH_PARAM.departure),
    returnDate: read(SEARCH_PARAM.returnDate),
    adults: read(SEARCH_PARAM.adults),
    children: read(SEARCH_PARAM.children),
    infantsInSeat: read(SEARCH_PARAM.infantsInSeat),
    infantsOnLap: read(SEARCH_PARAM.infantsOnLap),
    cabin: read(SEARCH_PARAM.cabin),
    flex: read(SEARCH_PARAM.flex),
    currency: read(SEARCH_PARAM.currency),
    duplicateKeys,
  };
}

/** Next's Server Component `searchParams` shape — a value, many values, or absent. */
export type RawSearchParamsRecord = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

/**
 * Reads the same raw fields from a plain `searchParams` record.
 *
 * A repeated key arrives as an array — recorded in `duplicateKeys` exactly
 * like the `URLSearchParams` path, so a duplicated parameter can never
 * smuggle a chosen value past validation on the server-rendered restoration
 * path either.
 */
export function rawSearchIntentParamsFromRecord(
  record: RawSearchParamsRecord,
): RawSearchIntentParams {
  const duplicateKeys: string[] = [];
  const read = (key: string): string | null => {
    const value = record[key];
    if (value === undefined) return null;
    if (typeof value === "string") return value;
    if (value.length > 1) duplicateKeys.push(key);
    return value[0] ?? null;
  };

  return {
    version: read(SEARCH_PARAM.version),
    trip: read(SEARCH_PARAM.trip),
    origin: read(SEARCH_PARAM.origin),
    destination: read(SEARCH_PARAM.destination),
    departure: read(SEARCH_PARAM.departure),
    returnDate: read(SEARCH_PARAM.returnDate),
    adults: read(SEARCH_PARAM.adults),
    children: read(SEARCH_PARAM.children),
    infantsInSeat: read(SEARCH_PARAM.infantsInSeat),
    infantsOnLap: read(SEARCH_PARAM.infantsOnLap),
    cabin: read(SEARCH_PARAM.cabin),
    flex: read(SEARCH_PARAM.flex),
    currency: read(SEARCH_PARAM.currency),
    duplicateKeys,
  };
}

/**
 * Drops any field whose query key arrived duplicated, rather than trusting
 * the arbitrary first value `parseRawSearchIntentParams` kept. Used only by
 * the **lenient** Edit-search restoration path — the strict Results parser
 * rejects a duplicated URL outright instead of sanitizing it.
 */
export function sanitizeDuplicateFields(
  raw: RawSearchIntentParams,
): RawSearchIntentParams {
  if (raw.duplicateKeys.length === 0) return raw;
  const duplicated = new Set(raw.duplicateKeys);
  const fields: Record<KnownField, string | null> = {
    version: duplicated.has(SEARCH_PARAM.version) ? null : raw.version,
    trip: duplicated.has(SEARCH_PARAM.trip) ? null : raw.trip,
    origin: duplicated.has(SEARCH_PARAM.origin) ? null : raw.origin,
    destination: duplicated.has(SEARCH_PARAM.destination) ? null : raw.destination,
    departure: duplicated.has(SEARCH_PARAM.departure) ? null : raw.departure,
    returnDate: duplicated.has(SEARCH_PARAM.returnDate) ? null : raw.returnDate,
    adults: duplicated.has(SEARCH_PARAM.adults) ? null : raw.adults,
    children: duplicated.has(SEARCH_PARAM.children) ? null : raw.children,
    infantsInSeat: duplicated.has(SEARCH_PARAM.infantsInSeat)
      ? null
      : raw.infantsInSeat,
    infantsOnLap: duplicated.has(SEARCH_PARAM.infantsOnLap)
      ? null
      : raw.infantsOnLap,
    cabin: duplicated.has(SEARCH_PARAM.cabin) ? null : raw.cabin,
    flex: duplicated.has(SEARCH_PARAM.flex) ? null : raw.flex,
    currency: duplicated.has(SEARCH_PARAM.currency) ? null : raw.currency,
  };
  return { ...fields, duplicateKeys: [] };
}

/**
 * Serializes a normalized intent back into the same parameter contract.
 *
 * Zero-valued optional traveler counts and an absent return date are omitted
 * rather than written as `0` or empty — the shortest URL that still parses
 * back to the same intent is the one worth sharing.
 */
export function serializeSearchIntent(intent: FlightSearchIntent): URLSearchParams {
  const params = new URLSearchParams();
  params.set(SEARCH_PARAM.version, String(SEARCH_INTENT_VERSION));
  params.set(SEARCH_PARAM.trip, intent.tripType);
  params.set(SEARCH_PARAM.origin, intent.origin.entityId);
  params.set(SEARCH_PARAM.destination, intent.destination.entityId);
  params.set(SEARCH_PARAM.departure, intent.departureDate);
  if (intent.tripType === "roundTrip" && intent.returnDate) {
    params.set(SEARCH_PARAM.returnDate, intent.returnDate);
  }
  params.set(SEARCH_PARAM.adults, String(intent.travelers.adults));
  if (intent.travelers.children > 0) {
    params.set(SEARCH_PARAM.children, String(intent.travelers.children));
  }
  if (intent.travelers.infantsInSeat > 0) {
    params.set(SEARCH_PARAM.infantsInSeat, String(intent.travelers.infantsInSeat));
  }
  if (intent.travelers.infantsOnLap > 0) {
    params.set(SEARCH_PARAM.infantsOnLap, String(intent.travelers.infantsOnLap));
  }
  params.set(SEARCH_PARAM.cabin, intent.cabinClass);
  params.set(SEARCH_PARAM.flex, String(intent.flexibilityDays));
  params.set(SEARCH_PARAM.currency, intent.currency);
  return params;
}
