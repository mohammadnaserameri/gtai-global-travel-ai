import "../src/server/server-only";

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  runTravelImageLiveSmokeTest,
  TRAVEL_IMAGE_LIVE_SMOKE_TEST_ENV_NAME,
} from "../src/server/travel-images/travel-image-smoke-test";

const LOCAL_ENV_NAMES = Object.freeze([
  TRAVEL_IMAGE_LIVE_SMOKE_TEST_ENV_NAME,
  "UNSPLASH_ACCESS_KEY",
  "PEXELS_API_KEY",
  "PIXABAY_API_KEY",
] as const);

type Environment = Readonly<Record<string, string | undefined>>;

/** Reads only the smoke-test allowlist and never logs values. */
export function loadTravelImageSmokeEnvironment(
  base: Environment = process.env,
  file = resolve(process.cwd(), ".env.local"),
): Environment {
  const merged: Record<string, string | undefined> = { ...base };
  if (!existsSync(file)) return Object.freeze(merged);
  const source = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const name = trimmed.slice(0, separator).trim();
    if (!LOCAL_ENV_NAMES.includes(name as (typeof LOCAL_ENV_NAMES)[number])) {
      continue;
    }
    let value = trimmed.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if ((merged[name] ?? "").trim().length === 0) merged[name] = value;
  }
  return Object.freeze(merged);
}

async function main(): Promise<void> {
  const smoke = await runTravelImageLiveSmokeTest({
    environment: loadTravelImageSmokeEnvironment(),
  });
  const marker = smoke.providerCallSucceeded
    ? "TRAVEL_IMAGE_LIVE_SMOKE_PASSED"
    : "TRAVEL_IMAGE_LIVE_SMOKE_FAILED";
  process.stdout.write(`${marker} ${JSON.stringify(smoke)}\n`);
  if (!smoke.providerCallSucceeded) process.exitCode = 1;
}

if (require.main === module) {
  void main().catch(() => {
    process.stderr.write(
      "TRAVEL_IMAGE_LIVE_SMOKE_FAILED safeReasonCode=providerUnavailable\n",
    );
    process.exitCode = 1;
  });
}
