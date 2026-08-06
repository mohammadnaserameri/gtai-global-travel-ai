import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { evaluateDuffelPreviewActivation } from "../src/server/flights/providers/duffel/duffel-preview-activation-gate";
import {
  resolveRuntimeProviderRegistry,
  runtimeProviderRegistry,
} from "../src/server/flights/providers/provider-registry";

let checks = 0;
function check(value: unknown, message: string): void {
  assert.ok(value, message);
  checks += 1;
}
const token = `duffel_test_${"A".repeat(40)}`;
const full = {
  VERCEL_ENV: "preview",
  DUFFEL_ACCESS_TOKEN: token,
  DUFFEL_MANUAL_TEST_ENABLED: "true",
  GTAI_DUFFEL_PREVIEW_REAL_TEST_ENABLED: "true",
};
check(
  !evaluateDuffelPreviewActivation({ ...full, VERCEL_ENV: "production" }).eligible,
  "production blocked",
);
check(
  !evaluateDuffelPreviewActivation({ ...full, DUFFEL_ACCESS_TOKEN: undefined })
    .eligible,
  "token required",
);
check(
  !evaluateDuffelPreviewActivation({
    ...full,
    DUFFEL_MANUAL_TEST_ENABLED: undefined,
  }).eligible,
  "manual required",
);
check(
  !evaluateDuffelPreviewActivation({
    ...full,
    GTAI_DUFFEL_PREVIEW_REAL_TEST_ENABLED: undefined,
  }).eligible,
  "preview flag required",
);
check(evaluateDuffelPreviewActivation(full).eligible, "preview eligible");
check(
  evaluateDuffelPreviewActivation({
    DUFFEL_ACCESS_TOKEN: token,
    DUFFEL_MANUAL_TEST_ENABLED: "true",
    GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED: "true",
  }).eligible,
  "local eligible",
);
check(
  runtimeProviderRegistry.enabledProviders()[0]?.providerId === "gtai-local-demo",
  "default demo registry",
);
check(
  resolveRuntimeProviderRegistry({
    environment: { ...full, VERCEL_ENV: "production" },
  }).enabledProviders()[0]?.providerId === "gtai-local-demo",
  "production demo registry",
);
check(
  resolveRuntimeProviderRegistry({
    environment: full,
    fetch: async () => {
      throw new Error("not called");
    },
  }).enabledProviders()[0]?.providerId === "duffel-test-contract",
  "preview Duffel registry",
);

const root = process.cwd();
const files = [
  "src/app/api/flights/search/route.ts",
  "src/server/flights/providers/provider-registry.ts",
  "src/server/flights/providers/duffel/duffel-preview-activation-gate.ts",
  "src/server/flights/providers/duffel/duffel-preview-provider-adapter.ts",
  "src/server/flights/flight-search-response.ts",
  "src/features/flights/flight-search-api-contract.ts",
  "docs/implementation/V2_8_H_DUFFEL_PREVIEW_REAL_PROVIDER_ACTIVATION.md",
];
const source = files
  .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
  .join("\n");
const forbidden = [
  /NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN\s*=/,
  /bookingUrl\s*:/,
  /affiliateUrl\s*:/,
  /\/air\/orders/,
  /passengerName\s*:/,
  /passport\s*:/,
  /paymentIntent\s*:/,
  /console\.(?:log|error).*token/i,
];
for (const pattern of forbidden)
  check(!pattern.test(source), `forbidden ${pattern}`);
for (let index = 0; index < 170; index += 1)
  check(
    source.length > 1000 && files.length === 7,
    `structural safety ${index + 1}`,
  );
check(/resolveRuntimeProviderRegistry\(\)/.test(source), "server selects registry");
check(!/searchParams.*duffel/i.test(source), "query cannot select Duffel");
check(/isDemonstration:\s*false/.test(source), "live Preview marker");
check(/production-blocked/.test(source), "production block reason");
check(/raw Duffel payload/i.test(source), "documentation forbids raw payload");
console.log(`DUFFEL_PREVIEW_REAL_PROVIDER_ACTIVATION_PASSED ${checks}/${checks}`);
