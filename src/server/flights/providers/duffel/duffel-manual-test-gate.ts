import "../../../server-only";

import type { DuffelCredentialResolution } from "./duffel-credential-resolver";

export const DUFFEL_MANUAL_TEST_ENV_NAME = "DUFFEL_MANUAL_TEST_ENABLED" as const;
export const DUFFEL_FORBIDDEN_PUBLIC_MANUAL_TEST_ENV_NAME =
  "NEXT_PUBLIC_DUFFEL_MANUAL_TEST_ENABLED" as const;

const DUFFEL_INTERNAL_MANUAL_REQUEST: unique symbol = Symbol(
  "gtai.duffelInternalManualRequest",
);

export type DuffelManualTestEnvironment =
  "local" | "preview" | "production" | "unknown";

export interface DuffelInternalManualTestRequest {
  readonly requestKind: "server-internal-manual-test";
  readonly [DUFFEL_INTERNAL_MANUAL_REQUEST]: true;
}

export type DuffelManualTestGateDecision =
  | {
      readonly eligible: true;
      readonly environment: "local" | "preview";
      readonly activationState: "unavailable";
      readonly activationDirective: "manualTestEligible";
      readonly runnable: false;
      readonly reason: "allManualConditionsSatisfied";
    }
  | {
      readonly eligible: false;
      readonly environment: DuffelManualTestEnvironment;
      readonly activationState: "unavailable";
      readonly activationDirective: "withheld";
      readonly runnable: false;
      readonly reason:
        | "productionForbidden"
        | "environmentForbidden"
        | "publicDirectiveForbidden"
        | "credentialMissing"
        | "credentialInvalid"
        | "manualDirectiveDisabled"
        | "runtimeAdapterUnavailable"
        | "internalRequestRequired";
    };

export type DuffelManualTestEnvironmentSource = Readonly<
  Record<string, string | undefined>
>;

/** Creates an unforgeable capability from a server-only module. */
export function createDuffelInternalManualTestRequest(): DuffelInternalManualTestRequest {
  return Object.freeze({
    requestKind: "server-internal-manual-test" as const,
    [DUFFEL_INTERNAL_MANUAL_REQUEST]: true as const,
  });
}

export function resolveDuffelManualTestEnvironment(
  environment: DuffelManualTestEnvironmentSource,
): DuffelManualTestEnvironment {
  if (
    environment.VERCEL_ENV === "production" ||
    environment.NODE_ENV === "production"
  ) {
    return "production";
  }
  if (environment.VERCEL_ENV === "preview") return "preview";
  if (
    environment.VERCEL_ENV === "development" ||
    environment.NODE_ENV === "development" ||
    environment.NODE_ENV === "test"
  ) {
    return "local";
  }
  return "unknown";
}

function unavailable(
  environment: DuffelManualTestEnvironment,
  reason: Extract<DuffelManualTestGateDecision, { eligible: false }>["reason"],
): DuffelManualTestGateDecision {
  return Object.freeze({
    eligible: false,
    environment,
    activationState: "unavailable",
    activationDirective: "withheld",
    runnable: false,
    reason,
  });
}

/**
 * Computes future manual-test eligibility only. It never activates, registers,
 * constructs a transport, reveals a credential, or performs a network call.
 */
export function evaluateDuffelManualTestGate(input: {
  readonly environment: DuffelManualTestEnvironmentSource;
  readonly credential: DuffelCredentialResolution;
  readonly runtimeAdapterAvailable: boolean;
  readonly internalRequest: DuffelInternalManualTestRequest | null;
}): DuffelManualTestGateDecision {
  const runtimeEnvironment = resolveDuffelManualTestEnvironment(input.environment);
  if (runtimeEnvironment === "production") {
    return unavailable(runtimeEnvironment, "productionForbidden");
  }
  if (runtimeEnvironment !== "local" && runtimeEnvironment !== "preview") {
    return unavailable(runtimeEnvironment, "environmentForbidden");
  }
  if (
    (input.environment[DUFFEL_FORBIDDEN_PUBLIC_MANUAL_TEST_ENV_NAME] ?? "").trim()
      .length > 0
  ) {
    return unavailable(runtimeEnvironment, "publicDirectiveForbidden");
  }
  if (input.credential.state === "missing") {
    return unavailable(runtimeEnvironment, "credentialMissing");
  }
  if (input.credential.state !== "presentButInactive") {
    return unavailable(runtimeEnvironment, "credentialInvalid");
  }
  if (input.environment[DUFFEL_MANUAL_TEST_ENV_NAME] !== "1") {
    return unavailable(runtimeEnvironment, "manualDirectiveDisabled");
  }
  if (!input.runtimeAdapterAvailable) {
    return unavailable(runtimeEnvironment, "runtimeAdapterUnavailable");
  }
  if (
    input.internalRequest === null ||
    input.internalRequest[DUFFEL_INTERNAL_MANUAL_REQUEST] !== true
  ) {
    return unavailable(runtimeEnvironment, "internalRequestRequired");
  }
  return Object.freeze({
    eligible: true,
    environment: runtimeEnvironment,
    activationState: "unavailable",
    activationDirective: "manualTestEligible",
    runnable: false,
    reason: "allManualConditionsSatisfied",
  });
}
