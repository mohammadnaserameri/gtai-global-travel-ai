<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# GTAI project rules

Read `docs/architecture/V1_FOUNDATION.md` before changing architecture, and
`docs/design-system/GTAI_DESIGN_SYSTEM.md` before changing anything visual.

## Non-negotiable

1. **Never copy from a reference product.** See `docs/architecture/REFERENCE_POLICY.md`. No third-party code, layout, icon, logo, image or copy enters this repository.
2. **Never claim a capability that does not exist.** No provider is connected, no price is real, no AI runs. UI copy stays in the future tense for anything unbuilt, and `Badge`/`Alert`/`EmptyState` exist to say so plainly.
3. **No secrets, ever.** `.env.example` holds documented placeholder names only. Never put a secret in a `NEXT_PUBLIC_*` variable.
4. **No sensitive traveller data.** No passport, visa, immigration, health or payment field may be added.
5. **No unrestricted AI free-text input.** The guided experience is structured controls. Do not add a chat box or textarea to the AI surface.
6. **No suppression to make checks pass.** No `any`, no `@ts-ignore`, no undocumented `eslint-disable`, no relaxing `strict`, no skipping the build.

## Conventions

- Server Components by default; add `"use client"` only when state, an event handler or a browser API requires it.
- No raw hex colours and no arbitrary spacing in components — use the tokens in `src/app/globals.css` via Tailwind utilities.
- No visible English inside reusable components. Strings come from `src/i18n/dictionaries/**`; navigation configs carry dictionary _keys_, whose types are derived from the English dictionary.
- Logical CSS properties only (`start-*`, `end-*`, `ms-*`, `border-s`). Never `left-*`, `right-*`, `ml-*`, `pr-*`.
- Every input and select needs a visible `<label>`; a placeholder is not a label. `IconButton` requires a `label`.
- Minimum 44px touch targets (`min-h-11`, `size-11`).
- **Never put a `hidden` utility on an element whose component already sets `display`** (`inline-flex`, `block`). Two display utilities on one element resolve by stylesheet order, not class order. Wrap it: `<span className="hidden lg:block">…</span>`.
- Prefer adding a variant to a shared component over writing a page-specific one.

## Before finishing

```bash
npm run lint && npm run build && npm run typecheck
```

Run `build` **before** `typecheck`. Next 16 writes route-validation types to
`.next/types` on build and to `.next/dev/types` on dev, and `tsconfig.json`
includes both. A dev server that has not yet compiled every route leaves
`.next/dev/types` declaring `LayoutRoutes = never`, which contradicts the build
output and produces confusing `Type 'Route' does not satisfy the constraint
'never'` errors in `validator.ts`. If you hit those: stop the dev server,
`rm -rf .next`, then build and typecheck again.

Check any layout change at 360px and in `/fa` (RTL), not just `/en` on a desktop width.
