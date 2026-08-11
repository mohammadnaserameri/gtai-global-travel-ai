import "../../../../../server/server-only";

import {
  createViatorProductReference,
  isValidViatorSearchInput,
  searchViatorProducts,
} from "@/server/affiliate/viator/viator-adapter";
import { ViatorProviderError } from "@/server/affiliate/viator/viator-client";
import type { ViatorSearchInput } from "@/server/affiliate/viator/viator-types";

export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 8_000;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    const raw = await request.text();
    if (!raw || raw.length > MAX_BODY_BYTES)
      return Response.json({ ok: false, code: "invalidRequest" }, { status: 400 });
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      return Response.json({ ok: false, code: "invalidRequest" }, { status: 400 });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body))
      return Response.json({ ok: false, code: "invalidRequest" }, { status: 400 });
    const values = body as Record<string, unknown>;
    const input = values.search as ViatorSearchInput;
    const locale = typeof values.locale === "string" ? values.locale : "en";
    if (!input || !isValidViatorSearchInput(input))
      return Response.json({ ok: false, code: "invalidRequest" }, { status: 400 });
    const result = await searchViatorProducts(input, locale);
    const products = result.products.map((product) => ({
      ...product,
      redirectRef: createViatorProductReference(product.productCode),
    }));
    return Response.json(
      {
        ok: true,
        provider: "viator-affiliate",
        environment: "sandbox",
        demonstration: false,
        result: { ...result, products },
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    const code =
      error instanceof ViatorProviderError ? error.code : "providerUnavailable";
    return Response.json(
      { ok: false, code },
      {
        status: code === "providerInactive" ? 503 : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
