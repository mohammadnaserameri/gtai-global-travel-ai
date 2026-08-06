import "../../../server-only";

import type { ExternalProviderActivationState } from "../external/external-provider-types";
import type { DuffelCredentialResolution } from "./duffel-credential-resolver";

export const DUFFEL_SHIPPED_ACTIVATION_DIRECTIVE = "withheld" as const;

export interface DuffelActivationGuardDecision {
  readonly providerId: "duffel-test-contract";
  readonly state: Extract<ExternalProviderActivationState, "unavailable">;
  readonly directive: typeof DUFFEL_SHIPPED_ACTIVATION_DIRECTIVE;
  readonly runnable: false;
  readonly reason:
    | "credentialMissing"
    | "credentialInvalid"
    | "publicCredentialForbidden"
    | "activationDirectiveWithheld";
}

/**
 * V2.8-D has no enabling directive. Every credential state remains unavailable.
 */
export function guardDuffelActivation(
  resolution: DuffelCredentialResolution,
): DuffelActivationGuardDecision {
  const reason =
    resolution.state === "missing"
      ? "credentialMissing"
      : resolution.state === "invalidShape"
        ? "credentialInvalid"
        : resolution.state === "forbiddenPublicName"
          ? "publicCredentialForbidden"
          : "activationDirectiveWithheld";
  return Object.freeze({
    providerId: "duffel-test-contract",
    state: "unavailable",
    directive: DUFFEL_SHIPPED_ACTIVATION_DIRECTIVE,
    runnable: false,
    reason,
  });
}
