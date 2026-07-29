# GTAI V2.2 — Functional Date Picker and Flexible Dates

**Status:** Implemented and frozen
**Base checkpoint:** `1768b916f4a7dd631e408827a87bba2b8c5d6371`
**Specification:** `docs/reference/04_DATE_PICKER_AND_FLEXIBLE_DATES.md`

---

## 1. Scope implemented

| Capability                                            | State |
| ----------------------------------------------------- | ----- |
| Departure and Return as real interactive fields       | Done  |
| One-way single-date selection                         | Done  |
| Round-trip range selection with stage advance         | Done  |
| Month navigation, bounded by the selectable window    | Done  |
| Two months on desktop, one month on tablet and mobile | Done  |
| Mobile modal sheet with draft state, Cancel and Apply | Done  |
| Clear date / Clear dates                              | Done  |
| Flexible dates — Exact, ±1, ±2, ±3                    | Done  |
| Full keyboard grid model                              | Done  |
| Screen-reader labels and polite announcements         | Done  |
| English, French, Persian, Arabic                      | Done  |
| RTL layout and chronological arrows                   | Done  |
| Timezone-safe ISO local dates                         | Done  |
| Form validation and trip-type transitions             | Done  |

## 2. Architecture

```
src/features/dates/
  date-types.ts        IsoDate, DateSelection, CalendarDay, DateBounds
  date-utils.ts        parsing, arithmetic, comparison, bounds policy
  date-formatting.ts   Intl formatting, locale tags, week-start table
  calendar-grid.ts     month model, weekday order, leading offset

src/components/search/date-picker/
  DatePicker.tsx          both fields, commit semantics, stage machine
  DatePickerPanel.tsx     popover / sheet, month nav, keyboard grid
  CalendarMonth.tsx       one month table
  CalendarDay.tsx         one day cell
  FlexibleDateControl.tsx flexibility radios

scripts/verify-dates.ts   deterministic checks (npm run verify:dates)
```

All date arithmetic lives in `src/features/dates`; no calculation happens inside JSX. Desktop and mobile share one panel component with two presentations, reusing the Airport Selector's `useFocusTrap`, `useDismissable` and `useMediaQuery` primitives rather than introducing a second modal architecture.

## 3. Dependencies

**None added.** No calendar library, no date library. The project had neither, and V2.2 introduced neither — all arithmetic and formatting use built-in `Date` UTC methods and `Intl`.

## 4. Deterministic verification

`npm run verify:dates` compiles the pure modules with the TypeScript compiler already in the project and runs them under Node. No test framework was installed and the script never ships as production code.

**66/66 checks pass**, covering: ISO parse/format round trip and rejection of impossible dates · day arithmetic across month, year and leap boundaries · leap years including 1900/2000-style century rules · month-add clamping (31 Jan + 1 month) · comparison · month start/end · weekday indices · bounds and clamping · range membership · weekday order and leading offset for all four locale week starts · grid shape, uniqueness and range flags · stage-minimum disabling · **no timezone shift**, including both European and US DST transition days and `todayIso` at 23:45 and 00:05 local.

## 5. Browser verification

Verified live at 1440, 1280, 1024, 768, 390 and 360 across `/en`, `/fr`, `/fa`, `/ar` and `/en/flights`:

Two-month desktop view and one-month tablet fallback · round-trip selection with stage advance and auto-close · reopening with an existing range · one-way selection · both trip-type transitions · invalid-return preservation with error and stage change · clear dates resetting flexibility to Exact · all four flexibility options leaving dates untouched · Escape and outside-click close with focus restoration · mobile sheet with focus trap, scroll lock, Cancel discarding the draft and Apply committing it · Apply disabled while a round-trip draft is incomplete · keyboard Arrow/Home/End/PageDown/Enter · chronological arrows confirmed in Persian · Persian and Arabic Gregorian month names with Saturday-first weeks and localized numerals · Airport Selector regression · date validation on submit · zero horizontal overflow at every width.

## 6. Known limitations

1. **Same-day return is not permitted.** Deliberate for V2.2; revisit when provider semantics are known.
2. **Whole month is not implemented** and no placeholder control is shown for it.
3. **No hover range preview** on desktop. Keyboard and screen-reader users already receive equivalent information, so this is polish rather than parity.
4. **The visual day surface is 40px while the interaction target is not.** Every focusable day control measures at least 44 × 44px — the button fills its fixed-width column and is 44px tall, with the 40px circle centred inside it. Verified by computed measurement at 360, 390, 768, 1024, 1280 and 1440, in all four locales.
5. **Flexibility is trip-level**, not per-leg.
6. **Adjacent-month days are rendered as blank padding**, not as selectable dates — this is what guarantees no duplicate selectable date in the two-month view.
7. **The remembered return** for trip-type transitions lives in component state only; a page reload loses it.
8. **No URL state and no persistence** — dates reset on reload, by design.

## 7. Exclusions

Unchanged from the specification: live price calendar · provider pricing · cheapest-date indicators · Whole month · multi-city date legs · date-range API · flight results · provider mapping · URL-state synchronisation · permanent persistence · authentication · analytics · price alerts · booking · payment.

Submitting a complete search still performs **no provider call** and produces **no results** — the form reports truthfully that GTAI is still connecting its travel providers.
