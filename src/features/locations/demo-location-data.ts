import type { TravelLocation } from "@/features/locations/location-types";
import { countryNamesFor } from "@/features/locations/country-names";

/**
 * GTAI demonstration location directory.
 *
 * This is a small, hand-authored set covering GTAI's home market plus a
 * selection of international hubs. It exists so the Airport Selector can be
 * built and verified against real structured entities.
 *
 * It is **not** a global airport dataset and makes no claim of worldwide
 * coverage. A licensed, versioned production directory replaces it later —
 * see `docs/reference/03_AIRPORT_SELECTOR.md` §49–§50. Nothing here was
 * scraped; the entries are written from common public reference knowledge.
 */

interface CityInput {
  readonly id: string;
  readonly cityName: string;
  readonly cityCode: string;
  readonly countryName: string;
  readonly countryCode: string;
  readonly timeZone: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly popularity: number;
  readonly localizedNames?: Record<string, string>;
  readonly aliases?: readonly string[];
  readonly airports: readonly AirportInput[];
}

interface AirportInput {
  readonly iataCode: string;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly popularity: number;
  readonly localizedNames?: Record<string, string>;
  readonly aliases?: readonly string[];
}

const CITIES: readonly CityInput[] = [
  {
    id: "city-yto",
    cityName: "Toronto",
    cityCode: "YTO",
    countryName: "Canada",
    countryCode: "CA",
    timeZone: "America/Toronto",
    latitude: 43.6532,
    longitude: -79.3832,
    popularity: 10,
    localizedNames: { fr: "Toronto", fa: "تورنتو", ar: "تورونتو" },
    airports: [
      {
        iataCode: "YYZ",
        name: "Toronto Pearson International Airport",
        latitude: 43.6777,
        longitude: -79.6248,
        popularity: 10,
        localizedNames: { fr: "Aéroport international Toronto-Pearson" },
        aliases: ["Pearson"],
      },
      {
        iataCode: "YTZ",
        name: "Billy Bishop Toronto City Airport",
        latitude: 43.6275,
        longitude: -79.3962,
        popularity: 40,
        aliases: ["Billy Bishop", "Toronto Island"],
      },
    ],
  },
  {
    id: "city-ymq",
    cityName: "Montreal",
    cityCode: "YMQ",
    countryName: "Canada",
    countryCode: "CA",
    timeZone: "America/Toronto",
    latitude: 45.5019,
    longitude: -73.5674,
    popularity: 11,
    localizedNames: { fr: "Montréal", fa: "مونترال", ar: "مونتريال" },
    aliases: ["Montréal", "مونترآل"],
    airports: [
      {
        iataCode: "YUL",
        name: "Montréal–Trudeau International Airport",
        latitude: 45.4706,
        longitude: -73.7408,
        popularity: 11,
        localizedNames: {
          fr: "Aéroport international Montréal-Trudeau",
          fa: "فرودگاه بین‌المللی مونترآل-ترودو",
        },
        aliases: ["Trudeau", "Dorval", "Montreal Trudeau"],
      },
    ],
  },
  {
    id: "city-yvr",
    cityName: "Vancouver",
    cityCode: "YVR",
    countryName: "Canada",
    countryCode: "CA",
    timeZone: "America/Vancouver",
    latitude: 49.2827,
    longitude: -123.1207,
    popularity: 14,
    localizedNames: { fr: "Vancouver", fa: "ونکوور" },
    airports: [
      {
        iataCode: "YVR",
        name: "Vancouver International Airport",
        latitude: 49.1967,
        longitude: -123.1815,
        popularity: 14,
        localizedNames: { fr: "Aéroport international de Vancouver" },
      },
    ],
  },
  {
    id: "city-yow",
    cityName: "Ottawa",
    cityCode: "YOW",
    countryName: "Canada",
    countryCode: "CA",
    timeZone: "America/Toronto",
    latitude: 45.4215,
    longitude: -75.6972,
    popularity: 30,
    localizedNames: { fr: "Ottawa", fa: "اتاوا" },
    airports: [
      {
        iataCode: "YOW",
        name: "Ottawa Macdonald–Cartier International Airport",
        latitude: 45.3225,
        longitude: -75.6692,
        popularity: 30,
        localizedNames: { fr: "Aéroport international Macdonald-Cartier" },
      },
    ],
  },
  {
    id: "city-yyc",
    cityName: "Calgary",
    cityCode: "YYC",
    countryName: "Canada",
    countryCode: "CA",
    timeZone: "America/Edmonton",
    latitude: 51.0447,
    longitude: -114.0719,
    popularity: 28,
    localizedNames: { fr: "Calgary", fa: "کلگری" },
    airports: [
      {
        iataCode: "YYC",
        name: "Calgary International Airport",
        latitude: 51.1215,
        longitude: -114.0076,
        popularity: 28,
      },
    ],
  },
  {
    id: "city-nyc",
    cityName: "New York",
    cityCode: "NYC",
    countryName: "United States",
    countryCode: "US",
    timeZone: "America/New_York",
    latitude: 40.7128,
    longitude: -74.006,
    popularity: 1,
    localizedNames: { fr: "New York", fa: "نیویورک", ar: "نيويورك" },
    airports: [
      {
        iataCode: "JFK",
        name: "John F. Kennedy International Airport",
        latitude: 40.6413,
        longitude: -73.7781,
        popularity: 1,
        aliases: ["Kennedy"],
      },
      {
        iataCode: "EWR",
        name: "Newark Liberty International Airport",
        latitude: 40.6895,
        longitude: -74.1745,
        popularity: 8,
        aliases: ["Newark"],
      },
    ],
  },
  {
    id: "city-lon",
    cityName: "London",
    cityCode: "LON",
    countryName: "United Kingdom",
    countryCode: "GB",
    timeZone: "Europe/London",
    latitude: 51.5072,
    longitude: -0.1276,
    popularity: 2,
    localizedNames: { fr: "Londres", fa: "لندن", ar: "لندن" },
    airports: [
      {
        iataCode: "LHR",
        name: "London Heathrow Airport",
        latitude: 51.47,
        longitude: -0.4543,
        popularity: 2,
        localizedNames: { fr: "Aéroport de Londres-Heathrow" },
        aliases: ["Heathrow"],
      },
      {
        iataCode: "LGW",
        name: "London Gatwick Airport",
        latitude: 51.1537,
        longitude: -0.1821,
        popularity: 9,
        aliases: ["Gatwick"],
      },
    ],
  },
  {
    id: "city-par",
    cityName: "Paris",
    cityCode: "PAR",
    countryName: "France",
    countryCode: "FR",
    timeZone: "Europe/Paris",
    latitude: 48.8566,
    longitude: 2.3522,
    popularity: 3,
    localizedNames: { fr: "Paris", fa: "پاریس", ar: "باريس" },
    airports: [
      {
        iataCode: "CDG",
        name: "Paris Charles de Gaulle Airport",
        latitude: 49.0097,
        longitude: 2.5479,
        popularity: 3,
        localizedNames: { fr: "Aéroport de Paris-Charles-de-Gaulle" },
        aliases: ["Charles de Gaulle", "Roissy"],
      },
    ],
  },
  {
    id: "city-ist",
    cityName: "Istanbul",
    cityCode: "IST",
    countryName: "Türkiye",
    countryCode: "TR",
    timeZone: "Europe/Istanbul",
    latitude: 41.0082,
    longitude: 28.9784,
    popularity: 5,
    localizedNames: { fr: "Istanbul", fa: "استانبول", ar: "إسطنبول" },
    airports: [
      {
        iataCode: "IST",
        name: "Istanbul Airport",
        latitude: 41.2753,
        longitude: 28.7519,
        popularity: 5,
        localizedNames: { fa: "فرودگاه استانبول", ar: "مطار إسطنبول" },
      },
    ],
  },
  {
    id: "city-thr",
    cityName: "Tehran",
    cityCode: "THR",
    countryName: "Iran",
    countryCode: "IR",
    timeZone: "Asia/Tehran",
    latitude: 35.6892,
    longitude: 51.389,
    popularity: 12,
    localizedNames: { fa: "تهران", ar: "طهران", fr: "Téhéran" },
    aliases: ["Teheran", "تهران"],
    airports: [
      {
        iataCode: "IKA",
        name: "Imam Khomeini International Airport",
        latitude: 35.4161,
        longitude: 51.1522,
        popularity: 12,
        localizedNames: { fa: "فرودگاه بین‌المللی امام خمینی" },
        aliases: ["Imam Khomeini", "امام خمینی"],
      },
      {
        iataCode: "THR",
        name: "Mehrabad International Airport",
        latitude: 35.6892,
        longitude: 51.3134,
        popularity: 26,
        localizedNames: { fa: "فرودگاه بین‌المللی مهرآباد" },
        aliases: ["Mehrabad", "مهرآباد"],
      },
    ],
  },
  {
    id: "city-dxb",
    cityName: "Dubai",
    cityCode: "DXB",
    countryName: "United Arab Emirates",
    countryCode: "AE",
    timeZone: "Asia/Dubai",
    latitude: 25.2048,
    longitude: 55.2708,
    popularity: 4,
    localizedNames: { fr: "Dubaï", fa: "دبی", ar: "دبي" },
    airports: [
      {
        iataCode: "DXB",
        name: "Dubai International Airport",
        latitude: 25.2532,
        longitude: 55.3657,
        popularity: 4,
        localizedNames: {
          fr: "Aéroport international de Dubaï",
          ar: "مطار دبي الدولي",
          fa: "فرودگاه بین‌المللی دبی",
        },
      },
    ],
  },
  {
    id: "city-doh",
    cityName: "Doha",
    cityCode: "DOH",
    countryName: "Qatar",
    countryCode: "QA",
    timeZone: "Asia/Qatar",
    latitude: 25.2854,
    longitude: 51.531,
    popularity: 16,
    localizedNames: { fr: "Doha", fa: "دوحه", ar: "الدوحة" },
    airports: [
      {
        iataCode: "DOH",
        name: "Hamad International Airport",
        latitude: 25.2731,
        longitude: 51.6081,
        popularity: 16,
        localizedNames: { ar: "مطار حمد الدولي" },
        aliases: ["Hamad"],
      },
    ],
  },
  {
    id: "city-fra",
    cityName: "Frankfurt",
    cityCode: "FRA",
    countryName: "Germany",
    countryCode: "DE",
    timeZone: "Europe/Berlin",
    latitude: 50.1109,
    longitude: 8.6821,
    popularity: 7,
    localizedNames: { fr: "Francfort", fa: "فرانکفورت", ar: "فرانكفورت" },
    airports: [
      {
        iataCode: "FRA",
        name: "Frankfurt Airport",
        latitude: 50.0379,
        longitude: 8.5622,
        popularity: 7,
        localizedNames: { fr: "Aéroport de Francfort" },
      },
    ],
  },
  {
    id: "city-ams",
    cityName: "Amsterdam",
    cityCode: "AMS",
    countryName: "Netherlands",
    countryCode: "NL",
    timeZone: "Europe/Amsterdam",
    latitude: 52.3676,
    longitude: 4.9041,
    popularity: 6,
    localizedNames: { fr: "Amsterdam", fa: "آمستردام", ar: "أمستردام" },
    airports: [
      {
        iataCode: "AMS",
        name: "Amsterdam Airport Schiphol",
        latitude: 52.3105,
        longitude: 4.7683,
        popularity: 6,
        aliases: ["Schiphol"],
      },
    ],
  },
  {
    id: "city-tyo",
    cityName: "Tokyo",
    cityCode: "TYO",
    countryName: "Japan",
    countryCode: "JP",
    timeZone: "Asia/Tokyo",
    latitude: 35.6762,
    longitude: 139.6503,
    popularity: 13,
    localizedNames: { fr: "Tokyo", fa: "توکیو", ar: "طوكيو" },
    airports: [
      {
        iataCode: "HND",
        name: "Tokyo Haneda Airport",
        latitude: 35.5494,
        longitude: 139.7798,
        popularity: 13,
        aliases: ["Haneda"],
      },
      {
        iataCode: "NRT",
        name: "Narita International Airport",
        latitude: 35.772,
        longitude: 140.3929,
        popularity: 22,
        aliases: ["Narita"],
      },
    ],
  },
];

/** The flexible-destination entity. Destination context only. */
export const EVERYWHERE_LOCATION: TravelLocation = {
  id: "flexible-everywhere",
  entityType: "FLEXIBLE_DESTINATION",
  displayName: "Everywhere",
  cityName: "",
  cityCode: null,
  countryName: "",
  countryCode: "",
  iataCode: null,
  airportCodes: [],
  localizedNames: {},
  localizedCityNames: {},
  localizedCountryNames: {},
  aliases: ["anywhere", "everywhere", "explore"],
  timeZone: null,
  latitude: null,
  longitude: null,
  isAllAirports: false,
  isFlexibleDestination: true,
  popularity: 0,
};

function buildDirectory(): readonly TravelLocation[] {
  const entries: TravelLocation[] = [];

  for (const city of CITIES) {
    const airportCodes = city.airports.map((airport) => airport.iataCode);

    entries.push({
      id: city.id,
      entityType: "CITY_ALL_AIRPORTS",
      displayName: city.cityName,
      cityName: city.cityName,
      cityCode: city.cityCode,
      countryName: city.countryName,
      countryCode: city.countryCode,
      iataCode: null,
      airportCodes,
      localizedNames: city.localizedNames ?? {},
      localizedCityNames: city.localizedNames ?? {},
      localizedCountryNames: countryNamesFor(city.countryCode),
      aliases: city.aliases ?? [],
      timeZone: city.timeZone,
      latitude: city.latitude,
      longitude: city.longitude,
      isAllAirports: true,
      isFlexibleDestination: false,
      popularity: city.popularity,
    });

    for (const airport of city.airports) {
      entries.push({
        id: `airport-${airport.iataCode.toLowerCase()}`,
        entityType: "AIRPORT",
        displayName: airport.name,
        cityName: city.cityName,
        cityCode: city.cityCode,
        countryName: city.countryName,
        countryCode: city.countryCode,
        iataCode: airport.iataCode,
        airportCodes: [airport.iataCode],
        localizedNames: airport.localizedNames ?? {},
        localizedCityNames: city.localizedNames ?? {},
        localizedCountryNames: countryNamesFor(city.countryCode),
        aliases: airport.aliases ?? [],
        timeZone: city.timeZone,
        latitude: airport.latitude,
        longitude: airport.longitude,
        isAllAirports: false,
        isFlexibleDestination: false,
        popularity: airport.popularity,
      });
    }
  }

  return entries;
}

/** Every selectable entity in the demonstration directory. */
export const DEMO_LOCATIONS: readonly TravelLocation[] = buildDirectory();

/** Editorial ordering for the empty-query suggestion list. */
export const DEMO_POPULAR_IDS: readonly string[] = [
  "city-yto",
  "city-ymq",
  "city-lon",
  "city-par",
  "city-nyc",
  "city-dxb",
];
