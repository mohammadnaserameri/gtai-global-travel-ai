import "../../../server-only";

import type { ExternalProviderActivationState } from "../external/external-provider-types";
import {
  DUFFEL_TOKEN_REDACTION_LABEL,
  type DuffelCredentialAuditSummary,
} from "./duffel-credential-redaction";

export const DUFFEL_SERVER_TOKEN_NAME = "DUFFEL_ACCESS_TOKEN";
export const DUFFEL_FORBIDDEN_PUBLIC_TOKEN_NAME = "NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN";

const DUFFEL_CREDENTIAL_BRAND: unique symbol = Symbol("gtai.duffelCredential");

export type DuffelCredentialEnvironment = Readonly<
  Record<string, string | undefined>
>;

/** Opaque server-only holder. Accidental logging and serialization are redacted. */
export interface DuffelCredentialCapsule {
  readonly credentialId: "duffel-access-token";
  readonly [DUFFEL_CREDENTIAL_BRAND]: string;
  toString(): typeof DUFFEL_TOKEN_REDACTION_LABEL;
  toJSON(): typeof DUFFEL_TOKEN_REDACTION_LABEL;
}

function createDuffelCredentialCapsule(value: string): DuffelCredentialCapsule {
  const capsule = {
    credentialId: "duffel-access-token",
    [DUFFEL_CREDENTIAL_BRAND]: value,
  } as DuffelCredentialCapsule;
  const redact = () => DUFFEL_TOKEN_REDACTION_LABEL;
  for (const key of [
    "toString",
    "toJSON",
    Symbol.for("nodejs.util.inspect.custom"),
  ] as const) {
    Object.defineProperty(capsule, key, {
      value: redact,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }
  Object.defineProperty(capsule, DUFFEL_CREDENTIAL_BRAND, {
    value,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return Object.freeze(capsule);
}

interface DuffelCredentialResolutionBase {
  readonly providerId: "duffel-test-contract";
  readonly source: "server-env";
  readonly activationState: "unavailable";
  readonly activatesProvider: false;
}

export interface MissingDuffelCredential extends DuffelCredentialResolutionBase {
  readonly state: "missing";
  readonly credential: null;
}

export interface PresentButInactiveDuffelCredential extends DuffelCredentialResolutionBase {
  readonly state: "presentButInactive";
  readonly credential: DuffelCredentialCapsule;
}

export interface InvalidShapeDuffelCredential extends DuffelCredentialResolutionBase {
  readonly state: "invalidShape";
  readonly credential: null;
}

export interface ForbiddenPublicNameDuffelCredential extends DuffelCredentialResolutionBase {
  readonly state: "forbiddenPublicName";
  readonly credential: null;
}

export type DuffelCredentialResolution =
  | MissingDuffelCredential
  | PresentButInactiveDuffelCredential
  | InvalidShapeDuffelCredential
  | ForbiddenPublicNameDuffelCredential;

const RESOLUTION_BASE = Object.freeze({
  providerId: "duffel-test-contract" as const,
  source: "server-env" as const,
  activationState: "unavailable" as const,
  activatesProvider: false as const,
});

/** Conservative syntax check only; it never authenticates or calls Duffel. */
export function isConservativeDuffelTokenShape(value: string): boolean {
  return /^duffel_(?:test|live)_[A-Za-z0-9_-]{24,}$/.test(value);
}

/**
 * Resolves configuration state without activation.
 *
 * The injected environment makes verification deterministic. The default is
 * server-only `process.env`; no client module imports this file.
 */
export function resolveDuffelCredential(
  environment: DuffelCredentialEnvironment = process.env,
): DuffelCredentialResolution {
  const forbiddenPublicValue = environment[DUFFEL_FORBIDDEN_PUBLIC_TOKEN_NAME];
  if (
    forbiddenPublicValue !== undefined &&
    forbiddenPublicValue.trim().length > 0
  ) {
    return Object.freeze({
      ...RESOLUTION_BASE,
      state: "forbiddenPublicName",
      credential: null,
    });
  }

  const value = environment[DUFFEL_SERVER_TOKEN_NAME];
  if (value === undefined || value.trim().length === 0) {
    return Object.freeze({
      ...RESOLUTION_BASE,
      state: "missing",
      credential: null,
    });
  }
  if (!isConservativeDuffelTokenShape(value)) {
    return Object.freeze({
      ...RESOLUTION_BASE,
      state: "invalidShape",
      credential: null,
    });
  }
  return Object.freeze({
    ...RESOLUTION_BASE,
    state: "presentButInactive",
    credential: createDuffelCredentialCapsule(value),
  });
}

/**
 * The sole future-safe plaintext accessor. It has no V2.8-D call site and is
 * not imported by the inactive transport.
 */
export function revealDuffelCredentialForFutureTransport(
  capsule: DuffelCredentialCapsule,
): string {
  return capsule[DUFFEL_CREDENTIAL_BRAND];
}

/** Produces allowlisted audit metadata and never accepts a plaintext token. */
export function summarizeDuffelCredential(
  resolution: DuffelCredentialResolution,
): DuffelCredentialAuditSummary {
  switch (resolution.state) {
    case "missing":
      return Object.freeze({
        providerId: resolution.providerId,
        configured: false,
        source: resolution.source,
        reason: "missing",
        credential: null,
      });
    case "invalidShape":
      return Object.freeze({
        providerId: resolution.providerId,
        configured: false,
        source: resolution.source,
        reason: "invalid-shape",
        credential: null,
      });
    case "forbiddenPublicName":
      return Object.freeze({
        providerId: resolution.providerId,
        configured: false,
        source: resolution.source,
        reason: "public-name-forbidden",
        credential: null,
      });
    case "presentButInactive":
      return Object.freeze({
        providerId: resolution.providerId,
        configured: true,
        source: resolution.source,
        reason: "present-but-inactive",
        credential: DUFFEL_TOKEN_REDACTION_LABEL,
      });
  }
}

export function credentialResolutionActivationState(
  _resolution: DuffelCredentialResolution,
): ExternalProviderActivationState {
  void _resolution;
  return "unavailable";
}
