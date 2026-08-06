import "../../../server-only";

import {
  resolveDuffelCredential,
  type DuffelCredentialCapsule,
} from "./duffel-credential-resolver";

export const DUFFEL_PREVIEW_FLAG = "GTAI_DUFFEL_PREVIEW_REAL_TEST_ENABLED";
export const DUFFEL_LOCAL_FLAG = "GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED";

export type DuffelPreviewActivation =
  | {
      readonly eligible: true;
      readonly environment: "preview" | "local";
      readonly credential: DuffelCredentialCapsule;
    }
  | {
      readonly eligible: false;
      readonly environment: "production" | "preview" | "local";
      readonly reason:
        | "production-blocked"
        | "manual-disabled"
        | "environment-disabled"
        | "credential-unavailable";
    };

export function evaluateDuffelPreviewActivation(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): DuffelPreviewActivation {
  const deployment = environment.VERCEL_ENV;
  const runtimeEnvironment =
    deployment === "production"
      ? "production"
      : deployment === "preview"
        ? "preview"
        : "local";
  if (runtimeEnvironment === "production")
    return {
      eligible: false,
      environment: runtimeEnvironment,
      reason: "production-blocked",
    };
  if (environment.DUFFEL_MANUAL_TEST_ENABLED !== "true")
    return {
      eligible: false,
      environment: runtimeEnvironment,
      reason: "manual-disabled",
    };
  const enabled =
    runtimeEnvironment === "preview"
      ? environment[DUFFEL_PREVIEW_FLAG] === "true"
      : environment[DUFFEL_LOCAL_FLAG] === "true";
  if (!enabled)
    return {
      eligible: false,
      environment: runtimeEnvironment,
      reason: "environment-disabled",
    };
  const resolved = resolveDuffelCredential(environment);
  if (resolved.state !== "presentButInactive")
    return {
      eligible: false,
      environment: runtimeEnvironment,
      reason: "credential-unavailable",
    };
  return {
    eligible: true,
    environment: runtimeEnvironment,
    credential: resolved.credential,
  };
}
