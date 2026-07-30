import type { IsoDate } from "../dates/date-types";
import type { LocalDateTime } from "./flight-offer-types";

/**
 * Converts a UTC epoch-minutes value into wall-clock parts inside a given
 * IANA zone, using nothing but `Intl.DateTimeFormat` — no timezone library.
 * DST is handled automatically because the browser/Node ICU data resolves it
 * for the exact instant being formatted.
 */
function zonedParts(epochMinutes: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(epochMinutes * 60_000);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Formats a UTC instant as the local `{ date, time }` at one airport's zone. */
export function toLocalDateTime(
  epochMinutes: number,
  timeZone: string,
): LocalDateTime {
  const parts = zonedParts(epochMinutes, timeZone);
  const date: IsoDate = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  const time = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  return { date, time, epochMinutes };
}

/**
 * Converts a civil wall-clock date/time, understood as local to `timeZone`,
 * into UTC epoch minutes.
 *
 * The technique: guess the instant by treating the wall-clock numbers as if
 * they were already UTC, then ask `Intl` what that guessed instant actually
 * reads as inside `timeZone`. The difference between the intended wall clock
 * and the displayed one is the zone's offset at that moment, which corrects
 * the guess. A second pass re-checks the offset at the corrected instant —
 * civil offsets only ever change in discrete jumps at a transition, so this
 * converges for every wall-clock time that is not inside a DST-skipped hour.
 */
export function fromLocalDateTime(
  date: IsoDate,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const [year, month, day] = date.split("-").map(Number);
  const naiveUtcMinutes = Date.UTC(year, month - 1, day, hour, minute) / 60_000;

  let estimate = naiveUtcMinutes;
  for (let pass = 0; pass < 2; pass += 1) {
    const displayed = zonedParts(estimate, timeZone);
    const displayedAsUtcMinutes =
      Date.UTC(
        displayed.year,
        displayed.month - 1,
        displayed.day,
        displayed.hour,
        displayed.minute,
      ) / 60_000;
    // The zone's offset *at this candidate instant* — the gap between what
    // the zone's clock shows for `estimate` and `estimate` itself. Comparing
    // against `estimate` (not the original naive guess) is what makes the
    // second pass converge instead of undoing the first pass's correction.
    const offsetMinutes = displayedAsUtcMinutes - estimate;
    const nextEstimate = naiveUtcMinutes - offsetMinutes;
    if (nextEstimate === estimate) break;
    estimate = nextEstimate;
  }
  return estimate;
}
