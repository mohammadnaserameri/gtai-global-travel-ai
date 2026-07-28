import { notFound } from "next/navigation";

/**
 * Catch-all inside the locale segment.
 *
 * The root layout lives at `app/[locale]/layout.tsx` so it can set `lang` and
 * `dir` on `<html>`. That means an unmatched URL has no layout to render a 404
 * inside — so this route claims every leftover path under a locale and hands it
 * to the locale's not-found boundary, which does have the shell.
 *
 * Static routes take precedence over a catch-all, so this never shadows a real
 * page.
 */
export default function UnmatchedPage(): never {
  notFound();
}
