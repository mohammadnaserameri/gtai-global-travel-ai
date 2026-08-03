import "../../server-only";

import { MAX_PROVIDER_OFFER_COUNT } from "../../../features/flights/flight-search-api-contract";
import { localDeterministicProviderAdapter } from "./adapters/local-deterministic-provider-adapter";
import type { ProviderRegistration } from "./provider-runtime-types";

/**
 * The one trusted place that decides which providers exist and how they run.
 *
 * Nothing in a request can add, select, enable, re-time or re-limit a
 * provider. That is not a convenience — it is the whole reason the registry
 * exists. A client that fully controls its payload still cannot name a
 * provider, extend a timeout, raise an offer cap or point a search anywhere,
 * because none of those values are ever read from a request.
 */

/** A provider that answers in under a second locally still gets a real ceiling. */
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 30_000;
const MIN_OFFER_LIMIT = 1;
/**
 * The per-provider contribution ceiling, imported rather than restated.
 *
 * It used to be a private `200` here while the client independently bounded a
 * provider summary's `offerCount` by the *final* response ceiling of 60. Two
 * literals, two meanings, one of them wrong: a provider allowed to contribute
 * 100 offers had its truthful summary rejected downstream. One shared constant
 * removes the possibility of that disagreement rather than fixing this
 * instance of it.
 */
const MAX_OFFER_LIMIT = MAX_PROVIDER_OFFER_COUNT;

export class ProviderRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderRegistryError";
  }
}

export interface ProviderRegistry {
  /** Only enabled providers, in deterministic run order. */
  enabledProviders(): readonly ProviderRegistration[];
  /** Every registration, enabled or not — for operator tooling and tests. */
  allProviders(): readonly ProviderRegistration[];
  get(providerId: string): ProviderRegistration | null;
}

function assertValidRegistration(registration: ProviderRegistration): void {
  const { providerId, timeoutMs, maximumOfferCount } = registration;

  if (typeof providerId !== "string" || providerId.trim().length === 0) {
    throw new ProviderRegistryError(
      "A provider registration needs a non-empty id.",
    );
  }
  if (providerId !== providerId.trim()) {
    throw new ProviderRegistryError(
      `Provider id "${providerId}" has surrounding whitespace.`,
    );
  }
  if (registration.adapter.providerId !== providerId) {
    // A registration whose adapter disagrees about its own identity would
    // make every audit event and every summary attributable to the wrong
    // provider.
    throw new ProviderRegistryError(
      `Provider "${providerId}" is registered with an adapter that identifies as "${registration.adapter.providerId}".`,
    );
  }
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < MIN_TIMEOUT_MS ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new ProviderRegistryError(
      `Provider "${providerId}" has an out-of-range timeout.`,
    );
  }
  if (
    !Number.isInteger(maximumOfferCount) ||
    maximumOfferCount < MIN_OFFER_LIMIT ||
    maximumOfferCount > MAX_OFFER_LIMIT
  ) {
    throw new ProviderRegistryError(
      `Provider "${providerId}" has an out-of-range maximum offer count.`,
    );
  }
  if (!Number.isInteger(registration.priority)) {
    throw new ProviderRegistryError(
      `Provider "${providerId}" has a non-integer priority.`,
    );
  }
}

/**
 * Builds a registry, rejecting an invalid configuration at construction time
 * rather than at the first search.
 *
 * A duplicate id is fatal rather than last-wins: two registrations claiming
 * one id makes every downstream attribution ambiguous, and silently keeping
 * one of them would hide a real deployment mistake.
 */
export function createProviderRegistry(
  registrations: readonly ProviderRegistration[],
): ProviderRegistry {
  const byId = new Map<string, ProviderRegistration>();

  for (const registration of registrations) {
    assertValidRegistration(registration);
    if (byId.has(registration.providerId)) {
      throw new ProviderRegistryError(
        `Duplicate provider id "${registration.providerId}".`,
      );
    }
    byId.set(registration.providerId, registration);
  }

  const ordered = [...byId.values()].sort((a, b) =>
    a.priority === b.priority
      ? a.providerId.localeCompare(b.providerId)
      : a.priority - b.priority,
  );

  return {
    enabledProviders: () => ordered.filter((entry) => entry.enabled),
    allProviders: () => ordered,
    get: (providerId) => byId.get(providerId) ?? null,
  };
}

/**
 * The V2.7 runtime registry: exactly one enabled provider, and it is local.
 *
 * There is no real provider here, no origin to reach, and nothing to
 * authenticate against. Fixture adapters used to prove partial-failure,
 * timeout and cancellation behaviour are constructed by the verification
 * script against `createProviderRegistry`; they are never registered here and
 * so can never appear in the interface.
 */
export const runtimeProviderRegistry: ProviderRegistry = createProviderRegistry([
  {
    providerId: "gtai-local-demo",
    enabled: true,
    label: "GTAI local deterministic demonstration adapter",
    adapter: localDeterministicProviderAdapter,
    timeoutMs: 5_000,
    maximumOfferCount: 40,
    priority: 0,
  },
]);
