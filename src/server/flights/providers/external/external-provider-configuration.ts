import "../../../server-only";

import {
  resolveProviderActivationState,
  SHIPPED_OPERATOR_DIRECTIVE,
  isProviderRunnable,
  type ActivationDecision,
  type OperatorActivationDirective,
} from "./external-provider-activation";
import { isValidRateLimit } from "./external-provider-rate-limit";
import { CONTRACT_FIXTURE_PROVIDER_ID } from "./fixtures/fixture-identity";
import {
  isValidRetryPolicy,
  isValidTimeoutPolicy,
} from "./external-provider-retry";
import { isValidSecretReference } from "./external-provider-secrets";
import type { EnvironmentReader } from "./external-provider-secrets";
import type {
  ExternalFlightProviderDefinition,
  ExternalProviderActivationState,
} from "./external-provider-types";

/**
 * The shipped external-provider configuration — which is, deliberately, empty.
 *
 * `SHIPPED_EXTERNAL_PROVIDERS` is an empty array. Not a populated array of
 * disabled entries, not a commented-out block: empty. A disabled entry is one
 * boolean away from being an enabled one, and the whole point of this stage is
 * that no such boolean exists.
 *
 * The contract fixture is **not** listed here. It lives in `fixtures/`, is
 * constructed by verification, and is unreachable from this module — the same
 * arrangement V2.7 uses for its fixture adapters.
 *
 * The local deterministic demonstration provider is untouched by all of this.
 * It is a V2.7 runtime provider registered in `provider-registry.ts`, holds no
 * credential and reaches no network, and it remains the one enabled provider
 * serving every search.
 */

/**
 * Every external provider GTAI ships. Empty, and asserted to be empty.
 *
 * Adding an entry here does not activate anything — `resolveProviderActivationState`
 * still requires an operator directive — but it is the point at which a human
 * decision has been recorded, so it should be an explicit one.
 */
export const SHIPPED_EXTERNAL_PROVIDERS: readonly ExternalFlightProviderDefinition[] =
  Object.freeze([]);

export type DefinitionValidationReason =
  | "invalidProviderId"
  | "invalidTimeoutPolicy"
  | "invalidRetryPolicy"
  | "invalidRateLimit"
  | "invalidSecretReferences"
  | "activeCapabilityClaim";

/**
 * Validates a definition's internal consistency.
 *
 * The last check is the interesting one, and it is this stage's central rule
 * expressed as code: **an inactive provider may not claim a capability.** A
 * capability matrix is a promise about observed behaviour. A provider nobody
 * has ever successfully called has not observed anything, so a `true` in its
 * matrix is a guess — and `checkCapabilitySupport` would let searches through
 * on the strength of it.
 */
export function validateProviderDefinition(
  definition: ExternalFlightProviderDefinition,
  state: ExternalProviderActivationState,
): readonly DefinitionValidationReason[] {
  const reasons: DefinitionValidationReason[] = [];

  if (
    typeof definition.providerId !== "string" ||
    definition.providerId.trim().length === 0 ||
    definition.providerId !== definition.providerId.trim()
  ) {
    reasons.push("invalidProviderId");
  }
  if (!isValidTimeoutPolicy(definition.timeoutPolicy)) {
    reasons.push("invalidTimeoutPolicy");
  }
  if (!isValidRetryPolicy(definition.retryPolicy)) {
    reasons.push("invalidRetryPolicy");
  }
  if (!isValidRateLimit(definition.rateLimit)) {
    reasons.push("invalidRateLimit");
  }
  if (
    definition.secretReferences.length === 0 ||
    !definition.secretReferences.every(isValidSecretReference)
  ) {
    reasons.push("invalidSecretReferences");
  }
  if (state !== "active" && claimsAnyCapability(definition)) {
    reasons.push("activeCapabilityClaim");
  }

  return reasons;
}

/** True when a definition asserts it can do anything at all. */
export function claimsAnyCapability(
  definition: ExternalFlightProviderDefinition,
): boolean {
  const c = definition.capabilities;
  return (
    c.supportsOneWay ||
    c.supportsRoundTrip ||
    c.supportsMultiCity ||
    c.supportsDirectOnly ||
    c.supportsCabinClass ||
    c.supportsAdults ||
    c.supportsChildren ||
    c.supportsInfants ||
    c.supportsBookingLinks ||
    c.supportsPartialResults ||
    c.supportedMarkets.length > 0 ||
    c.supportedLocales.length > 0 ||
    c.supportedCurrencies.length > 0 ||
    c.maximumLegCount > 0 ||
    c.maximumTravellerCount > 0
  );
}

export interface ExternalProviderStatus {
  readonly providerId: string;
  readonly decision: ActivationDecision;
  readonly runnable: boolean;
  readonly validationFailures: readonly DefinitionValidationReason[];
}

/**
 * Resolves the status of every shipped external provider.
 *
 * Returns an empty array today, because nothing is shipped. It is written to
 * handle several because the property that matters — one provider's
 * misconfiguration cannot affect another's status — is only true if it is built
 * that way from the start.
 */
export function resolveExternalProviderStatuses(
  definitions: readonly ExternalFlightProviderDefinition[] = SHIPPED_EXTERNAL_PROVIDERS,
  directive: OperatorActivationDirective = SHIPPED_OPERATOR_DIRECTIVE,
  readEnvironment?: EnvironmentReader,
): readonly ExternalProviderStatus[] {
  return definitions.map((definition) => {
    const decision = resolveProviderActivationState({
      definition,
      directive,
      readEnvironment,
    });
    const validationFailures = validateProviderDefinition(
      definition,
      decision.state,
    );
    return {
      providerId: definition.providerId,
      decision,
      // A definition that fails validation is never runnable, whatever its
      // activation decision says. Two independent gates, and both must pass.
      runnable:
        isProviderRunnable(decision.state) && validationFailures.length === 0,
      validationFailures,
    };
  });
}

/**
 * The providers that may actually be called.
 *
 * Today: none, and `verify:provider-integration-readiness` asserts that this returns an
 * empty array against the shipped configuration.
 */
export function runnableExternalProviders(
  statuses: readonly ExternalProviderStatus[] = resolveExternalProviderStatuses(),
): readonly ExternalProviderStatus[] {
  return statuses.filter((status) => status.runnable);
}

/**
 * Whether the search runtime must fall back to the local demonstration
 * provider.
 *
 * True whenever no external provider is runnable — which is always, today. The
 * fallback is not an error path: it is the normal, correct behaviour of a
 * product whose only connected data source is its own deterministic generator,
 * and the results it produces are labelled as demonstration data throughout the
 * interface.
 *
 * Expressed as a named predicate rather than an implicit `if (providers.length === 0)`
 * so the intent survives a future refactor, and so verification has one symbol
 * to point at.
 */
export function shouldFallBackToLocalProvider(
  statuses: readonly ExternalProviderStatus[] = resolveExternalProviderStatuses(),
): boolean {
  return runnableExternalProviders(statuses).length === 0;
}

/* ------------------------------------------------------------------------- */
/* Registry integration                                                      */
/* ------------------------------------------------------------------------- */

/**
 * Whether a provider id may be *executed* by the search runtime.
 *
 * Always `false` today, and structurally false for the contract fixture even
 * if somebody later ships an external provider. The fixture exists to be
 * inspected by readiness tooling, never to answer a search — so it is refused
 * here by name rather than by relying on it happening not to be configured.
 *
 * The V2.7 registry is the only thing that decides what actually runs, and it
 * does not import this layer at all. This function is the *second* gate, not
 * the first: a provider that somehow reached the runtime would still be
 * refused here.
 */
export function isExecutableProviderId(providerId: string): boolean {
  if (providerId === CONTRACT_FIXTURE_PROVIDER_ID) return false;
  return runnableExternalProviders().some(
    (status) => status.providerId === providerId,
  );
}

/**
 * Resolves a provider id that arrived from outside the server.
 *
 * The answer is always `null`. Nothing a client sends — a query parameter, a
 * body field, a header — may select a provider, and an unknown id is refused
 * the same way a known-but-inactive one is. Returning `null` uniformly means an
 * attacker cannot use the response to learn which provider ids exist.
 *
 * This is deliberately a total function over `string` rather than a lookup that
 * throws: a throw would be a distinguishable signal in itself.
 */
export function resolveRequestedProviderId(
  requestedId: string,
): ExternalProviderStatus | null {
  // Both gates, in order. `isExecutableProviderId` refuses the contract fixture
  // by name and anything that is not currently runnable — which is everything,
  // today. The lookup below never runs, but it is written so that if a provider
  // is genuinely shipped and activated later, this function resolves only that
  // provider and still never the fixture.
  if (!isExecutableProviderId(requestedId)) return null;
  return (
    runnableExternalProviders().find(
      (status) => status.providerId === requestedId,
    ) ?? null
  );
}

/**
 * The providers a readiness tool may *inspect*.
 *
 * Distinct from `runnableExternalProviders`, and that distinction is the point
 * of this function existing. Readiness tooling needs to see the contract
 * fixture — that is how the contracts get exercised — while the search runtime
 * must never see it. One list for looking, another for running.
 *
 * Server-side only, like everything else here. There is no route, no API and no
 * client path that reaches it.
 */
export function inspectableProviderDefinitions(): readonly ExternalFlightProviderDefinition[] {
  return [...SHIPPED_EXTERNAL_PROVIDERS];
}
