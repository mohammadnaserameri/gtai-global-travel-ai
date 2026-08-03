/**
 * The demonstration identity catalog — the only place GTAI names an airline
 * or a booking provider.
 *
 * V2.7 is explicitly demonstration-only: nothing here is a real carrier, a
 * real IATA designator, a real flight number or a real travel agency, and
 * nothing here is derived from one. Keeping the names in one shared module is
 * what makes that claim checkable rather than aspirational — the generator
 * draws from this catalog, and the canonical validator rejects anything that
 * is not in it.
 *
 * That second half is the part that was missing. A validator that accepts any
 * non-empty string for `carrierName` will happily accept `"British Airways"`
 * or `"Booking.com"` on an offer the interface then presents beside the words
 * "demonstration offer". The catalog closes that: an identity is either one of
 * ours or the whole provider response is rejected.
 *
 * Adding a real brand here — even "just for a test" — would defeat the point.
 * Real names appear in verification only as adversarial fixtures that must be
 * rejected.
 */

export interface DemoCarrier {
  /** Internal fictional id, e.g. `"aurora"` — never a real airline designator. */
  readonly id: string;
  readonly name: string;
  /** The three-letter mark used inside a `DEMO-<mark>-<number>` flight number. */
  readonly mark: string;
}

/** Fictional demonstration airlines. No real livery, logo or IATA identity is implied. */
export const DEMO_CARRIERS: readonly DemoCarrier[] = [
  { id: "aurora", name: "Aurora Air", mark: "AUR" },
  { id: "maple", name: "Maple Wings", mark: "MPW" },
  { id: "skyline", name: "Skyline Airways", mark: "SKY" },
  { id: "meridian", name: "Meridian Air", mark: "MER" },
];

/** Fictional demonstration booking providers — never a real travel agency. */
export const DEMO_BOOKING_PROVIDERS: readonly string[] = [
  "Atlas Connect",
  "Northstar Travel",
  "Voyage Hub",
];

const CARRIERS_BY_ID: ReadonlyMap<string, DemoCarrier> = new Map(
  DEMO_CARRIERS.map((carrier) => [carrier.id, carrier]),
);

const CARRIER_NAMES: ReadonlySet<string> = new Set(
  DEMO_CARRIERS.map((carrier) => carrier.name),
);

const BOOKING_PROVIDERS: ReadonlySet<string> = new Set(DEMO_BOOKING_PROVIDERS);

/**
 * The demonstration flight-number shape: `DEMO-<mark>-<number>`.
 *
 * The `DEMO-` prefix is what makes these unmistakably not real, and the mark
 * is captured so it can be checked against the carrier that is supposedly
 * operating the segment — `DEMO-AUR-483` on a Maple Wings flight is internally
 * inconsistent even though both halves are fictional.
 */
const DEMO_FLIGHT_NUMBER = /^DEMO-([A-Z]{3})-(\d{3})$/;

/** The catalogued carrier for an id, or `null` if the id is not ours. */
export function findDemoCarrierById(id: string): DemoCarrier | null {
  return CARRIERS_BY_ID.get(id) ?? null;
}

/** Whether a name is one of the catalogued fictional carriers. */
export function isDemoCarrierName(name: string): boolean {
  return CARRIER_NAMES.has(name);
}

/** Whether a name is one of the catalogued fictional booking providers. */
export function isDemoBookingProvider(name: string): boolean {
  return BOOKING_PROVIDERS.has(name);
}

/**
 * Whether `flightNumber` is a well-formed demonstration number *belonging to*
 * `carrier` — both halves, checked together.
 */
export function isDemoFlightNumberFor(
  flightNumber: string,
  carrier: DemoCarrier,
): boolean {
  const match = DEMO_FLIGHT_NUMBER.exec(flightNumber);
  if (match === null) return false;
  return match[1] === carrier.mark;
}
