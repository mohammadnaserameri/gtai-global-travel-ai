/**
 * Offer policy constants that a generator and a validator must agree on.
 *
 * A rule stated in two places is a rule that will eventually disagree with
 * itself. The turnaround minimum below was previously a literal `60` inside
 * the demonstration generator and an implicit "inbound after outbound" in the
 * canonical validator — which meant the validator accepted a 1-minute
 * turnaround the generator would never produce, and would have gone on
 * accepting it if the generator's number ever changed.
 *
 * This module is deliberately tiny, pure and dependency-free so both sides can
 * import it without pulling anything else along: it is a policy, not a
 * feature.
 */

/**
 * The minimum honest ground time between a round trip's outbound arrival and
 * its inbound departure.
 *
 * Not a schedule claim — it is the floor below which an itinerary stops being
 * plausible as a thing a traveler could actually do. Zero, thirty and
 * fifty-nine minutes are all rejected; sixty is the boundary and is accepted.
 */
export const MIN_ROUND_TRIP_TURNAROUND_MINUTES = 60;

/**
 * The outer edge of the ECMAScript time-value range, in milliseconds.
 *
 * `new Date(v)` is invalid beyond ±this, and — the part that mattered here —
 * `Intl.DateTimeFormat.formatToParts` throws `RangeError: Invalid time value`
 * rather than returning anything a caller could test. Stated once, as the spec
 * states it, so the minute boundary below is a division rather than a second
 * hand-computed magic number.
 */
const MAX_DATE_MILLISECONDS = 8_640_000_000_000_000;

/**
 * The same boundary expressed in the unit GTAI actually carries instants in.
 *
 * `144_000_000_000` minutes. Both this and its millisecond product are inside
 * `Number.MAX_SAFE_INTEGER`, so the conversion is exact at the boundary rather
 * than approximately right near it.
 */
export const MAX_EPOCH_MINUTES = MAX_DATE_MILLISECONDS / 60_000;

/**
 * Whether an unknown value is an integer GTAI may do arithmetic on.
 *
 * `Number.isInteger` was not enough. Above 2^53 the integers stop being
 * distinct — `9007199254740993` and `9007199254740992` are the same value — so
 * a duration, price or stop count beyond that range silently stops satisfying
 * the identities the rest of validation relies on (a sum equalling its parts, a
 * difference equalling a stated duration). `Number.isSafeInteger` is the
 * precondition that makes those comparisons mean what they say. It also implies
 * finite and integral, so it subsumes the previous check rather than sitting
 * beside it.
 */
export function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/**
 * Whether an unknown value is a UTC epoch-minute GTAI can actually convert.
 *
 * This is a **totality** guarantee, not a plausibility one. Every canonical
 * instant is eventually handed to `Intl.DateTimeFormat` to be rendered in an
 * airport's zone, and that call *throws* for a time value outside the
 * ECMAScript range. A validator that throws is not a validator: an offer whose
 * epochs were shifted far out of range — while remaining perfectly
 * self-consistent in chronology, durations and totals — took down
 * `isCanonicalFlightOfferForIntent`, `validateProviderOutcome` and
 * `validateApiResponse` with a raw `RangeError` instead of being rejected.
 *
 * Both signs are bounded, because a large negative epoch is exactly as
 * unconvertible as a large positive one. No sentinel value is special-cased;
 * the range is the range.
 */
export function isValidEpochMinutes(value: unknown): value is number {
  if (!isSafeInteger(value)) return false;
  return value >= -MAX_EPOCH_MINUTES && value <= MAX_EPOCH_MINUTES;
}
