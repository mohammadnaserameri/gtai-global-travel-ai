import "../../../../../server/server-only";

import { createHash } from "node:crypto";

import {
  resolveViatorAffiliateDestination,
  resolveViatorProductReference,
} from "@/server/affiliate/viator/viator-adapter";
import { recordViatorClick } from "@/server/affiliate/viator/viator-telemetry";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const reference = url.searchParams.get("ref") ?? "";
  const locale = url.searchParams.get("locale") ?? "en";
  const productCode = resolveViatorProductReference(reference);
  if (!productCode)
    return Response.json(
      { ok: false, code: "invalidReference" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const destination = await resolveViatorAffiliateDestination(
      productCode,
      locale,
    );
    if (!destination)
      return Response.json(
        { ok: false, code: "redirectUnavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    recordViatorClick({
      provider: "viator-affiliate",
      productCodeHash: createHash("sha256")
        .update(productCode)
        .digest("hex")
        .slice(0, 16),
      createdAt: new Date().toISOString(),
      result: "redirected",
    });
    return new Response(null, {
      status: 302,
      headers: {
        Location: destination.toString(),
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { ok: false, code: "redirectUnavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
