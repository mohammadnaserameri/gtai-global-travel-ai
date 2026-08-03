import "../../server-only";

import { randomUUID } from "node:crypto";

import type { FlightOffer } from "../../../features/flights/flight-offer-types";
import type { FlightSearchIntent } from "../../../features/flights/search-intent-types";
import type { DevelopmentScenario } from "../../../features/flights/flight-offer-repository";
import { MAX_RESPONSE_OFFERS } from "../../../features/flights/flight-search-api-contract";
import { bucketDuration, noopAuditSink } from "./provider-audit";
import { normalizeProviderOffers } from "./provider-response-normalizer";
import { validateProviderOutcome } from "./provider-search-validation";
import { createProviderAbortScope, runWithAbortScope } from "./provider-timeout";
import type { ProviderRegistry } from "./provider-registry";
import type {
  OrchestratedSearchResult,
  ProviderAuditSink,
  ProviderRegistration,
  ProviderRunOutcome,
  ProviderRuntimeFailure,
  ProviderSearchOutcome,
} from "./provider-runtime-types";

/**
 * The server-side coordinator between the API route and the adapters.
 *
 * Its job is isolation. One provider being slow, throwing, returning nonsense
 * or being cancelled must not affect any other provider, must not reach the
 * customer as a raw error, and must not be silently rounded off into "no
 * results". Only one adapter is enabled in V2.7, but the orchestrator is
 * written — and verified with fixture adapters — for several, because that is
 * the property a future integration depends on.
 */

export interface OrchestratorOptions {
  readonly registry: ProviderRegistry;
  readonly auditSink?: ProviderAuditSink;
  /** Injected in tests so the deterministic script does not depend on wall-clock timing. */
  readonly now?: () => number;
}

export interface OrchestratedSearchInput {
  readonly intent: FlightSearchIntent;
  readonly signal: AbortSignal;
  readonly scenario: DevelopmentScenario;
}

/**
 * A random, opaque per-search correlation id.
 *
 * `crypto.randomUUID()` and nothing else. Not the canonical Search Intent,
 * not a hash of it, not a composition of route and dates: those are
 * reversible over a small search space, so treating them as anonymous would
 * be wrong. This value never leaves the server — it exists to correlate audit
 * events, and the client envelope has no field to carry it.
 */
function createSearchContextId(): string {
  return randomUUID();
}

function failureFrom(code: ProviderRuntimeFailure["code"]): ProviderRuntimeFailure {
  return { code };
}

/**
 * Runs one provider under its own timeout and cancellation scope.
 *
 * Every exit path disposes the scope, so no timer outlives the call and no
 * abort listener is left attached to the request signal.
 */
async function runProvider(
  registration: ProviderRegistration,
  input: OrchestratedSearchInput,
  searchContextId: string,
  now: () => number,
): Promise<ProviderRunOutcome> {
  const startedAt = now();
  const scope = createProviderAbortScope(input.signal, registration.timeoutMs);

  const finish = (
    status: ProviderRunOutcome["status"],
    offers: readonly FlightOffer[],
    failure: ProviderRuntimeFailure | null,
  ): ProviderRunOutcome => ({
    providerId: registration.providerId,
    status,
    offers,
    failure,
    durationMs: now() - startedAt,
  });

  try {
    const raced = await runWithAbortScope(scope, (signal) =>
      registration.adapter.search({
        intent: input.intent,
        signal,
        searchContextId,
        scenario: input.scenario,
      }),
    );

    // Cancellation and timeout stay distinct all the way out. A visitor
    // navigating away gets its own status — not a provider fault, and not an
    // audited failure; a slow provider is operational and must never be
    // flattened into "unknown". `cancelled` remains in the internal failure
    // taxonomy because orchestration still needs to reason about it.
    if (raced.kind === "cancelled") {
      return finish("cancelled", [], failureFrom("cancelled"));
    }
    if (raced.kind === "timedOut") {
      return finish("failed", [], failureFrom("timeout"));
    }

    const outcome: ProviderSearchOutcome = raced.value;
    const validation = validateProviderOutcome(
      outcome,
      registration.maximumOfferCount,
      input.intent,
    );
    if (!validation.ok) {
      // The adapter answered, but with something this boundary will not pass
      // on. That is the provider's failure, not a generic error.
      return finish("failed", [], failureFrom("malformedResponse"));
    }

    if (validation.failure !== null) {
      // The *validated* failure, not the adapter's original object — so no
      // unchecked field can survive by reference into audit or aggregation.
      //
      // An adapter is entitled to report a cancellation itself (it may notice
      // the signal before the race does), and that must reach the same
      // non-fault path as a race-detected cancellation. Otherwise the two
      // routes to the identical event would be audited differently.
      return validation.failure.code === "cancelled"
        ? finish("cancelled", [], validation.failure)
        : finish("failed", [], validation.failure);
    }
    return validation.offers.length === 0
      ? finish("empty", [], null)
      : finish("succeeded", validation.offers, null);
  } catch {
    // An adapter that throws instead of returning an outcome is a defect, but
    // it is *its* defect: it becomes one failed provider, and the thrown
    // value is deliberately not inspected, formatted or forwarded anywhere.
    return finish("failed", [], failureFrom("unknown"));
  } finally {
    scope.dispose();
  }
}

export async function orchestrateProviderSearch(
  input: OrchestratedSearchInput,
  options: OrchestratorOptions,
): Promise<OrchestratedSearchResult> {
  const auditSink = options.auditSink ?? noopAuditSink;
  const now = options.now ?? (() => Date.now());
  const searchContextId = createSearchContextId();
  const providers = options.registry.enabledProviders();

  // A disabled provider is never constructed into a run at all — it is not
  // executed and then discarded.
  if (providers.length === 0) {
    return { status: "failed", offers: [], outcomes: [], searchContextId };
  }

  for (const registration of providers) {
    auditSink.record({
      searchContextId,
      providerId: registration.providerId,
      event: "search.started",
      status: "started",
      durationBucketMs: null,
      offerCount: null,
      failureCode: null,
      occurredAt: new Date(now()).toISOString(),
    });
  }

  // `all`, not `allSettled` on raw adapter promises: `runProvider` already
  // converts every path into an outcome, so there is nothing left to reject
  // and one provider can never take the batch down.
  const outcomes = await Promise.all(
    providers.map((registration) =>
      runProvider(registration, input, searchContextId, now),
    ),
  );

  for (const outcome of outcomes) {
    const cancelled = outcome.status === "cancelled";
    auditSink.record({
      searchContextId,
      providerId: outcome.providerId,
      event: cancelled
        ? "search.cancelled"
        : outcome.status === "failed"
          ? "search.failed"
          : "search.completed",
      status: outcome.status,
      durationBucketMs: bucketDuration(outcome.durationMs),
      offerCount: outcome.offers.length,
      // No failure category on a cancellation: there is no fault to
      // categorize, and recording one would make it countable as a provider
      // problem downstream.
      failureCode: cancelled ? null : (outcome.failure?.code ?? null),
      occurredAt: new Date(now()).toISOString(),
    });
  }

  const offers = normalizeProviderOffers(
    outcomes.map((outcome) => outcome.offers),
    MAX_RESPONSE_OFFERS,
  );

  const succeeded = outcomes.filter((o) => o.status === "succeeded").length;
  const emptied = outcomes.filter((o) => o.status === "empty").length;
  // A cancellation counts as reduced coverage for aggregation — the provider
  // genuinely did not answer — but it is never a *fault*, which is why it is
  // tallied separately from `failed` and audited as its own event.
  const failed = outcomes.filter((o) => o.status === "failed").length;
  const cancelled = outcomes.filter((o) => o.status === "cancelled").length;
  const missing = failed + cancelled;

  // Four genuinely different situations, kept apart:
  //  - no provider answered → the search could not run;
  //  - some answered and some did not → coverage is reduced, and saying so is
  //    the honest option;
  //  - every provider answered but nobody had anything → a real empty result;
  //  - otherwise → a complete result.
  // Every provider cancelled is not an empty result and not a provider
  // failure of the ordinary kind — nobody looked. It is reported as `failed`
  // so the route answers 503 rather than telling the visitor there are no
  // flights, which is the same treatment total non-response already gets.
  const status: OrchestratedSearchResult["status"] =
    missing === outcomes.length
      ? "failed"
      : missing > 0
        ? "partial"
        : succeeded === 0 && emptied > 0
          ? "empty"
          : offers.length === 0
            ? "empty"
            : "success";

  return { status, offers, outcomes, searchContextId };
}
