/**
 * Deterministic checks for the pure date utilities.
 *
 * The repository has no test runner, and V2.2 must not add one. This script is
 * compiled with the TypeScript compiler already in the project and run with
 * Node, so it introduces no dependency and never ships as production code.
 *
 *   npm run verify:dates
 */

import {
  addDays,
  addMonths,
  clampToBounds,
  compareIso,
  createDateBounds,
  daysInMonth,
  endOfMonth,
  formatIsoDate,
  isBetween,
  isValidIsoDate,
  isWithinBounds,
  parseIsoDate,
  startOfMonth,
  todayIso,
  weekdayIndex,
} from "../src/features/dates/date-utils";
import {
  buildCalendarMonth,
  leadingOffset,
  weekdayOrderFor,
} from "../src/features/dates/calendar-grid";

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

// --- ISO parse / format round trip -----------------------------------------
check("parse valid", parseIsoDate("2026-09-15"), {
  year: 2026,
  month: 9,
  day: 15,
});
check("parse rejects impossible day", parseIsoDate("2026-02-30"), null);
check("parse rejects month 13", parseIsoDate("2026-13-01"), null);
check("parse rejects malformed", parseIsoDate("2026-9-5"), null);
check(
  "format round trip",
  formatIsoDate({ year: 2026, month: 9, day: 5 }),
  "2026-09-05",
);
check("isValidIsoDate accepts", isValidIsoDate("2026-09-15"), true);
check("isValidIsoDate rejects null", isValidIsoDate(null), false);

// --- Add days across boundaries --------------------------------------------
check("add day within month", addDays("2026-09-15", 1), "2026-09-16");
check("add day across month end", addDays("2026-09-30", 1), "2026-10-01");
check("add day across year end", addDays("2026-12-31", 1), "2027-01-01");
check("subtract day across year start", addDays("2027-01-01", -1), "2026-12-31");
check("add 30 days across months", addDays("2026-01-20", 30), "2026-02-19");

// --- Leap years -------------------------------------------------------------
check("2028 is a leap year", daysInMonth(2028, 2), 29);
check("2027 is not a leap year", daysInMonth(2027, 2), 28);
check("2100 is not a leap year", daysInMonth(2100, 2), 28);
check("2000 is a leap year", daysInMonth(2000, 2), 29);
check("leap day increments", addDays("2028-02-28", 1), "2028-02-29");
check("leap day rolls to March", addDays("2028-02-29", 1), "2028-03-01");

// --- Add months clamp -------------------------------------------------------
check("Jan 31 + 1 month clamps", addMonths("2026-01-31", 1), "2026-02-28");
check(
  "Jan 31 + 1 month clamps in leap year",
  addMonths("2028-01-31", 1),
  "2028-02-29",
);
check("12 months forward", addMonths("2026-09-15", 12), "2027-09-15");
check("month subtraction across year", addMonths("2026-01-15", -1), "2025-12-15");

// --- Comparison -------------------------------------------------------------
check("compare earlier", compareIso("2026-09-15", "2026-09-16"), -1);
check("compare later", compareIso("2026-10-01", "2026-09-30"), 1);
check("compare equal", compareIso("2026-09-15", "2026-09-15"), 0);
check("compare across years", compareIso("2026-12-31", "2027-01-01"), -1);

// --- Month helpers ----------------------------------------------------------
check("startOfMonth", startOfMonth("2026-09-15"), "2026-09-01");
check("endOfMonth 30-day", endOfMonth("2026-09-15"), "2026-09-30");
check("endOfMonth leap Feb", endOfMonth("2028-02-10"), "2028-02-29");

// --- Weekday ----------------------------------------------------------------
// 2026-09-15 is a Tuesday; 2024-01-07 is a Sunday.
check("weekday Tuesday", weekdayIndex("2026-09-15"), 2);
check("weekday Sunday reference", weekdayIndex("2024-01-07"), 0);
check("weekday Saturday", weekdayIndex("2026-09-12"), 6);

// --- Bounds and range -------------------------------------------------------
const bounds = createDateBounds("2026-09-15");
check("bounds min is today", bounds.min, "2026-09-15");
check("bounds max is +12 months", bounds.max, "2027-09-15");
check("today is within bounds", isWithinBounds("2026-09-15", bounds), true);
check("yesterday is outside bounds", isWithinBounds("2026-09-14", bounds), false);
check("max is within bounds", isWithinBounds("2027-09-15", bounds), true);
check("day after max is outside", isWithinBounds("2027-09-16", bounds), false);
check("clamp below min", clampToBounds("2020-01-01", bounds), "2026-09-15");
check("clamp above max", clampToBounds("2030-01-01", bounds), "2027-09-15");
check(
  "range membership excludes endpoints",
  isBetween("2026-09-15", "2026-09-15", "2026-09-20"),
  false,
);
check(
  "range membership interior",
  isBetween("2026-09-17", "2026-09-15", "2026-09-20"),
  true,
);

// --- Week-start offsets for all four locale policies ------------------------
// 2026-09-01 is a Tuesday (weekday index 2).
check("weekday order Sunday-first", weekdayOrderFor(0), [0, 1, 2, 3, 4, 5, 6]);
check("weekday order Monday-first", weekdayOrderFor(1), [1, 2, 3, 4, 5, 6, 0]);
check("weekday order Saturday-first", weekdayOrderFor(6), [6, 0, 1, 2, 3, 4, 5]);
check("offset en (Sunday start)", leadingOffset("2026-09-01", 0), 2);
check("offset fr (Monday start)", leadingOffset("2026-09-01", 1), 1);
check("offset fa/ar (Saturday start)", leadingOffset("2026-09-01", 6), 3);

// --- Grid construction ------------------------------------------------------
const grid = buildCalendarMonth({
  month: "2026-09-10",
  weekStart: 0,
  bounds: createDateBounds("2026-09-01"),
  departure: "2026-09-15",
  returnDate: "2026-09-20",
  today: "2026-09-01",
});
const flat = grid.weeks.flat();
const real = flat.filter((cell) => cell.inCurrentMonth);
check("grid rows are whole weeks", flat.length % 7, 0);
check("grid renders 30 real days", real.length, 30);
check("grid month start", grid.monthStart, "2026-09-01");
check("grid first real day is the 1st", real[0].iso, "2026-09-01");
check("grid last real day is the 30th", real[real.length - 1].iso, "2026-09-30");
check(
  "no duplicate dates in grid",
  new Set(real.map((cell) => cell.iso)).size,
  real.length,
);
check(
  "range start flagged",
  real.filter((c) => c.isRangeStart).map((c) => c.iso),
  ["2026-09-15"],
);
check(
  "range end flagged",
  real.filter((c) => c.isRangeEnd).map((c) => c.iso),
  ["2026-09-20"],
);
check(
  "in-range count excludes endpoints",
  real.filter((c) => c.isInRange).length,
  4,
);
check(
  "today flagged once",
  real.filter((c) => c.isToday).map((c) => c.iso),
  ["2026-09-01"],
);

// Stage minimum: return selection cannot land on or before departure.
const returnGrid = buildCalendarMonth({
  month: "2026-09-10",
  weekStart: 0,
  bounds: createDateBounds("2026-09-01"),
  departure: "2026-09-15",
  returnDate: null,
  minSelectable: "2026-09-16",
  today: "2026-09-01",
});
const returnCells = returnGrid.weeks.flat().filter((c) => c.inCurrentMonth);
check(
  "departure day disabled during return stage",
  returnCells.find((c) => c.iso === "2026-09-15")?.isDisabled,
  true,
);
check(
  "day after departure enabled during return stage",
  returnCells.find((c) => c.iso === "2026-09-16")?.isDisabled,
  false,
);

// --- No timezone shift ------------------------------------------------------
// A date-only value must survive arithmetic without moving, in any offset.
check("no shift on zero-day add", addDays("2026-01-01", 0), "2026-01-01");
check(
  "no shift round trip +1/-1",
  addDays(addDays("2026-03-29", 1), -1),
  "2026-03-29",
);
// 2026-03-29 is a European DST transition; UTC arithmetic must ignore it.
check("DST transition day add", addDays("2026-03-29", 1), "2026-03-30");
check("US DST transition day add", addDays("2026-03-08", 1), "2026-03-09");
check(
  "todayIso uses local components",
  todayIso(new Date(2026, 8, 15, 23, 45)),
  "2026-09-15",
);
check(
  "todayIso just after midnight",
  todayIso(new Date(2026, 8, 15, 0, 5)),
  "2026-09-15",
);

// --- Report -----------------------------------------------------------------
const total = passed + failures.length;
if (failures.length > 0) {
  console.error(`\nDate verification FAILED — ${failures.length} of ${total}\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  process.exit(1);
}

console.log(`Date verification passed — ${passed}/${total} checks`);
