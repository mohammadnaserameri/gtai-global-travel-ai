import "../../server-only";

/**
 * Cancellation and timeout, kept genuinely distinguishable.
 *
 * The naive shape for this is `Promise.race([work, timeout])`, and it is
 * wrong in three ways that all matter here: the losing operation is never
 * cleaned up (a pending timer keeps the process awake), a late rejection from
 * the abandoned side becomes an unhandled rejection, and the caller cannot
 * tell *why* it lost — a visitor navigating away and a provider being slow
 * arrive as the same event. This module fixes all three.
 */

export type RaceOutcome<T> =
  | { readonly kind: "completed"; readonly value: T }
  | { readonly kind: "cancelled" }
  | { readonly kind: "timedOut" };

/**
 * A per-provider `AbortSignal` that fires on either the caller's abort or the
 * provider's own timeout, plus a `reason` the caller can read afterwards.
 *
 * The two causes are tracked separately even though the adapter sees one
 * signal: the adapter only needs to know it should stop, while the
 * orchestrator needs to know whether to record a cancellation (not a provider
 * fault) or a timeout (an operational one).
 */
export interface ProviderAbortScope {
  readonly signal: AbortSignal;
  /** Clears the timer and removes the upstream listener. Safe to call more than once. */
  dispose(): void;
  reason(): "none" | "cancelled" | "timedOut";
}

export function createProviderAbortScope(
  upstream: AbortSignal,
  timeoutMs: number,
): ProviderAbortScope {
  const controller = new AbortController();
  let cause: "none" | "cancelled" | "timedOut" = "none";
  let disposed = false;

  const onUpstreamAbort = () => {
    if (cause === "none") cause = "cancelled";
    controller.abort();
  };

  // A timer is only armed if there is something left to time. If the caller
  // has already aborted we take the cancelled path immediately, so a
  // navigated-away request never spends a timeout period pretending to work.
  let timer: ReturnType<typeof setTimeout> | null = null;

  if (upstream.aborted) {
    cause = "cancelled";
    controller.abort();
  } else {
    upstream.addEventListener("abort", onUpstreamAbort, { once: true });
    timer = setTimeout(() => {
      if (cause === "none") cause = "timedOut";
      controller.abort();
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    dispose() {
      // Idempotent: the orchestrator calls this from a `finally`, and a
      // second call from an error path must not double-remove a listener or
      // clear a timer id that has been reused.
      if (disposed) return;
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      upstream.removeEventListener("abort", onUpstreamAbort);
    },
    reason() {
      return cause;
    },
  };
}

/**
 * Runs `work` under a scope, resolving as soon as the scope aborts even if
 * `work` itself keeps running.
 *
 * A late resolution from an abandoned adapter is deliberately ignored rather
 * than allowed to overwrite the outcome — but the promise is still consumed,
 * so a late *rejection* cannot surface as an unhandled rejection. That is the
 * part `Promise.race` alone does not give you.
 *
 * Cancellation is also checked *before* the adapter runs, twice: once on
 * entry, and once after a single microtask yield. Together those mean an
 * already-aborted scope and a scope aborted in the same turn as the call both
 * result in zero adapter invocations, not merely a cancelled outcome.
 */
export async function runWithAbortScope<T>(
  scope: ProviderAbortScope,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<RaceOutcome<T>> {
  const outcomeForReason = (): RaceOutcome<T> =>
    scope.reason() === "timedOut" ? { kind: "timedOut" } : { kind: "cancelled" };

  // An already-aborted scope returns before `work` is referenced at all.
  // Constructing a resolved abort promise and *then* calling the adapter
  // would win the race but still have started the provider: a request the
  // visitor already abandoned would reach it, and any side effect would
  // already have happened. Nothing is attached here either, so there is no
  // listener or timer to clean up.
  if (scope.signal.aborted) return outcomeForReason();

  let settled = false;

  // A named handler kept in scope so it can be removed explicitly on every
  // path — including the one where the work finishes first and the listener
  // would otherwise simply be abandoned. `{ once: true }` only detaches after
  // the event *fires*; the stated guarantee is that no listener outlives this
  // call at all, so the removal below is not redundant.
  let detachAbortListener: () => void = () => undefined;

  const abortPromise = new Promise<RaceOutcome<T>>((resolve) => {
    const onAbort = () => resolve(outcomeForReason());
    scope.signal.addEventListener("abort", onAbort, { once: true });
    detachAbortListener = () => scope.signal.removeEventListener("abort", onAbort);
  });

  try {
    // One microtask between registering the listener and invoking the adapter.
    //
    // Without it, a caller that aborts in the same JavaScript turn as the call
    // — `const pending = runWithAbortScope(scope, work); controller.abort();` —
    // still reaches the provider, because everything up to the first `await`
    // runs synchronously during the call itself. The abort then wins the race
    // and the outcome reads `cancelled`, which is *true but not the point*: a
    // search the visitor abandoned before yielding once has already been sent.
    //
    // Yielding lets that same-turn abort land first, so the adapter is never
    // invoked at all. It is not a timer, not an environment branch, not a
    // cache and not deduplication — a single microtask, after which the signal
    // is simply asked again.
    await Promise.resolve();
    if (scope.signal.aborted) return outcomeForReason();

    // The adapter is invoked *inside* the try, so a synchronous throw takes
    // the same path as an asynchronous rejection and still reaches the
    // `finally` that detaches the listener. Previously the call sat above the
    // try, and a synchronous throw escaped with the listener still attached.
    let workPromise: Promise<RaceOutcome<T>>;
    try {
      workPromise = work(scope.signal).then(
        (value): RaceOutcome<T> => {
          settled = true;
          return { kind: "completed", value };
        },
        (error: unknown): RaceOutcome<T> => {
          // If the scope already aborted, a rejection from the abandoned work
          // is expected fallout, not new information — swallow it and let the
          // abort outcome stand. Otherwise it is a genuine adapter fault and
          // must propagate to the orchestrator's own handler.
          if (scope.signal.aborted) return outcomeForReason();
          settled = true;
          throw error;
        },
      );
    } catch (error: unknown) {
      // A synchronous throw from the adapter, normalized into the ordinary
      // rejected-work path so exactly one kind of failure flows onward.
      settled = true;
      workPromise = Promise.reject(error);
    }

    const outcome = await Promise.race([workPromise, abortPromise]);

    // Whether or not the work won the race, its promise is already attached
    // to handlers above, so nothing it does afterwards can become unhandled.
    if (!settled) {
      void workPromise.catch(() => undefined);
    }

    return outcome;
  } finally {
    // Success, provider failure, synchronous throw, timeout and cancellation
    // all pass through here, so the listener is detached on every path —
    // including the one where it never fired.
    detachAbortListener();
  }
}
