// Relative rather than aliased so these pure string helpers can also be
// imported by the deterministic `verify-*.ts` scripts, which run under plain
// Node without the bundler's `@/` path resolution.
import { defaultLocale, isSupportedLocale } from "../config/locales";

/**
 * URL helpers for the /[locale]/... route shape.
 *
 * Everything here is pure string work so it can run identically in Server
 * Components, Client Components and the request proxy.
 */

/** Builds an application path for a locale. `path` is locale-relative. */
export function localePath(locale: string, path = "/"): string {
  const code = isSupportedLocale(locale) ? locale : defaultLocale;
  if (!path || path === "/") return `/${code}`;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `/${code}${normalized}`;
}

/** Returns the first path segment, or undefined for the root path. */
export function getPathnameLocale(pathname: string): string | undefined {
  const [, first] = pathname.split("/");
  return first && isSupportedLocale(first) ? first : undefined;
}

/** Removes a leading locale segment, returning a locale-relative path. */
export function stripLocale(pathname: string): string {
  const locale = getPathnameLocale(pathname);
  if (!locale) return pathname || "/";
  const rest = pathname.slice(locale.length + 1);
  return rest.length > 0 ? rest : "/";
}

/** Rewrites the current pathname to a different locale, keeping the page. */
export function switchLocale(pathname: string, nextLocale: string): string {
  return localePath(nextLocale, stripLocale(pathname));
}

/**
 * True when a path should be left alone by the locale proxy: framework
 * internals, API routes and anything that looks like a static file.
 */
export function isReservedPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  );
}
