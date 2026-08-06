import "../../../server-only";

import type { ExternalProviderSecretReference } from "./external-provider-types";

/**
 * The secret boundary.
 *
 * The rule this module exists to make mechanical: a credential may be *used*
 * but must never be *stringified*. Most credential leaks are not deliberate —
 * they are a `JSON.stringify` of a config object, a template literal in an
 * error message, a `console.log` of a request during debugging. Each of those
 * is a normal thing to write, and each of them publishes the secret.
 *
 * So resolved secrets are wrapped in a holder whose `toString`, `toJSON` and
 * Node inspection hook all return a fixed redaction marker. Reading the actual
 * value requires calling `revealSecret` explicitly — a call that is greppable,
 * reviewable, and asserted on by `verify:provider-integration-readiness`.
 *
 * V2.8-B resolves nothing. No provider is configured, no environment variable
 * is required, and `resolveProviderSecrets` against today's configuration
 * returns "not present" for every reference. The machinery exists so that the
 * later stage which *does* resolve secrets inherits these guarantees instead of
 * inventing them under delivery pressure.
 */

/** What every accidental stringification of a secret produces instead. */
export const SECRET_REDACTION_MARKER = "[redacted]";

/**
 * A prefix Next.js inlines into the browser bundle.
 *
 * A provider credential named this way is not a secret with a configuration
 * problem — it is a published credential. Rejected structurally rather than
 * documented as discouraged.
 */
export const CLIENT_EXPOSED_ENV_PREFIX = "NEXT_PUBLIC_";

const SECRET_BRAND: unique symbol = Symbol("gtai.externalProviderSecret");

/**
 * An opaque credential holder.
 *
 * The branded field is not readable from outside this module, so the only
 * supported way to obtain the plaintext is `revealSecret`. Everything else —
 * logging, serializing, interpolating, inspecting in a debugger — yields the
 * redaction marker.
 */
export interface ResolvedProviderSecret {
  readonly secretId: string;
  readonly [SECRET_BRAND]: string;
  toString(): string;
  toJSON(): string;
}

/**
 * Wraps a plaintext credential.
 *
 * `toString` and `toJSON` are own, non-enumerable properties rather than
 * prototype methods, so a spread or `Object.assign` cannot strip them and
 * leave a bare object whose default serialization would expose the branded
 * field. `util.inspect.custom` covers `console.log` under Node, which uses
 * neither of the other two.
 */
function createResolvedSecret(
  secretId: string,
  value: string,
): ResolvedProviderSecret {
  const holder = {
    secretId,
    [SECRET_BRAND]: value,
  } as ResolvedProviderSecret;

  const redact = () => SECRET_REDACTION_MARKER;
  for (const key of [
    "toString",
    "toJSON",
    Symbol.for("nodejs.util.inspect.custom"),
  ] as const) {
    Object.defineProperty(holder, key, {
      value: redact,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }
  // The credential itself is non-enumerable, so `{...secret}`,
  // `Object.keys` and a default `JSON.stringify` of a containing object all
  // omit it even before the hooks above run.
  Object.defineProperty(holder, SECRET_BRAND, {
    value,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  return Object.freeze(holder);
}

/**
 * The single supported way to read a credential's plaintext.
 *
 * Deliberately a standalone named function rather than a method: a call site
 * reads `revealSecret(x)`, which is greppable and reviewable, where `x.value`
 * would blend into ordinary property access. Verification asserts that this
 * function is not called anywhere outside the request-construction path.
 */
export function revealSecret(secret: ResolvedProviderSecret): string {
  return secret[SECRET_BRAND];
}

export type SecretResolutionStatus =
  "resolved" | "missing" | "rejectedClientExposedName" | "rejectedEmptyValue";

export interface SecretResolution {
  readonly secretId: string;
  readonly status: SecretResolutionStatus;
  /** Present only when `status === "resolved"`. Opaque even then. */
  readonly secret: ResolvedProviderSecret | null;
}

export interface ProviderSecretResolutionResult {
  readonly resolutions: readonly SecretResolution[];
  /** True only when every **required** reference resolved. */
  readonly complete: boolean;
  /** Ids of required references that did not resolve. Names only, never values. */
  readonly missingRequired: readonly string[];
}

/**
 * Reads the environment. Injected so the resolver stays deterministic and can
 * be exercised without mutating the real process environment.
 */
export type EnvironmentReader = (name: string) => string | undefined;

const processEnvironmentReader: EnvironmentReader = (name) => process.env[name];

/**
 * Resolves a provider's declared secret references.
 *
 * Three rejections, all structural rather than advisory:
 *
 * - a `NEXT_PUBLIC_*` name is refused outright, because that value is in the
 *   browser bundle and resolving it would launder a published string into
 *   something the code treats as confidential;
 * - an empty or whitespace-only value counts as **missing**, not as present.
 *   An empty string is falsy in some checks and truthy in others, and a
 *   provider that activates because `API_KEY=""` was set is exactly the silent
 *   activation this stage forbids;
 * - a value that resolves is wrapped immediately and never held as a bare
 *   string beyond this function.
 */
export function resolveProviderSecrets(
  references: readonly ExternalProviderSecretReference[],
  readEnvironment: EnvironmentReader = processEnvironmentReader,
): ProviderSecretResolutionResult {
  const resolutions: SecretResolution[] = [];
  const missingRequired: string[] = [];

  for (const reference of references) {
    if (reference.environmentVariable.startsWith(CLIENT_EXPOSED_ENV_PREFIX)) {
      resolutions.push({
        secretId: reference.secretId,
        status: "rejectedClientExposedName",
        secret: null,
      });
      if (reference.required) missingRequired.push(reference.secretId);
      continue;
    }

    const raw = readEnvironment(reference.environmentVariable);
    if (raw === undefined) {
      resolutions.push({
        secretId: reference.secretId,
        status: "missing",
        secret: null,
      });
      if (reference.required) missingRequired.push(reference.secretId);
      continue;
    }
    if (raw.trim().length === 0) {
      resolutions.push({
        secretId: reference.secretId,
        status: "rejectedEmptyValue",
        secret: null,
      });
      if (reference.required) missingRequired.push(reference.secretId);
      continue;
    }

    resolutions.push({
      secretId: reference.secretId,
      status: "resolved",
      secret: createResolvedSecret(reference.secretId, raw),
    });
  }

  return {
    resolutions,
    complete: missingRequired.length === 0,
    missingRequired,
  };
}

/**
 * Validates a secret reference's *shape* — no environment access, no value.
 *
 * Separated from resolution so a definition can be checked at construction
 * time, before any environment is consulted, and so verification can assert on
 * declarations without touching `process.env`.
 */
export function isValidSecretReference(
  reference: ExternalProviderSecretReference,
): boolean {
  if (reference.secretId.trim().length === 0) return false;
  if (reference.environmentVariable.trim().length === 0) return false;
  if (reference.environmentVariable.startsWith(CLIENT_EXPOSED_ENV_PREFIX)) {
    return false;
  }
  if (!/^[A-Z][A-Z0-9_]*$/.test(reference.environmentVariable)) return false;
  if (reference.parameterName.trim().length === 0) return false;
  return true;
}
