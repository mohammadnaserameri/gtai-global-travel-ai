/**
 * GTAI normalized location model.
 *
 * These entities are **provider-independent by design**. Nothing here is a
 * provider payload and no provider-specific identifier is ever the primary
 * identity — a future Provider Adapter maps a `TravelLocation` onto whatever
 * shape a supplier expects, per `docs/reference/03_AIRPORT_SELECTOR.md` §51.
 */

/** Which side of the trip a selector is filling. */
export type LocationContext = "origin" | "destination";

/**
 * Entity kinds supported in V2.1.
 *
 * `CURRENT_LOCATION_RESOLUTION` from the blueprint is deliberately absent:
 * geolocation is out of scope for this version.
 */
export type LocationEntityType =
  "CITY_ALL_AIRPORTS" | "AIRPORT" | "FLEXIBLE_DESTINATION";

/** Locale-keyed display names, e.g. `{ fa: "تهران" }`. */
export type LocalizedNames = Readonly<Record<string, string>>;

export interface TravelLocation {
  /** Stable internal id. Never a provider id. */
  readonly id: string;
  readonly entityType: LocationEntityType;
  /** Primary label in the dataset's base language. */
  readonly displayName: string;
  readonly cityName: string;
  /** City/metropolitan code such as `YMQ`. Absent for flexible destinations. */
  readonly cityCode: string | null;
  readonly countryName: string;
  /** ISO 3166-1 alpha-2. */
  readonly countryCode: string;
  /** Airport IATA code. Only set for `AIRPORT`. */
  readonly iataCode: string | null;
  /** Every airport code this entity resolves to. Empty for flexible. */
  readonly airportCodes: readonly string[];
  /** Locale-keyed names for **this** entity (a city name, or an airport name). */
  readonly localizedNames: LocalizedNames;
  /**
   * Locale-keyed names for the entity's parent city. Held separately because
   * an airport's own localized name is not its city's — without this, an
   * airport row would print its own name where the city belongs.
   */
  readonly localizedCityNames: LocalizedNames;
  /**
   * Locale-keyed names for the entity's country. Held on the entity so the UI
   * never needs a translation lookup of its own, and so a production directory
   * can supply them alongside the record.
   */
  readonly localizedCountryNames: LocalizedNames;
  readonly aliases: readonly string[];
  /** IANA time zone, or null where not applicable. */
  readonly timeZone: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly isAllAirports: boolean;
  readonly isFlexibleDestination: boolean;
  /**
   * Stable demo ordering hint — lower sorts first. This is an editorial
   * ordering of the demonstration directory, never a commercial or affiliate
   * signal.
   */
  readonly popularity: number;
}

/** Why a location matched, lowest tier ranking first. */
export type LocationMatchTier =
  | 1 // exact IATA code
  | 2 // exact city code
  | 3 // exact city name
  | 4 // exact airport name
  | 5 // display name starts with the query
  | 6 // alias, localized name, or a related city/member-code match
  | 7 // partial substring match
  | 8; // conservative typo-tolerant match

export interface LocationMatch {
  readonly location: TravelLocation;
  readonly tier: LocationMatchTier;
}

/** Result group ids. Rendered only when non-empty. */
export type LocationGroupId =
  "best" | "flexible" | "recent" | "popular" | "cities" | "airports" | "other";

export interface LocationGroup {
  readonly id: LocationGroupId;
  readonly locations: readonly TravelLocation[];
}

export interface LocationSearchRequest {
  readonly query: string;
  readonly context: LocationContext;
  readonly locale: string;
  /** Recent entity ids for this context, newest first. */
  readonly recentIds?: readonly string[];
  /** Product fields such as stays and cars do not offer "Everywhere". */
  readonly allowFlexibleDestination?: boolean;
  readonly limit?: number;
}

export interface LocationSearchResponse {
  readonly groups: readonly LocationGroup[];
  /** Total selectable rows across every returned group. */
  readonly total: number;
}

/**
 * The contract a future backend location service must satisfy. Swapping the
 * demo directory for a real repository is an implementation detail behind this
 * interface — no UI change is required.
 */
export interface LocationRepository {
  search(
    request: LocationSearchRequest,
    signal?: AbortSignal,
  ): Promise<LocationSearchResponse>;
  /** Resolves stored ids back into entities, skipping unknown ids. */
  resolveByIds(ids: readonly string[]): Promise<readonly TravelLocation[]>;
}
