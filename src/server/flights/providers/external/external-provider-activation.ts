import "../../../server-only";

import {
  isValidSecretReference,
  resolveProviderSecrets,
  type EnvironmentReader,
} from "./external-provider-secrets";
import type {
  ExternalFlightProviderDefinition,
  ExternalProviderActivationState,
} from "./external-provider-types";

/**
 * Provider activation.
 *
 * The failure mode this module is built against is *silent activation*: a
 * provider that starts serving live traffic because a module was imported, a
 * file was added, or the last environment variable happened to land. Each of
 * those is an accident that looks like progress, and by the time anyone
 * notices, real prices have been shown to real people.
 *
 * So activation requires an explicit, server-side operator decision that is
 * separate from configuration being complete. Configuration alone gets a
 * provider to `configured` and no further. There is no code path from
 * "credentials present" to `active`.
 *
 * V2.8-B ships no operator directive and no configured provider, so every
 * external provider resolves to `unavailable`. The local deterministic
 * demonstration adapter is unaffected — it is a V2.7 runtime provider, holds
 * no credential, reaches no network, and remains the only enabled provider.
 */

/**
 * An operator's explicit intent, supplied server-side.
 *
 * Deliberately a three-value type rather than a boolean. `withheld` is not the
 * same as `suspend`: the first is "nobody has decided", the second is "somebody
 * decided against". A boolean would collapse them and make a never-configured
 * provider indistinguishable from a deliberately withdrawn one.
 */
export type OperatorActivationDirective = "withheld" | "enable" | "suspend";

export interface ActivationInput {
  readonly definition: ExternalFlightProviderDefinition;
  readonly directive: OperatorActivationDirective;
  readonly readEnvironment?: EnvironmentReader;
}

export interface ActivationDecision {
  readonly providerId: string;
  readonly state: ExternalProviderActivationState;
  /** Stable machine-readable reason. Safe to log — names only, never values. */
  readonly reason:
    | "noOperatorDirective"
    | "operatorSuspended"
    | "missingRequiredSecrets"
    | "invalidSecretDeclaration"
    | "invalidOrigin"
    | "configurationComplete"
    | "operatorEnabled";
  /** Secret ids that blocked activation. Ids only. */
  readonly missingRequired: readonly string[];
}

/**
 * An origin is only usable if it is `https:`, has no credentials, no path, no
 * query and no fragment.
 *
 * Embedded credentials in an origin (`https://key@host`) are the specific case
 * worth naming: they read as a hostname, they survive string concatenation,
 * and they put a credential somewhere no redaction layer is looking.
 */
export function isUsableProviderOrigin(origin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.username.length > 0 || parsed.password.length > 0) return false;
  if (parsed.search.length > 0 || parsed.hash.length > 0) return false;
  if (parsed.pathname !== "/" && parsed.pathname !== "") return false;
  if (parsed.hostname.length === 0) return false;
  return true;
}

/**
 * Resolves a provider's activation state.
 *
 * Deterministic and total: same definition, same directive and same
 * environment always produce the same decision, and every branch returns one.
 *
 * The order of the checks is the policy. The operator directive is consulted
 * **first**, so no amount of complete configuration can produce `active`
 * without it, and a suspension cannot be overridden by fixing the config. Only
 * after an `enable` directive does configuration completeness matter — and an
 * incomplete configuration under `enable` still falls back to `unavailable`
 * rather than starting a provider that cannot authenticate.
 */
export function resolveProviderActivationState(
  input: ActivationInput,
): ActivationDecision {
  const { definition, directive, readEnvironment } = input;
  const providerId = definition.providerId;

  // A suspension is an explicit operator decision and outranks everything.
  if (directive === "suspend") {
    return {
      providerId,
      state: "suspended",
      reason: "operatorSuspended",
      missingRequired: [],
    };
  }

  const declarationsValid =
    definition.secretReferences.every(isValidSecretReference) &&
    definition.secretReferences.length > 0;
  if (!declarationsValid) {
    return {
      providerId,
      state: "unavailable",
      reason: "invalidSecretDeclaration",
      missingRequired: definition.secretReferences
        .filter((reference) => !isValidSecretReference(reference))
        .map((reference) => reference.secretId),
    };
  }

  if (!isUsableProviderOrigin(definition.allowedOrigin)) {
    return {
      providerId,
      state: "unavailable",
      reason: "invalidOrigin",
      missingRequired: [],
    };
  }

  const secrets = resolveProviderSecrets(
    definition.secretReferences,
    readEnvironment,
  );
  if (!secrets.complete) {
    return {
      providerId,
      state: "unavailable",
      reason: "missingRequiredSecrets",
      missingRequired: secrets.missingRequired,
    };
  }

  // Configuration is complete. That is *still* not activation.
  if (directive === "withheld") {
    return {
      providerId,
      state: "configured",
      reason: "noOperatorDirective",
      missingRequired: [],
    };
  }

  return {
    providerId,
    state: "active",
    reason: "operatorEnabled",
    missingRequired: [],
  };
}

/**
 * The only state in which a provider may be asked to build a request.
 *
 * A single predicate rather than an inline `=== "active"` at each call site, so
 * that if the rule ever gains nuance there is one place to change and one place
 * for verification to point at.
 */
export function isProviderRunnable(
  state: ExternalProviderActivationState,
): boolean {
  return state === "active";
}

/**
 * V2.8-B's shipped operator directive for every external provider.
 *
 * A named constant rather than a literal at the call site, so "no external
 * provider is switched on" is one greppable fact that verification asserts
 * rather than a property spread across several files.
 */
export const SHIPPED_OPERATOR_DIRECTIVE: OperatorActivationDirective = "withheld";
