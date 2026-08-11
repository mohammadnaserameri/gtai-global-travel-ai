import "../../../../server/server-only";

import { getViatorTags } from "@/server/affiliate/viator/viator-adapter";
import { ViatorProviderError } from "@/server/affiliate/viator/viator-client";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const locale = new URL(request.url).searchParams.get("locale") ?? "en";
  try {
    const tags = await getViatorTags(locale);
    return Response.json(
      { ok: true, provider: "viator-affiliate", environment: "sandbox", tags },
      {
        headers: {
          "Cache-Control": "private, max-age=300",
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
