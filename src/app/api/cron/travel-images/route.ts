import { timingSafeEqual } from "node:crypto";

import "@/server/server-only";
import { resolveTravelImageEnvironment } from "@/server/travel-images/travel-image-env";
import { refreshDailyTravelImages } from "@/server/travel-images/travel-image-refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(value: string | null, secret: string): boolean {
  if (!value?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(value.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const { cronSecret } = resolveTravelImageEnvironment();
  if (!cronSecret) return json({ ok: false, code: "cronUnavailable" }, 503);
  if (!authorized(request.headers.get("authorization"), cronSecret)) {
    return json({ ok: false, code: "unauthorized" }, 401);
  }

  try {
    return json(await refreshDailyTravelImages(), 200);
  } catch {
    return json({ ok: false, code: "refreshUnavailable" }, 503);
  }
}
