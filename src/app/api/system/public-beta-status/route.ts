import "@/server/server-only";

import { getPublicBetaStatus } from "@/server/system/public-beta-status";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return new Response(JSON.stringify(getPublicBetaStatus()), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
