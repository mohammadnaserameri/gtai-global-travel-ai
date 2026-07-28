import { NextResponse, type NextRequest } from "next/server";

import { defaultLocale } from "@/config/locales";
import { getPathnameLocale, isReservedPath } from "@/i18n/routing";

/**
 * Locale normalization for every incoming request.
 *
 * Every application URL is locale-prefixed. A request without a supported
 * locale segment — including the bare root `/` — is redirected to the same path
 * under the default locale, so `/` lands on `/en` and `/flights` lands on
 * `/en/flights`.
 *
 * This deliberately does **not** sniff `Accept-Language` or any IP header. The
 * language a visitor gets is either the one in the URL or English, and it is
 * changed explicitly through the language selector.
 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isReservedPath(pathname)) return NextResponse.next();
  if (getPathnameLocale(pathname)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/${defaultLocale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip framework internals, API routes and anything with a file extension.
  matcher: ["/((?!_next/static|_next/image|api|.*\\..*).*)"],
};
