import assert from "node:assert/strict";

import { POST } from "../src/app/api/flights/search/route";
import { validateApiResponse } from "../src/features/flights/api-flight-offer-repository";
import { validateSearchIntentParams } from "../src/features/flights/search-intent-validation";

const rawIntent = {
  version: "1",
  trip: "roundTrip",
  origin: "city-yto",
  destination: "city-ymq",
  departure: "2026-08-19",
  returnDate: "2026-08-20",
  adults: "1",
  children: "0",
  infantsInSeat: "0",
  infantsOnLap: "0",
  cabin: "economy",
  flex: "0",
  currency: "CAD",
  duplicateKeys: [],
} as const;

async function main(): Promise<void> {
  const intentValidation = validateSearchIntentParams(rawIntent, "en");
  assert.equal(intentValidation.ok, true, "exact Preview intent validates");
  if (!intentValidation.ok) return;

  const body = {
    version: 1,
    locale: "en",
    retryToken: 0,
    scenario: "normal",
    searchIntent: {
      v: "1",
      trip: "roundTrip",
      origin: "city-yto",
      destination: "city-ymq",
      departure: "2026-08-19",
      return: "2026-08-20",
      adults: "1",
      children: "0",
      infantSeat: "0",
      infantLap: "0",
      cabin: "economy",
      flex: "0",
      currency: "CAD",
    },
  };

  for (const retryToken of [0, 1, 2]) {
    const response = await POST(
      new Request("http://localhost/api/flights/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, retryToken }),
      }),
    );
    assert.equal(response.status, 200, `retry ${retryToken} returns HTTP 200`);
    assert.match(
      response.headers.get("content-type") ?? "",
      /^application\/json/,
      "response is JSON",
    );
    const payload: unknown = await response.json();
    const parsed = validateApiResponse(payload, intentValidation.intent);
    if (parsed === null || parsed.status === "error") {
      throw new Error("Results client parser rejected the success response");
    }
    assert.equal(parsed.status, "success", "response status is success");
    assert.equal(parsed.offers.length, 12, "exactly 12 demo offers returned");
    assert.deepEqual(
      parsed.providerSummary.map((provider) => provider.providerId),
      ["gtai-local-demo"],
      "provider boundary remains gtai-local-demo",
    );
    assert.equal(
      parsed.offers.every((offer) => offer.isDemonstration),
      true,
      "every offer remains demonstration inventory",
    );
  }

  console.log(
    "DEMO_FLIGHT_API_RUNTIME_VERIFIED retries=3 offers=12 provider=gtai-local-demo",
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "verification failed");
  process.exitCode = 1;
});
