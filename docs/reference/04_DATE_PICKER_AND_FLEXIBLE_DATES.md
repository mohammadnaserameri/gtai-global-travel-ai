# GTAI V1.2-D — Date Picker and Flexible Dates

**Module:** 04 of 07
**Status:** Documented **through** the V2.2 implementation. Built for flights; not extended to other products.
**Base checkpoint:** `1768b916f4a7dd631e408827a87bba2b8c5d6371`
**Implementation record:** `docs/implementation/V2_2_FUNCTIONAL_DATE_PICKER.md`

---

## 1. Date model

A travel date is a **calendar date, not an instant**. The canonical value is an ISO local-date string, `YYYY-MM-DD`, held in `DateSelection`:

| Field             | Type               |
| ----------------- | ------------------ |
| `departure`       | `IsoDate \| null`  |
| `returnDate`      | `IsoDate \| null`  |
| `flexibilityDays` | `0 \| 1 \| 2 \| 3` |

`Date` objects are never stored in form state. Timestamps are never the primary value.

## 2. Timezone safety

Three rules, enforced in `src/features/dates/date-utils.ts`:

1. **`new Date("2026-09-15")` is never used.** The spec parses a bare date string as UTC midnight, which renders as the previous day west of Greenwich.
2. **All arithmetic runs on `Date.UTC(...)` milliseconds** read back with `getUTC*`. UTC has no DST, so a day is always exactly 86 400 000 ms.
3. **Only `todayIso()` touches local time**, and it reads local calendar _components_ rather than converting an instant — so 23:30 in Toronto yields today, not tomorrow.

Formatting follows the same rule: every `Intl.DateTimeFormat` call uses `timeZone: "UTC"` against a UTC-constructed instant.

## 3. Calendar system and locale

The grid is **Gregorian in all four locales**. Persian and Arabic are pinned to `fa-IR-u-ca-gregory` and `ar-u-ca-gregory` so month names describe the dates actually being selected — labelling a Gregorian grid with Persian-calendar months would misrepresent it.

| Locale | Formatting tag       | Week starts |
| ------ | -------------------- | ----------- |
| en     | `en-CA`              | Sunday      |
| fr     | `fr-CA`              | Monday      |
| fa     | `fa-IR-u-ca-gregory` | Saturday    |
| ar     | `ar-u-ca-gregory`    | Saturday    |

Week start is an explicit table, not derived — a wrong first day silently misaligns every date.

## 4. Date limits

One policy source, `createDateBounds()`:

- **Minimum** — today, in the browser's local calendar.
- **Maximum** — today + 12 calendar months.

Dates outside the window are disabled, month navigation stops at the edges, today is visually marked but never auto-selected.

## 5. Trip-type behavior

**Round trip** — departure then return; return must be strictly **after** departure (same-day return is out of scope for V2.2). Desktop closes after a valid return; mobile waits for Apply.

**One way** — return is **removed from the DOM**, not disabled: not rendered, not focusable, not announced, not submitted.

**Multi-city** — unchanged and out of scope. No per-leg calendar exists.

### Trip-type transitions

Round trip → One way parks the return in a ref and drops it from submitted state. One way → Round trip restores it **only** if it is still after the departure and valid; otherwise the field stays empty. An invalid return is never silently produced.

## 6. Invalid existing return

When a newly selected departure falls on or after an existing return, GTAI **preserves the return value**. It does not clear it and does not move it. Instead it marks the return invalid, shows _"Return date must be after departure."_, announces the conflict, and switches the calendar to return-selection so the user resolves it.

## 7. Desktop behavior

Anchored popover, capped at `min(44rem, 100vw − 2rem)` for the two-month view and `min(26rem, 100vw − 2rem)` for one month, positioned with logical properties so it mirrors under RTL. Two consecutive months from `1024px`; one month below that. Selection commits immediately: departure keeps the popover open and advances the stage; return closes it. Closing after only a departure keeps that departure — a return is never fabricated. Escape and outside click both close.

## 8. Mobile behavior

Full-screen modal sheet below `768px`, with focus trap, body-scroll lock, safe-area padding and focus restored to the opening field.

Selection edits **draft state**. Cancel discards it and restores the committed values exactly; Apply commits. Apply is disabled until the draft is complete — both dates for round trip, departure alone for one way.

## 9. Flexible dates

A **search preference, not a date selection**: `flexibilityDays` of 0, 1, 2 or 3, defaulting to Exact dates. It selects no extra calendar day and never alters the chosen anchors. It records how far a future provider search may look around them.

Trip-level for V2.2 — per-leg flexibility is not implemented.

**Whole month is deliberately excluded.** It needs a different Search Intent, has different provider compatibility, and requires its own results design. No disabled placeholder control is shown for it.

**No price indicators of any kind** — no daily prices, cheapest labels, price colouring or demonstration prices. Nothing may imply live provider pricing exists.

## 10. Accessibility

- Each field is a button with a visible label, `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls` and an accessible name carrying the current value.
- The grid is a real `<table role="grid">`; the month heading labels it.
- **Roving tabindex** — exactly one day is tabbable.
- Unavailable days use `aria-disabled`, not `disabled`, so they stay focusable and focus is never stranded.
- Day names carry full weekday and date, plus "today", "selected as departure/return" and "unavailable" — state is never colour-only.
- A polite live region announces stage changes, conflicts, applied and cancelled changes; it does not fire on every arrow press.

### Keyboard

| Key                    | Action                               |
| ---------------------- | ------------------------------------ |
| Arrow Left / Right     | previous / next **day**              |
| Arrow Up / Down        | previous / next week                 |
| Home / End             | first / last day of the current week |
| Page Up / Down         | previous / next month                |
| Shift + Page Up / Down | previous / next year                 |
| Enter / Space          | select the focused day               |
| Escape                 | close                                |

**Decision — arrows are chronological in every locale.** Arrow Left is always the previous day, including in Persian and Arabic. Mirroring them under RTL would make the same key mean different things depending on interface language; predictability was judged more valuable than visual-direction matching.

## 11. RTL

Layout, popover anchoring and range fill use logical properties. Month navigation chevrons mirror. Weekday order starts Saturday. Persian and Arabic numerals come from `Intl`. ISO values stay internal and are never rendered.

## 12. Exclusions

Not implemented: live price calendar · provider pricing · cheapest-date indicators · Whole month · multi-city date legs · date-range API · flight results · provider mapping · URL-state synchronisation · permanent date persistence · authentication · analytics · price alerts · booking · payment.

## 13. Known future items

1. Same-day return, once provider semantics are settled.
2. Whole-month search as its own Search Intent.
3. Per-leg dates and flexibility for multi-city.
4. Price metadata on day cells, only when a real provider supplies it.
5. Hover range preview on desktop (keyboard equivalence already exists).
6. Non-Gregorian calendar display, if a market requires it.

---

> **This module is implemented for the flight search form only.** It does not authorize price calendars, provider integration or results.
