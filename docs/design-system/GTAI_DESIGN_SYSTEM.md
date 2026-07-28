# GTAI Design System

Single source of truth for GTAI's visual language. All tokens live in `src/app/globals.css`; this document explains what they mean and when to use them.

---

## 1. Brand identity

|           |                                                                               |
| --------- | ----------------------------------------------------------------------------- |
| Mark      | GTAI                                                                          |
| Expansion | Global Travel AI                                                              |
| Origin    | Canada                                                                        |
| Character | global · premium · trustworthy · intelligent · modern · commercially credible |
| Never     | childish · neon · gaming-like · cartoonish · visually noisy · low-contrast    |

The interface has to be credible for a business traveller booking a Tuesday morning flight and for a family planning a summer holiday, and it must remain credible once real money is involved. Restraint is the house style.

### Logo

`src/components/brand/Logo.tsx`. A rounded gradient tile holding original SVG geometry — a globe outline, one flattened meridian, a travel path rising across it, and a filled destination node — beside the GTAI wordmark, with an optional "Global Travel AI" subtitle.

This is a **temporary placeholder**, not the final registered brand identity. It copies no airline, metasearch or technology symbol.

## 2. Approved palette

The five brand colours are preserved verbatim in the ramp:

| Swatch      | Hex           | Token                                   |
| ----------- | ------------- | --------------------------------------- |
| Soft        | `#FFD6FF`     | `--brand-100`, `--brand-primary-soft`   |
| Subtle      | `#EAC0FF`     | `--brand-200`, `--brand-primary-subtle` |
| **Primary** | **`#C78EFF`** | `--brand-400`, `--brand-primary`        |
| Secondary   | `#D0BDFF`     | `--brand-250`, `--brand-secondary`      |
| Tertiary    | `#D0DFFF`     | `--accent-200`, `--brand-tertiary`      |

### Why the palette was extended

The supplied palette is a set of **light tints**. None of them carries white text at an accessible contrast, and using them for buttons and links would have produced exactly the pastel, low-contrast interface the brief rules out.

They are therefore kept as the brand's _identity_ colours — used for gradients, glows, badges, borders, chips and surfaces — and extended downward into an accessible **interaction ramp** derived from the same hue:

```
--brand-25  #FDFAFF   --brand-500 #B071F5
--brand-50  #FAF3FF   --brand-600 #9553DF
--brand-150 #F2E3FF   --brand-700 #7A3FBE   ← primary action
--brand-300 #D8A9FF   --brand-800 #5F2F94   ← brand ink
                      --brand-900 #45216B
                      --brand-950 #2B1445
```

Blue-violet support from `#D0DFFF`: `--accent-100/200/400/600/800`.

## 3. Semantic colour tokens

**Brand**

`--brand-primary` `--brand-primary-hover` `--brand-primary-active` `--brand-primary-subtle` `--brand-primary-soft` `--brand-secondary` `--brand-tertiary`

**Interaction ink** (accessible pairings — use these when the brand must carry text)

`--brand-ink` `--brand-ink-strong` `--brand-action` `--brand-action-hover` `--brand-action-active` `--brand-on-action`

**Gradient stops**

`--brand-gradient-start` `#FFD6FF` → `--brand-gradient-middle` `#C78EFF` → `--brand-gradient-end` `#D0DFFF`

**Background** `--background` `--background-muted` `--background-accent`
**Surface** `--surface` `--surface-subtle` `--surface-elevated` `--surface-glass`
**Foreground** `--foreground` `--foreground-secondary` `--foreground-muted` `--foreground-inverse`
**Lines** `--border` `--border-strong` `--focus-ring`
**Status** `--success` `--warning` `--danger` `--info` (each with a `-subtle` companion)

Every token is mapped into the Tailwind theme, so `bg-surface-subtle`, `text-foreground-muted` and `border-border-strong` are all available as utilities. **Never write a raw hex value in a component.**

## 4. Neutrals

Neutrals are warmed very slightly toward the brand hue rather than being pure grey, which is what keeps the purple from looking bolted on:

`--foreground #171326` (deep charcoal-violet) · `--foreground-secondary #443E5B` · `--foreground-muted #635D7C` · `--border #E7E3F1` · `--background-muted #F7F6FB`

## 5. Contrast

- Body and secondary text meet WCAG AA on white.
- `--foreground-muted` is reserved for supporting text at normal size and above; it is never used for the only copy in a block.
- Primary buttons are `--brand-700` → `--brand-600` with white text.
- Active tabs are `--brand-800` with white text.
- The focus ring is `--brand-700` at 2px with a 2px offset — legible on both light and brand-tinted surfaces.
- **Colour never carries meaning alone.** Every badge, status and active state also has a text label or an `aria-current` / `aria-selected` attribute.

## 6. Typography

Geist, self-hosted through `next/font` (`--font-gtai-sans`), with a system fallback stack. One family, no display face, no mono — smallest possible font payload.

| Role             | Size                                            |
| ---------------- | ----------------------------------------------- |
| Hero `h1`        | `text-4xl` → `sm:text-5xl` → `lg:text-6xl`      |
| Section `h2`     | `text-2xl` → `sm:text-3xl` → `lg:text-[2.5rem]` |
| Sub-heading `h3` | `text-xl` → `sm:text-2xl`                       |
| Body             | `text-base`, relaxed leading                    |
| Supporting       | `text-sm`                                       |
| Micro / eyebrow  | `text-xs`, uppercase, `tracking-[0.12em]`       |

Headings use `tracking-tight` and `text-balance`; body copy is capped around `max-w-2xl` for line length. RTL body copy gets looser leading (`1.8`) because Persian and Arabic scripts need it.

## 7. Spacing, radii, borders

Tailwind's 4px scale throughout. Section rhythm: `py-16` → `lg:py-24`. Container padding steps `px-4` → `sm:px-6` → `lg:px-8`. Container widths: narrow `48rem`, default `80rem`, wide `90rem`.

Radii: `--radius-xs .375rem` · `sm .5rem` · `md .75rem` · `lg 1rem` (fields) · `xl 1.25rem` (cards) · `2xl 1.75rem` (major surfaces) · `pill 999px` (buttons, tabs, chips).

Borders are 1px and always a token. `--border` is the default; `--border-strong` marks an interactive edge; brand-tinted borders (`--brand-150`, `--brand-250`) mark brand surfaces.

## 8. Elevation and surface hierarchy

```
--shadow-xs     hairline lift (chips, small controls)
--shadow-sm     resting cards
--shadow-md     elevated cards, dropdown panels
--shadow-lg     hover state, drawer, glass panels
--shadow-xl     the search surface and modals — the top of the page
--shadow-brand  brand-tinted glow, primary buttons only
```

Surface order, lowest to highest: `--background` → `--background-muted` → `--surface-subtle` → `--surface` → `--surface-elevated` → `--surface-glass`.

**The search shell is the highest surface on the homepage.** Nothing else may out-elevate it — that is the rule that keeps standard search visually dominant over the AI path.

## 9. Professional 3D — and its limits

Depth is built from four cheap, static CSS layers:

1. `.gtai-aurora` — two blurred radial gradients, `position: absolute`, `pointer-events: none`, positioned with logical properties so they mirror in RTL.
2. `.gtai-grid-field` — a 26px dot grid faded out with a radial mask.
3. `.gtai-surface-glass` — `backdrop-filter` on a translucent white, used on the header and the hero artwork only.
4. Shadow tokens plus a 2px `translateY` on hover (`.gtai-lift`).

**Permitted:** restrained layered gradients, soft depth, controlled shadows, elevated search surfaces, subtle floating abstract forms, carefully limited glass, smooth hover elevation, lightweight CSS perspective, subtle background light.

**Not permitted:** WebGL · Three.js · any 3D library · animated 3D globes · gaming effects · excessive parallax · neon lighting · canvas effects · motion that interferes with reading · glassmorphism beyond the two surfaces named above.

Depth supports hierarchy. It is not the product.

## 10. Motion

Transitions are 150–200ms ease, limited to `transform`, `box-shadow`, `border-color` and `opacity`. The only looping animation is `.gtai-float` — a ±10px drift on a single decorative hero waypoint.

`prefers-reduced-motion: reduce` collapses every animation and transition to ~0ms and disables `.gtai-float` outright. The float animation is additionally defined _only_ inside a `prefers-reduced-motion: no-preference` block, so it never starts for a visitor who has opted out.

Nothing animates on scroll. Nothing moves under text a visitor is reading.

## 11. Accessibility rules

- Semantic landmarks: one `<header>`, one `<main id="gtai-main">`, one `<footer>`, `<nav>` with distinct `aria-label`s.
- A visible-on-focus skip link is the first element in the body.
- One `<h1>` per page; heading levels never skip.
- Every input and select has a **visible** `<label>`. Placeholders are never the only label.
- Focus is visible everywhere: `:focus-visible` gives a 2px `--focus-ring` outline at 2px offset.
- Minimum touch target 44px (`min-h-11`, `size-11`).
- Tabs implement the WAI-ARIA pattern: roving `tabindex`, arrow keys (mirrored in RTL), Home/End, `aria-selected`, `aria-controls`.
- Drawer and modal trap focus, close on Escape and on backdrop press, lock body scroll, and restore focus to the trigger.
- Tooltips are exposed with `aria-describedby` and reveal on focus as well as hover — never hover-only.
- Decorative SVG is `aria-hidden` with `focusable="false"`; meaningful SVG has `role="img"` and a label.
- Non-functional previews on `/ai-travel` are `aria-hidden` so assistive technology is never offered a control that does nothing.
- No colour-only meaning, anywhere.

## 12. RTL design rules

- Always use logical properties: `start-*`/`end-*`, `ms-*`/`me-*`, `ps-*`/`pe-*`, `border-s`/`border-e`, `inset-inline-*`.
- Never write `left-*`, `right-*`, `ml-*`, `mr-*`, `pl-*`, `pr-*` in a component.
- Directional icons get `rtl:-scale-x-100`.
- Anything numeric or code-like — prices, ISO codes, airport codes — is wrapped in `.gtai-ltr-numerals`.
- Overlays anchored to an edge use logical anchoring so they mirror without a second rule.
- Test every layout change in `/fa` as well as `/en`.

## 13. Responsive rules

Verified at 360, 390, 768, 1024, 1280 and 1440px.

- `html, body { overflow-x: clip }` is a safety net, not the strategy. Layouts must genuinely fit.
- Grids step `1 → sm:2 → lg:4`; the search shell steps `1 → sm:2 → lg:12` columns.
- Below `sm`, the header's language and currency triggers collapse to icon/symbol only so the row fits at 360px.
- Long selector lists cap at `w-[min(22rem,calc(100vw-2rem))]` and scroll internally.
- The drawer is `w-[min(22rem,90vw)]`.

**One trap worth knowing:** never put a `hidden` utility on an element whose component already sets its own `display` (`inline-flex`, `block`). Two display utilities on one element resolve by _stylesheet_ order, not class order, and `hidden` frequently loses. Wrap the element in a `<span className="hidden lg:block">` instead. This caused a real 360px overflow during V1 and is now the house rule.

## 14. Component usage rules

`Logo` · `Container` · `SectionHeading` · `Button` / `ButtonLink` · `IconButton` · `Card` · `Badge` · `Tabs` / `TabPanel` · `InputShell` · `SelectShell` · `DropdownShell` · `ModalShell` · `DrawerShell` · `TooltipShell` · `Skeleton` · `Alert` · `EmptyState` · `LanguageSelector` · `RegionCurrencySelector` · `AffiliateDisclosure` · `SearchShell` · `TripTypeSelector` · `AgentPreviewCard` · `PlanningModeCard` · `QuestionPreview`

Rules:

1. **No page-specific reimplementations.** If a page needs a variation, add a variant to the shared component.
2. **Variants, not one-off class soup.** `Button` has 5 variants × 3 sizes; `Card` has 5 variants × 4 paddings.
3. **All spacing and colour comes from tokens.** No raw hex, no arbitrary colour values.
4. **`IconButton` requires a `label`.** Icon-only controls have no accessible name otherwise.
5. **Never hardcode visible English** in a reusable component — pass dictionary values in as props.
6. **Server Component by default.** Add `"use client"` only when state, an event handler or a browser API genuinely requires it.
7. **Honesty over polish.** If a surface is not connected, say so in the UI — `Badge`, `Alert` and `EmptyState` exist for exactly that.
