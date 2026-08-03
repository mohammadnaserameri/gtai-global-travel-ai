import "../../../server-only";

import { generateDemoOffers } from "../../../../features/flights/demo-offer-generation";
import type {
  FlightProviderAdapter,
  ProviderSearchContext,
  ProviderSearchOutcome,
} from "../provider-runtime-types";

/**
 * The only adapter enabled in the V2.7 runtime.
 *
 * It is a real adapter against a fake provider, which is exactly the point of
 * this stage: the orchestration, validation, normalization, cancellation and
 * audit machinery all run for real, and the only thing that is not real is
 * the inventory. Nothing here reaches the network, the filesystem, the clock
 * or the environment — every offer is a pure function of the normalized
 * Search Intent, produced by the single shared generator in
 * `demo-offer-generation.ts` rather than a second copy of it.
 *
 * What it never returns is as important as what it does: no redirect URL, no
 * affiliate URL, no booking reference, no passenger data, and no raw
 * technical error. A failure is a typed code; the customer-facing wording for
 * it lives in the locale dictionaries, not here.
 */

const PROVIDER_ID = "gtai-local-demo";

/**
 * A deliberate, constant latency so the loading state is genuinely exercised
 * end to end. Constant rather than random, so a search remains reproducible.
 */
const NORMAL_LATENCY_MS = 400;

/**
 * The `slow` development scenario's latency. Long enough to navigate away
 * mid-flight and observe a real cancellation, still comfortably under the
 * registry's 5s provider timeout so the two remain distinguishable.
 */
const SLOW_LATENCY_MS = 3_000;

/** Resolves after `ms`, or as soon as `signal` aborts — always cleaning up both. */
function delay(ms: number, signal: AbortSignal): Promise<"elapsed" | "aborted"> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve("aborted");
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve("aborted");
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve("elapsed");
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export const localDeterministicProviderAdapter: FlightProviderAdapter = {
  providerId: PROVIDER_ID,

  async search(context: ProviderSearchContext): Promise<ProviderSearchOutcome> {
    // Checked before any work, so an already-cancelled search never pays for
    // a generation pass it will not use.
    if (context.signal.aborted) {
      return { ok: false, failure: { code: "cancelled" } };
    }

    const latency =
      context.scenario === "slow" ? SLOW_LATENCY_MS : NORMAL_LATENCY_MS;
    const waited = await delay(latency, context.signal);
    if (waited === "aborted") {
      return { ok: false, failure: { code: "cancelled" } };
    }

    // The controlled development scenarios, from the shared allowlist. These
    // exercise the runtime's own paths; they are not provider error
    // injection, and no value outside the allowlist can reach here.
    if (context.scenario === "error") {
      return { ok: false, failure: { code: "unavailable" } };
    }
    if (context.scenario === "empty") {
      return { ok: true, offers: [] };
    }

    return { ok: true, offers: generateDemoOffers(context.intent) };
  },
};
